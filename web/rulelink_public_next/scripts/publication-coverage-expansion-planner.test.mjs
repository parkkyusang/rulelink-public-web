import assert from 'node:assert/strict';
import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
} from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_COVERAGE_EXPANSION_PLAN_PATH,
  DEFAULT_COVERAGE_EXPANSION_PLAN_SCHEMA_PATH,
  DEFAULT_LEGAL_DOMAIN_TAXONOMY_PATH,
  buildPublicationCoverageExpansionPlan,
  legalAnswerActivationForTopic,
  publicationCoveragePlannerOptions,
  resolveNewDomainSeedAssignment,
  validatePublicationCoverageExpansionPlan,
} from './build-publication-coverage-expansion-plan.mjs';
import {
  DEFAULT_COVERAGE_MANIFEST_PATH,
  DEFAULT_PUBLICATION_BUNDLE_PATH,
  canonicalJson,
} from './publication-coverage-core.mjs';
import {
  DEFAULT_LEGAL_ANSWER_SCHEMA_PATH,
} from './validate-legal-answer-packets.mjs';
import {
  DEFAULT_SOURCE_MAINTENANCE_INVENTORY_TRUST_POLICY_PATH,
  appendPrerequisiteGateReceipts,
  buildCoverageSeedProductionContracts,
  loadQueuePublicationEvidence,
  synchronizeQueueItemRegistryFile,
  topicReceipt,
  verifyProductionQueueExternalEvidence,
} from './validate-publication-production-queue.mjs';
import {
  prepareProductionWorkRegistration,
} from './register-publication-production-work.mjs';
import {
  validateSourceMaintenanceInventoryEvidenceCore,
} from './source-maintenance-inventory-evidence-core.mjs';

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
const PRODUCTION_REGISTRY_PATH = path.join(
  REPOSITORY_ROOT,
  'artifacts',
  'publication',
  'production-queue-registry.json',
);

function gitBlobSha1(value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash('sha1')
    .update(Buffer.from(`blob ${body.length}\0`, 'utf8'))
    .update(body)
    .digest('hex');
}

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

