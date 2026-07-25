import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_COVERAGE_EXPANSION_PLAN_PATH,
  DEFAULT_COVERAGE_EXPANSION_PLAN_SCHEMA_PATH,
  DEFAULT_LEGAL_DOMAIN_TAXONOMY_PATH,
  buildPublicationCoverageExpansionPlan,
  legalAnswerActivationForTopic,
  validatePublicationCoverageExpansionPlan,
} from './build-publication-coverage-expansion-plan.mjs';
import {
  DEFAULT_COVERAGE_MANIFEST_PATH,
  DEFAULT_PUBLICATION_BUNDLE_PATH,
  canonicalJson,
} from './publication-coverage-core.mjs';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1')),
  '..',
  '..',
  '..',
);
const PRODUCTION_QUEUE_PATH = path.join(
  REPOSITORY_ROOT,
  'artifacts',
  'publication',
  'production-queue.json',
);

test('28허브·284콘텐츠를 9개 법영역과 독립 점수축으로 전수 계획한다', async () => {
  const plan = await buildPublicationCoverageExpansionPlan();

  assert.equal(
    plan.schema,
    'rulelink_publication_coverage_expansion_plan_v1',
  );
  assert.deepEqual(plan.denominator, {
    hub_count: 28,
    content_count: 284,
    rule_count: 278,
    scenario_count: 247,
    source_count: 425,
    domain_count: 9,
    target_domain_count: 21,
    change_brief_count: 11,
  });
  assert.equal(plan.content_assessments.length, 284);
  assert.equal(plan.task_packets.length, 36);
  assert.equal(new Set(plan.content_assessments.map((item) => item.content_id)).size, 284);
  assert.equal(new Set(plan.task_packets.map((item) => item.topic_id)).size, 36);
  assert.equal(
    plan.taxonomy.reduce((total, domain) => total + domain.hub_ids.length, 0),
    28,
  );
  assert.equal(
    plan.taxonomy.reduce((total, domain) => total + domain.content_count, 0),
    284,
  );
  assert.equal(plan.target_domain_horizon.length, 21);
  assert.equal(plan.summary.target_domain_started_count, 13);
  assert.equal(plan.summary.target_domain_not_started_count, 8);
  assert.equal(plan.summary.new_domain_seed_task_count, 8);
  assert.equal(
    plan.target_domain_horizon
      .filter(domain => domain.coverage_state === 'not_started')
      .every(
        domain =>
          domain.current_hub_ids.length === 0 &&
          domain.current_content_count === 0,
      ),
    true,
  );
  const horizonHubIds = new Set(
    plan.target_domain_horizon.flatMap(domain => domain.current_hub_ids),
  );
  assert.equal(horizonHubIds.size, 28);
  assert.equal(
    plan.honesty.current_publication_and_target_horizon_are_separate_denominators,
    true,
  );
  assert.equal(plan.honesty.target_domain_started_is_not_domain_complete, true);
  assert.equal(plan.demand_availability, 'not_provided');
  assert.deepEqual(plan.legal_answer_activation, {
    state: 'inactive',
    manifest_sha256: plan.legal_answer_activation.manifest_sha256,
    expected_packet_count: 0,
    expected_packet_ids: [],
    target_topic_ids: [],
    gate_receipt_id: '',
  });
  assert.equal(
    plan.task_packets.every(
      packet =>
        packet.dependencies.legal_answer_packet_gate === 'not_activated',
    ),
    true,
  );
  assert.equal(
    plan.content_assessments.every(
      (item) =>
        item.scores.user_demand.status === 'not_provided' &&
        item.scores.user_demand.not_used_for_legal_accuracy,
    ),
    true,
  );
});

test('신뢰검증된 활성화 투영만 대상 topic의 packet release gate를 추가한다', () => {
  const activation = {
    state: 'active',
    manifest: {
      target_topic_ids: ['hub.crime-victim-response'],
    },
  };
  assert.deepEqual(
    legalAnswerActivationForTopic(
      activation,
      'hub.crime-victim-response',
    ),
    {
      gate: 'satisfied',
      releaseRequirements: ['activated_legal_answer_packet_receipt'],
    },
  );
  assert.deepEqual(
    legalAnswerActivationForTopic(activation, 'hub.debt-enforcement'),
    {
      gate: 'not_activated',
      releaseRequirements: [],
    },
  );
});

test('계획 결과는 같은 정본 입력에서 canonical bytes가 결정론적이다', async () => {
  const first = await buildPublicationCoverageExpansionPlan();
  const second = await buildPublicationCoverageExpansionPlan();

  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(
    createHash('sha256').update(canonicalJson(first)).digest('hex'),
    createHash('sha256').update(canonicalJson(second)).digest('hex'),
  );
  await validatePublicationCoverageExpansionPlan();
});

