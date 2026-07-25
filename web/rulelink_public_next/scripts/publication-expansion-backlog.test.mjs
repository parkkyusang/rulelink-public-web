import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_EXPANSION_BACKLOG_PATH,
  DEFAULT_EXPANSION_BACKLOG_SCHEMA_PATH,
  buildPublicationExpansionBacklog,
  coverageState,
  entryGaps,
  readinessState,
  validatePublicationExpansionBacklog,
} from './build-publication-expansion-backlog.mjs';
import {
  DEFAULT_COVERAGE_MANIFEST_PATH,
  DEFAULT_PUBLICATION_BUNDLE_PATH,
  canonicalSha256,
} from './publication-coverage-core.mjs';

test('023 전체 콘텐츠와 허브를 누락 없이 결정론적 확장 백로그로 만든다', async () => {
  const backlog = await buildPublicationExpansionBacklog();

  assert.equal(backlog.schema, 'rulelink_publication_expansion_backlog_v1');
  assert.equal(backlog.snapshot_id, 'kr-knowledge-core-20260723-023');
  assert.equal(backlog.content_count, 284);
  assert.equal(backlog.hub_count, 28);
  assert.deepEqual(backlog.summary, {
    coverage_declared: 5,
    coverage_unmapped: 279,
    declared_incomplete: 5,
    graph_ready_unmapped: 220,
    structure_incomplete: 59,
    verified_release: 0,
  });
  assert.equal(
    new Set(backlog.entries.map((entry) => entry.content_id)).size,
    284,
  );
  assert.equal(new Set(backlog.hubs.map((hub) => hub.hub_id)).size, 28);
  assert.equal(
    backlog.hubs.reduce((sum, hub) => sum + hub.content_count, 0),
    284,
  );
  assert.equal(
    backlog.entries.every(
      (entry) =>
        /^[a-f0-9]{64}$/.test(entry.content_revision_sha256) &&
        entry.hub_ids.length > 0 &&
        entry.next_action.length > 0,
    ),
    true,
  );
});

test('백로그는 법률 정확성과 수요·그래프 준비도를 혼동하지 않는다', async () => {
  const backlog = await buildPublicationExpansionBacklog();

  assert.deepEqual(backlog.honesty, {
    demand_is_not_legal_accuracy: true,
    declared_coverage_is_not_verified_release: true,
    graph_readiness_is_not_legal_verification: true,
    no_legal_priority_is_inferred: true,
    release_state_is_derived_from_trusted_receipts: true,
  });
  assert.equal(
    backlog.entries
      .filter((entry) => entry.coverage_state === 'coverage_declared')
      .every(
        (entry) =>
          entry.readiness_state === 'declared_incomplete' &&
          entry.gap_codes.includes('release_evidence_missing'),
      ),
    true,
  );
  assert.equal(
    backlog.entries
      .filter((entry) => entry.readiness_state === 'graph_ready_unmapped')
      .every(
        (entry) =>
          entry.coverage_state === 'unmapped' &&
          entry.gap_codes.includes('coverage_not_declared'),
      ),
    true,
  );
});

test('추적 산출물의 누락·수정·스냅샷 드리프트를 fail-closed로 막는다', async () => {
  await validatePublicationExpansionBacklog();

  const tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-expansion-backlog-'),
  );
  try {
    const alteredPath = path.join(tempDirectory, 'altered.json');
    const actual = JSON.parse(
      await readFile(DEFAULT_EXPANSION_BACKLOG_PATH, 'utf8'),
    );
    actual.entries[0].hub_ids = [];
    await writeFile(alteredPath, `${JSON.stringify(actual)}\n`, 'utf8');

    await assert.rejects(
      validatePublicationExpansionBacklog({
        expansionBacklogPath: alteredPath,
      }),
      /publication expansion backlog schema invalid/,
    );
    await assert.rejects(
      validatePublicationExpansionBacklog({
        expansionBacklogPath: path.join(tempDirectory, 'missing.json'),
      }),
      /publication expansion backlog missing or invalid/,
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('미매핑 콘텐츠도 Rule·Scenario·Source·Hub 양방향 폐쇄를 통과해야 한다', async () => {
  const tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-expansion-graph-'),
  );
  try {
    const bundle = JSON.parse(
      await readFile(DEFAULT_PUBLICATION_BUNDLE_PATH, 'utf8'),
    );
    const manifest = JSON.parse(
      await readFile(DEFAULT_COVERAGE_MANIFEST_PATH, 'utf8'),
    );
    const mappedIds = new Set(
      (await buildPublicationExpansionBacklog()).entries
        .filter((entry) => entry.coverage_state !== 'unmapped')
        .map((entry) => entry.content_id),
    );
    const target = bundle.knowledge.content_entries.find(
      (entry) => !mappedIds.has(entry.content_id),
    );
    target.hub_ids = [];
    target.rule_ids = ['rule.does-not-exist'];
    const bundleText = `${JSON.stringify(bundle, null, 2)}\n`;
    manifest.base_bundle_sha256 = createHash('sha256')
      .update(bundleText)
      .digest('hex');
    const bundlePath = path.join(tempDirectory, 'bundle.json');
    const manifestPath = path.join(tempDirectory, 'manifest.json');
    await writeFile(bundlePath, bundleText, 'utf8');
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    await assert.rejects(
      buildPublicationExpansionBacklog({ bundlePath, manifestPath }),
      /publication expansion input graph invalid/,
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('경험 필드와 분기가 열려 있으면 영수증만으로 출시 완료가 되지 않는다', () => {
  const observations = [
    {
      authority_level: 'L2_locator',
      branch_closed: false,
      coverage_release_verified: true,
      evaluation_cases_declared_count: 1,
      evaluation_results_verified_count: 1,
      experience_fields_complete: false,
      temporal_authority_verified: true,
    },
  ];
  const entry = {
    audience_situation_ko: '',
    one_line_answer_ko: '답',
    facts_to_check_ko: ['사실'],
    action_steps_ko: ['행동'],
    rule_ids: ['rule.one'],
    scenario_ids: ['scenario.one'],
    source_coordinate_ids: ['coord.one'],
  };
  const state = coverageState(observations);
  const gaps = entryGaps(entry, observations);

  assert.equal(state, 'coverage_declared');
  assert.equal(gaps.includes('audience_situation_missing'), true);
  assert.equal(gaps.includes('branch_closure_incomplete'), true);
  assert.equal(
    readinessState(entry, observations, state, gaps),
    'declared_incomplete',
  );
});

test('스키마 정본 자체가 바뀌면 artifact hash와 검증도 함께 닫힌다', async () => {
  const backlog = await buildPublicationExpansionBacklog();
  const schema = JSON.parse(
    await readFile(DEFAULT_EXPANSION_BACKLOG_SCHEMA_PATH, 'utf8'),
  );
  assert.equal(
    backlog.schema_sha256,
    canonicalSha256(schema),
  );
});