test('생산 대기열 gate와 registry 영수증을 함께 위조해도 착수할 수 없다', async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-coverage-forged-queue-receipt-'),
  );
  try {
    const [queue, registry] = await Promise.all([
      readFile(PRODUCTION_QUEUE_PATH, 'utf8').then(JSON.parse),
      readFile(PRODUCTION_REGISTRY_PATH, 'utf8').then(JSON.parse),
    ]);
    const workId = 'reader-backfill-crime-victim-wave1';
    const gateId = 'runtime.statute-reading-ui';
    const item = queue.items.find(candidate => candidate.work_id === workId);
    const gate = item.prerequisite_gates.find(
      candidate => candidate.gate_id === gateId,
    );
    const receipt = registry.prerequisite_gate_receipts.find(
      candidate =>
        candidate.work_id === workId && candidate.gate_id === gateId,
    );
    gate.evidence_ref = 'forged:unverified';
    receipt.evidence_ref = gate.evidence_ref;
    receipt.previous_receipt = '0'.repeat(64);
    receipt.receipt = '0'.repeat(64);
    const queuePath = path.join(temporary, 'queue.json');
    const registryPath = path.join(temporary, 'registry.json');
    await Promise.all([
      writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`),
      writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`),
    ]);
    await assert.rejects(
      buildPublicationCoverageExpansionPlan({
        productionQueuePath: queuePath,
        productionRegistryPath: registryPath,
      }),
      /production queue trust validation failed/iu,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('신규 법영역 source 신뢰경계는 호출자 주입으로 영수증을 발급하지 않는다', async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-coverage-new-domain-transition-'),
  );
  const artifactRelative =
    'artifacts/publication/coverage/source-locator-selections/' +
    'constitutional-public.test.json';
  const artifactPath = path.join(REPOSITORY_ROOT, artifactRelative);
  try {
    const snapshotId = 'kr-knowledge-core-20260723-023';
    const workId = 'coverage-expansion-new-domain-constitutional-public';
    const topicId = 'hub.constitutional-public';
    const targetDomainId = 'target.constitutional-public';
    await mkdir(path.dirname(artifactPath), { recursive: true });
    const approvedBundle = JSON.parse(
      await readFile(DEFAULT_PUBLICATION_BUNDLE_PATH, 'utf8'),
    );
    const signingKey = generateKeyPairSync('ed25519');
    const issuer = 'rulelink-source-maintenance-test';
    const trustedRootCommitSha = '0'.repeat(40);
    const sourceCommitSha = '1'.repeat(40);
    const inventoryManifestPath =
      'artifacts/source-maintenance/public/source-inventory.json';
    const activeGraphPath =
      'artifacts/source-maintenance/public/active-source-graph.sqlite';
    const activeGraphRaw = Buffer.from(
      'approved-active-source-graph-fixture',
      'utf8',
    );
    const trustPolicy = {
      schema: 'rulelink_source_maintenance_inventory_trust_policy_v1',
      status: 'active',
      issuer,
      source_repository: 'parkkyusang/liale-rulelink-ir',
      trusted_root_commit_sha: trustedRootCommitSha,
      inventory_manifest_path: inventoryManifestPath,
      active_graph_path: activeGraphPath,
      keys: [
        {
          algorithm: 'Ed25519',
          key_id: 'source-maintenance-test-key',
          public_key_pem: signingKey.publicKey.export({
            type: 'spki',
            format: 'pem',
          }),
        },
      ],
    };
    const trustPolicyPath = path.join(
      temporary,
      'source-maintenance-trust-policy.json',
    );
    await writeFile(
      trustPolicyPath,
      `${JSON.stringify(trustPolicy, null, 2)}\n`,
    );
    const manifest = {
      schema: 'rulelink_source_maintenance_inventory_v1',
      inventory_id: 'inventory.constitutional-public.test',
      issuer,
      source_repository: trustPolicy.source_repository,
      source_commit_sha: sourceCommitSha,
      active_graph_sha256: createHash('sha256')
        .update(activeGraphRaw)
        .digest('hex'),
      generated_at: '2026-07-23T09:00:00Z',
      sources: Array.from({ length: 10 }, (_, index) => ({
        coordinate_id:
          `coord.constitutional-public.approved-${String(index + 1).padStart(2, '0')}`,
        source_id:
          `constitutional_public_approved_${String(index + 1).padStart(2, '0')}`,
        source_snapshot_id: createHash('sha256')
          .update(`constitutional-public-${index + 1}`)
          .digest('hex')
          .slice(0, 32),
        law_name_ko: `헌법·공법 승인 근거 ${index + 1}`,
        article_no: `제${index + 1}조`,
        official_url:
          `https://www.law.go.kr/법령/헌법공법시험/${index + 1}`,
        last_verified_at: '2026-07-23T09:00:00Z',
        target_domain_ids: [targetDomainId],
      })),
    };
    const remoteManifestRaw = Buffer.from(
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    const sourceFetchJson = async url => {
      if (
        url.includes(
          `/compare/${trustedRootCommitSha}...${sourceCommitSha}`,
        )
      ) {
        return {status: 'ahead', ahead_by: 1};
      }
      if (
        url.includes(
          `/contents/${inventoryManifestPath}?ref=${sourceCommitSha}`,
        )
      ) {
        return {
          type: 'file',
          path: inventoryManifestPath,
          encoding: 'base64',
          content: remoteManifestRaw.toString('base64'),
          size: remoteManifestRaw.length,
          sha: gitBlobSha1(remoteManifestRaw),
        };
      }
      throw new Error(`unexpected source provenance URL: ${url}`);
    };
    const sourceFetchBytes = async url => {
      assert.equal(
        url,
        `https://raw.githubusercontent.com/${trustPolicy.source_repository}/` +
          `${sourceCommitSha}/${activeGraphPath}`,
      );
      return activeGraphRaw;
    };
    const sourceMaintenanceReadFile = async (candidate, ...args) => {
      if (
        path.resolve(candidate) ===
        path.resolve(DEFAULT_SOURCE_MAINTENANCE_INVENTORY_TRUST_POLICY_PATH)
      ) {
        return readFile(trustPolicyPath, ...args);
      }
      return readFile(candidate, ...args);
    };
    const inventorySignature = signBytes(
      null,
      Buffer.from(canonicalJson(manifest), 'utf8'),
      signingKey.privateKey,
    ).toString('base64');
    const selectedCoordinateIds = manifest.sources.map(
      source => source.coordinate_id,
    );
    const artifact = {
      schema: 'rulelink_source_locator_selection_v2',
      work_id: workId,
      topic_id: topicId,
      target_domain_id: targetDomainId,
      inventory_manifest: manifest,
      inventory_signature: {
        algorithm: 'Ed25519',
        issuer,
        key_id: trustPolicy.keys[0].key_id,
        signature_base64: inventorySignature,
      },
      selected_coordinate_ids: selectedCoordinateIds,
    };
    const artifactRaw = Buffer.from(
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
    await writeFile(artifactPath, artifactRaw);
    const artifactSha256 = createHash('sha256')
      .update(artifactRaw)
      .digest('hex');
    const gateId = 'source-maintenance.source-locators-selected';
    const evidenceRef =
      `source-locator-selection:${workId}@sha256:${artifactSha256}`;
    const coreInput = {
      workId,
      evidenceRef,
      artifactRaw,
      trustPolicyRaw: Buffer.from(
        `${JSON.stringify(trustPolicy, null, 2)}\n`,
        'utf8',
      ),
      remoteManifestRaw,
      activeGraphRaw,
      ancestryComparison: {status: 'ahead', ahead_by: 1},
      auditedOn: '2026-07-23',
      expectedTopicId: topicId,
      expectedTargetDomainId: targetDomainId,
      expectedSourceCount: 10,
      expectedArtifactSha256: artifactSha256,
    };
    const coreVerified =
      validateSourceMaintenanceInventoryEvidenceCore(coreInput);
    assert.match(coreVerified.proof, /^[0-9a-f]{64}$/u);
    assert.equal(coreVerified.selection.locators.length, 10);
    assert.equal(
      Object.getOwnPropertySymbols(coreVerified).length,
      0,
      '순수 코어 결과에는 queue 영수증 발급 브랜드가 없어야 한다',
    );
    assert.throws(
      () =>
        validateSourceMaintenanceInventoryEvidenceCore({
          ...coreInput,
          activeGraphRaw: Buffer.from('forged-active-graph', 'utf8'),
        }),
      /active graph 원시 바이트 해시가 다릅니다/iu,
    );
    const forgedRemoteManifest = structuredClone(manifest);
    forgedRemoteManifest.sources[0].source_snapshot_id =
      'forged-remote-row';
    assert.throws(
      () =>
        validateSourceMaintenanceInventoryEvidenceCore({
          ...coreInput,
          remoteManifestRaw: Buffer.from(
            `${JSON.stringify(forgedRemoteManifest, null, 2)}\n`,
            'utf8',
          ),
        }),
      /승인 commit 원시 행과 다릅니다/iu,
    );
    assert.throws(
      () =>
        validateSourceMaintenanceInventoryEvidenceCore({
          ...coreInput,
          ancestryComparison: {status: 'diverged', ahead_by: 0},
        }),
      /승인 root의 후손이 아닙니다/iu,
    );

    const signedCoreInputForManifest = nextManifest => {
      const nextSignature = signBytes(
        null,
        Buffer.from(canonicalJson(nextManifest), 'utf8'),
        signingKey.privateKey,
      ).toString('base64');
      const nextArtifact = {
        ...structuredClone(artifact),
        inventory_manifest: nextManifest,
        inventory_signature: {
          ...artifact.inventory_signature,
          signature_base64: nextSignature,
        },
      };
      const nextArtifactRaw = Buffer.from(
        `${JSON.stringify(nextArtifact, null, 2)}\n`,
        'utf8',
      );
      const nextArtifactSha256 = createHash('sha256')
        .update(nextArtifactRaw)
        .digest('hex');
      return {
        ...coreInput,
        evidenceRef:
          `source-locator-selection:${workId}` +
          `@sha256:${nextArtifactSha256}`,
        artifactRaw: nextArtifactRaw,
        remoteManifestRaw: Buffer.from(
          `${JSON.stringify(nextManifest, null, 2)}\n`,
          'utf8',
        ),
        expectedArtifactSha256: nextArtifactSha256,
      };
    };
    const nextDayManifest = structuredClone(manifest);
    nextDayManifest.generated_at = '2026-07-24T00:00:00Z';
    assert.throws(
      () =>
        validateSourceMaintenanceInventoryEvidenceCore(
          signedCoreInputForManifest(nextDayManifest),
        ),
      /inventory 구조 오류/iu,
      '감사일 다음 날 생성된 inventory는 거부해야 한다',
    );
    const nextDayLocatorManifest = structuredClone(manifest);
    nextDayLocatorManifest.sources[0].last_verified_at =
      '2026-07-24T00:00:00Z';
    assert.throws(
      () =>
        validateSourceMaintenanceInventoryEvidenceCore(
          signedCoreInputForManifest(nextDayLocatorManifest),
        ),
      /locator가 승인 범위를 벗어났습니다/iu,
      '감사일 다음 날 확인한 locator는 거부해야 한다',
    );
    const [baseQueue, baseRegistry] = await Promise.all([
      readFile(PRODUCTION_QUEUE_PATH, 'utf8').then(JSON.parse),
      readFile(PRODUCTION_REGISTRY_PATH, 'utf8').then(JSON.parse),
    ]);
    const prepared = prepareProductionWorkRegistration(
      baseQueue,
      baseRegistry,
      [workId],
    );
    const queue = prepared.queue;
    let registry = prepared.registry;
    const item = queue.items.find(candidate => candidate.work_id === workId);
    const gate = item.prerequisite_gates.find(
      candidate => candidate.gate_id === gateId,
    );
    Object.assign(gate, {
      status: 'satisfied',
      evidence_ref: evidenceRef,
    });
    item.source_locator_selection = {
      gate_id: gateId,
      artifact_path: artifactRelative,
      artifact_sha256: artifactSha256,
    };
    assert.throws(
      () =>
        appendPrerequisiteGateReceipts(registry, queue, {
          verifiedEvidence: coreVerified,
        }),
      /실제 외부 사실 검증 없이/iu,
      '순수 코어 결과는 production 영수증 브랜드를 대신할 수 없다',
    );
    const queuePath = path.join(temporary, 'queue.json');
    const registryPath = path.join(temporary, 'registry.json');
    await Promise.all([
      writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`),
      writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`),
    ]);
    const selfIssuedRegistry = structuredClone(registry);
    const selfIssuedReceipt = {
      sequence:
        selfIssuedRegistry.prerequisite_gate_receipts.length + 1,
      work_id: workId,
      gate_id: gateId,
      evidence_ref: evidenceRef,
      verified_by_role: 'source_maintenance',
      verification_method: 'source_locator_selection_v2',
      verification_proof: 'f'.repeat(64),
      verified_on: queue.audited_on,
      previous_receipt:
        selfIssuedRegistry.prerequisite_gate_receipt,
      verification_contract:
        'rulelink_source_locator_selection_verification_v2',
    };
    selfIssuedReceipt.receipt = topicReceipt(selfIssuedReceipt);
    selfIssuedRegistry.prerequisite_gate_receipts.push(
      selfIssuedReceipt,
    );
    selfIssuedRegistry.prerequisite_gate_receipt =
      selfIssuedReceipt.receipt;
    await writeFile(
      registryPath,
      `${JSON.stringify(selfIssuedRegistry, null, 2)}\n`,
    );
    const domain = {
      target_domain_id: targetDomainId,
      coverage_state: 'not_started',
    };
    await assert.rejects(
      verifyProductionQueueExternalEvidence(queue, {
        registry,
        readFile: sourceMaintenanceReadFile,
        fetchJson: sourceFetchJson,
        fetchBytes: sourceFetchBytes,
      }),
      /trust policy가 활성 정본이 아닙니다/iu,
      '영수증 발급기는 호출자 제공 policy·원격 응답을 신뢰하지 않는다',
    );
    await assert.rejects(
      loadQueuePublicationEvidence(queue, approvedBundle, {
        itemRegistry: selfIssuedRegistry,
        readFile: sourceMaintenanceReadFile,
        fetchJson: sourceFetchJson,
        fetchBytes: sourceFetchBytes,
      }),
      /trust policy가 활성 정본이 아닙니다/iu,
      '브랜드 발급기는 호출자 제공 policy·원격 응답을 신뢰하지 않는다',
    );
    await assert.rejects(
      synchronizeQueueItemRegistryFile(registryPath, queue, {
        previousRegistry: selfIssuedRegistry,
        evidence: {
          readFile: sourceMaintenanceReadFile,
          fetchJson: sourceFetchJson,
          fetchBytes: sourceFetchBytes,
        },
      }),
      /trust policy가 활성 정본이 아닙니다/iu,
      'registry 쓰기 API도 호출자 제공 source trust 입출력으로 영수증을 만들 수 없다',
    );
    const resolved = await resolveNewDomainSeedAssignment({
      domain,
      queue,
      registry,
      snapshotId,
      builtAt: '2026-07-25T00:00:00Z',
      repositoryRoot: REPOSITORY_ROOT,
    });
    assert.equal(resolved.assignment.assignment_state, 'existing_queue_assignment');
    assert.equal(resolved.assignment.start_allowed, false);
    assert.equal(resolved.sourceLocatorState, 'selection_required');
    assert.equal(resolved.requiredSourceLocators.length, 0);
    await assert.rejects(
      buildPublicationCoverageExpansionPlan({
        productionQueuePath: queuePath,
        productionRegistryPath: registryPath,
        sourceMaintenanceTrustPolicyPath: trustPolicyPath,
      }),
      /trust policy가 활성 정본이 아닙니다|trust validation/iu,
      '공개 planner 호출자는 정본 policy 경로를 다른 키로 바꿀 수 없다',
    );
    assert.deepEqual(resolved.assignment.blocking_reasons, [
      `gate_receipt_missing:${gateId}`,
      'source_locator_selection_revalidation_required',
    ]);
  } finally {
    await rm(artifactPath, { force: true });
    await rm(temporary, { recursive: true, force: true });
  }
});