test('CodexTaskPacket은 소유경로·금지경로·source locator와 migration gate를 닫는다', async () => {
  const plan = await buildPublicationCoverageExpansionPlan();

  for (const packet of plan.task_packets) {
    assert.equal(packet.schema, 'rulelink_codex_task_packet_v1');
    assert.deepEqual(packet.owned_paths, [
      packet.topic_file,
      packet.self_test_file,
    ].sort());
    assert.equal(packet.forbidden_paths.includes('artifacts/publication/current/**'), true);
    assert.equal(packet.forbidden_paths.includes('artifacts/publication/snapshots/**'), true);
    if (packet.work_kind === 'existing_topic_backfill') {
      assert.equal(packet.source_locator_state, 'bound');
      assert.equal(packet.required_source_locators.length > 0, true);
      assert.equal(
        packet.required_source_locators.every(
          (source) =>
            source.coordinate_id &&
            source.source_id &&
            source.source_snapshot_id &&
            source.last_verified_at,
        ),
        true,
      );
    } else {
      assert.equal(packet.work_kind, 'new_domain_seed');
      assert.equal(packet.source_locator_state, 'selection_required');
      assert.deepEqual(packet.required_source_locators, []);
      assert.equal(
        packet.blocking_reasons.includes(
          'source_locator_selection_required',
        ),
        true,
      );
    }
    assert.equal(packet.dependencies.migration_required, true);
    assert.equal(
      packet.expected_backlog_delta.verified_release_delta_before_migration,
      0,
    );
    assert.deepEqual(packet.expected_backlog_delta.verified_release_requires, [
      'current_bundle',
      'new_immutable_snapshot',
      'trusted_release_receipts',
    ]);
  }
  assert.equal(plan.summary.verified_release_count, 0);
});

test('미등록 작업과 Wave2는 막고 영수증이 닫힌 Wave1만 시작 허용한다', async () => {
  const plan = await buildPublicationCoverageExpansionPlan();
  const wave1 = plan.task_packets.find(
    (packet) => packet.work_id === 'reader-backfill-crime-victim-wave1',
  );
  const wave2 = plan.task_packets.find(
    (packet) => packet.work_id === 'reader-backfill-debt-enforcement-wave2',
  );
  const proposed = plan.task_packets.filter(
    (packet) => packet.assignment_state === 'proposed_unregistered',
  );

  assert.equal(wave1.assignment_state, 'existing_queue_assignment');
  assert.equal(wave1.start_allowed, true);
  assert.equal(wave1.blocking_reasons.length, 0);
  assert.equal(wave1.dependencies.receipt_dependency_ids.length, 7);
  assert.equal(wave2.start_allowed, false);
  assert.deepEqual(wave2.blocking_reasons, [
    'gate_pending:wave1.crime-victim-complete',
    'work_dependency_incomplete:reader-backfill-crime-victim-wave1',
  ]);
  assert.equal(proposed.length, 34);
  assert.equal(
    proposed.every(
      (packet) =>
        !packet.start_allowed &&
        packet.blocking_reasons.includes(
          'production_queue_registration_required',
        ),
    ),
    true,
  );
});

