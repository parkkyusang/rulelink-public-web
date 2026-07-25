import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_EXPANSION_BACKLOG_PATH,
  buildPublicationExpansionBacklog,
  validatePublicationExpansionBacklog,
} from './build-publication-expansion-backlog.mjs';

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
    actual.entries[0].coverage_state = 'verified_release';
    await writeFile(alteredPath, `${JSON.stringify(actual)}\n`, 'utf8');

    await assert.rejects(
      validatePublicationExpansionBacklog({
        expansionBacklogPath: alteredPath,
      }),
      /publication expansion backlog drift detected/,
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