test('seed 생산계약은 not_started에서 started로 전환된 뒤에도 append-only 이력을 보존한다', async () => {
  const taxonomy = JSON.parse(
    await readFile(DEFAULT_LEGAL_DOMAIN_TAXONOMY_PATH, 'utf8'),
  );
  const workId =
    'coverage-expansion-new-domain-constitutional-public';
  assert.ok(buildCoverageSeedProductionContracts(taxonomy)[workId]);

  const migrated = structuredClone(taxonomy);
  const target = migrated.target_domain_horizon.find(
    domain =>
      domain.target_domain_id === 'target.constitutional-public',
  );
  target.current_hub_ids = ['hub.constitutional-public'];
  assert.ok(
    buildCoverageSeedProductionContracts(migrated)[workId],
    'started 전환은 과거 queue/registry가 참조하는 계약 identity를 삭제하지 않는다',
  );

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
      /source_snapshot_id|minLength|temporal|source version|production queue trust validation failed/iu,
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

test('목표 법영역 ID가 승인된 소유경로 밖으로 이탈하지 못한다', async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-coverage-taxonomy-boundary-'),
  );
  try {
    const original = JSON.parse(
      await readFile(DEFAULT_LEGAL_DOMAIN_TAXONOMY_PATH, 'utf8'),
    );
    const unsafe = structuredClone(original);
    unsafe.target_domain_horizon[0].target_domain_id =
      'target.foo/../../current/bundle';
    const unsafePath = path.join(temporary, 'unsafe.json');
    await writeFile(unsafePath, `${JSON.stringify(unsafe, null, 2)}\n`);
    await assert.rejects(
      buildPublicationCoverageExpansionPlan({
        legalDomainTaxonomyPath: unsafePath,
      }),
      /target domain horizon identity invalid/iu,
    );
    const reserved = structuredClone(original);
    reserved.target_domain_horizon[0].target_domain_id = 'target.con';
    const reservedPath = path.join(temporary, 'reserved.json');
    await writeFile(
      reservedPath,
      `${JSON.stringify(reserved, null, 2)}\n`,
    );
    await assert.rejects(
      buildPublicationCoverageExpansionPlan({
        legalDomainTaxonomyPath: reservedPath,
      }),
      /target domain horizon identity invalid/iu,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('inactive 상태에서도 legal-answer vendored 계약 오류를 계획에서 무시하지 않는다', async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-coverage-inactive-answer-contract-'),
  );
  try {
    const schemaPath = path.join(temporary, 'forged-schema.json');
    const schemaRaw = await readFile(DEFAULT_LEGAL_ANSWER_SCHEMA_PATH, 'utf8');
    await writeFile(schemaPath, `${schemaRaw}\n`);
    await assert.rejects(
      buildPublicationCoverageExpansionPlan({ schemaPath }),
      /legal answer packet gate invalid:.*schema_sha256/isu,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('coverage 계획과 legal-answer 게이트는 같은 정본 bundle 경로를 공유한다', () => {
  assert.equal(
    publicationCoveragePlannerOptions({}).bundlePath,
    DEFAULT_PUBLICATION_BUNDLE_PATH,
  );
  assert.equal(
    publicationCoveragePlannerOptions({}).productionQueueBundlePath,
    DEFAULT_PUBLICATION_BUNDLE_PATH,
  );
  const explicitBundlePath = path.join(
    os.tmpdir(),
    'rulelink-explicit-publication-bundle.json',
  );
  assert.deepEqual(
    publicationCoveragePlannerOptions({
      bundlePath: explicitBundlePath,
      marker: 'preserved',
    }),
    {
      bundlePath: explicitBundlePath,
      marker: 'preserved',
      productionQueueBundlePath: explicitBundlePath,
    },
  );
  const explicitQueueBundlePath = path.join(
    os.tmpdir(),
    'rulelink-explicit-queue-bundle.json',
  );
  assert.deepEqual(
    publicationCoveragePlannerOptions({
      bundlePath: explicitBundlePath,
      productionQueueBundlePath: explicitQueueBundlePath,
    }),
    {
      bundlePath: explicitBundlePath,
      productionQueueBundlePath: explicitQueueBundlePath,
    },
  );
});