test('동일 topic 활성 작업의 중복 배정을 fail-closed로 차단한다', async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-coverage-duplicate-assignment-'),
  );
  try {
    const queue = JSON.parse(await readFile(PRODUCTION_QUEUE_PATH, 'utf8'));
    const original = queue.items.find(
      (item) => item.work_id === 'reader-backfill-crime-victim-wave1',
    );
    queue.items.push({
      ...original,
      queue_id: `${original.queue_id}-duplicate`,
      work_id: `${original.work_id}-duplicate`,
    });
    const queuePath = path.join(temporary, 'queue.json');
    await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`);

    await assert.rejects(
      buildPublicationCoverageExpansionPlan({
        productionQueuePath: queuePath,
      }),
      /duplicate active topic assignment:hub\.crime-victim-response/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('source snapshot·검증시각이 빠진 authority locator는 생성하지 않는다', async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-coverage-missing-authority-'),
  );
  try {
    const bundle = JSON.parse(
      await readFile(DEFAULT_PUBLICATION_BUNDLE_PATH, 'utf8'),
    );
    const manifest = JSON.parse(
      await readFile(DEFAULT_COVERAGE_MANIFEST_PATH, 'utf8'),
    );
    bundle.knowledge.sources[0].source_snapshot_id = '';
    bundle.knowledge.sources[0].last_verified_at = '';
    const bundleText = `${JSON.stringify(bundle, null, 2)}\n`;
    manifest.base_bundle_sha256 = createHash('sha256')
      .update(bundleText)
      .digest('hex');
    const bundlePath = path.join(temporary, 'bundle.json');
    const manifestPath = path.join(temporary, 'manifest.json');
    await writeFile(bundlePath, bundleText);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      buildPublicationCoverageExpansionPlan({ bundlePath, manifestPath }),
      /source_snapshot_id|minLength|temporal|source version/iu,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('stale plan·unknown field·분모 변조를 스키마와 current drift로 거부한다', async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-coverage-plan-mutation-'),
  );
  try {
    const actual = JSON.parse(
      await readFile(DEFAULT_COVERAGE_EXPANSION_PLAN_PATH, 'utf8'),
    );
    actual.generated_from.snapshot_id = 'stale-snapshot';
    actual.denominator.content_count = 283;
    actual.task_packets[0].unexpected = true;
    const alteredPath = path.join(temporary, 'altered.json');
    await writeFile(alteredPath, `${JSON.stringify(actual, null, 2)}\n`);

    await assert.rejects(
      validatePublicationCoverageExpansionPlan({
        coverageExpansionPlanPath: alteredPath,
      }),
      /schema invalid|semantic invalid|drift detected/u,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('GSC는 선택 수요신호로만 결합되고 법률·구조 점수를 바꾸지 않는다', async () => {
  const baseline = await buildPublicationCoverageExpansionPlan();
  const target = baseline.content_assessments[0];
  const bundle = JSON.parse(
    await readFile(DEFAULT_PUBLICATION_BUNDLE_PATH, 'utf8'),
  );
  const entry = bundle.knowledge.content_entries.find(
    (item) => item.content_id === target.content_id,
  );
  const baseUrl = 'https://planner-fixture.example';
  const gscRows = [
    {
      query: '실측 질의',
      page: `${baseUrl}/ko/knowledge/${entry.slug}`,
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      position: 4,
    },
  ];
  const measured = await buildPublicationCoverageExpansionPlan({
    gscRows,
    baseUrl,
  });
  const measuredTarget = measured.content_assessments.find(
    (item) => item.content_id === target.content_id,
  );

  assert.equal(measured.demand_availability, 'provided');
  assert.deepEqual(measuredTarget.scores.user_demand, {
    status: 'measured',
    not_used_for_legal_accuracy: true,
    impressions: 20,
    clicks: 2,
    query_count: 1,
  });
  assert.deepEqual(measuredTarget.scores.fatal_risk, target.scores.fatal_risk);
  assert.deepEqual(
    measuredTarget.scores.structural_gap,
    target.scores.structural_gap,
  );
  assert.deepEqual(
    measuredTarget.scores.authority_readiness,
    target.scores.authority_readiness,
  );
  assert.deepEqual(
    measuredTarget.scores.source_freshness,
    target.scores.source_freshness,
  );
  await assert.rejects(
    buildPublicationCoverageExpansionPlan({ gscRows }),
    /GSC input requires explicit baseUrl/,
  );
});

test('법령변화 snapshot은 source→Rule·Scenario·Content 영향으로 역추적한다', async () => {
  const plan = await buildPublicationCoverageExpansionPlan();

  assert.equal(plan.maintenance_queue.length, 23);
  assert.equal(
    new Set(plan.maintenance_queue.map((item) => item.maintenance_id)).size,
    plan.maintenance_queue.length,
  );
  assert.equal(
    plan.maintenance_queue.every(
      (item) =>
        item.old_snapshot_ids.length + item.new_snapshot_ids.length > 0 &&
        item.claim_projection_state === 'not_provided' &&
        item.affected_claim_ids.length === 0,
    ),
    true,
  );
  assert.equal(
    plan.maintenance_queue.some(
      (item) =>
        item.affected_content_ids.length > 0 &&
        item.topic_ids.length > 0 &&
        item.observed_snapshot_ids.length > 0,
    ),
    true,
  );
});

test('taxonomy와 planner schema 자체의 누락·변조도 정본 hash에서 닫힌다', async () => {
  const plan = await buildPublicationCoverageExpansionPlan();
  const taxonomy = JSON.parse(
    await readFile(DEFAULT_LEGAL_DOMAIN_TAXONOMY_PATH, 'utf8'),
  );
  const schema = JSON.parse(
    await readFile(DEFAULT_COVERAGE_EXPANSION_PLAN_SCHEMA_PATH, 'utf8'),
  );

  assert.equal(plan.generated_from.taxonomy_sha256.length, 64);
  assert.equal(plan.schema_sha256.length, 64);
  assert.equal(taxonomy.domains.length, 9);
  assert.equal(taxonomy.target_domain_horizon.length, 21);
  assert.equal(
    schema.$id,
    'urn:rulelink:schema:publication-coverage-expansion-plan:v1',
  );
});
