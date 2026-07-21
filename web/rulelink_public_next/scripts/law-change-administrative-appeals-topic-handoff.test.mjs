import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicDirectory = path.join(repositoryRoot, 'artifacts', 'publication', 'topics');
const handoffFile = 'law-change-briefs-administrative-appeals.json';
const handoffPath = path.join(topicDirectory, handoffFile);
const sourceSnapshotPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'snapshots',
  'kr-knowledge-core-20260721-020',
  'bundle.json',
);
const briefId = 'kr.change.administrative-appeals-state-representative-documents';
const assertionIds = [
  'assertion.kr.change.administrative-appeals-16-2.old-documents',
  'assertion.kr.change.administrative-appeals-16-2.current-split',
  'assertion.kr.change.administrative-appeals-16-2.data-sharing',
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

test('행정심판 법령변화 인계본은 snapshot 020 공개값을 내용 변경 없이 보존한다', async () => {
  const [handoff, sourceSnapshot] = await Promise.all([readJson(handoffPath), readJson(sourceSnapshotPath)]);
  const expectedBrief = sourceSnapshot.change_briefs.find((item) => item.change_brief_id === briefId);
  const expectedAssertions = assertionIds.map((id) => sourceSnapshot.assertions.find((item) => item.assertion_id === id));

  assert.equal(handoff.schema, 'rulelink_public_change_brief_set_v1');
  assert.equal(handoff.checks.source_bundle_snapshot_id, sourceSnapshot.snapshot_id);
  assert.equal(handoff.checks.extracted_without_content_change, true);
  assert.deepEqual(handoff.change_briefs, [expectedBrief]);
  assert.deepEqual(handoff.assertions, expectedAssertions);
});

test('법령변화 1건과 연결 주장 3건의 시간축·근거 참조가 닫힌다', async () => {
  const handoff = await readJson(handoffPath);
  const brief = handoff.change_briefs[0];
  const assertions = new Map(handoff.assertions.map((item) => [item.assertion_id, item]));

  assert.equal(brief.change_brief_id, briefId);
  assert.deepEqual(brief.assertion_ids, assertionIds);
  assert.equal(assertions.size, 3);
  assert.deepEqual(brief.old_snapshot_ids, ['snapshot:088d4ff81a0e97e58d2f1b0bc746d895']);
  assert.deepEqual(brief.new_snapshot_ids, ['snapshot:f46e52f238cfcb804b595d3f2a1447ec']);
  assert.equal(assertions.get(assertionIds[0]).source_coordinates[0].version_scope, 'historical');
  assert.ok(assertionIds.slice(1).every((id) => assertions.get(id).source_coordinates[0].version_scope === 'current_as_of_review'));

  for (const assertion of handoff.assertions) {
    for (const coordinate of assertion.source_coordinates) {
      assert.match(coordinate.official_url, /^https:\/\/(www\.)?law\.go\.kr\//);
      assert.match(coordinate.source_snapshot_id, /^snapshot:[a-f0-9]{32}$/);
      assert.match(coordinate.source_hash, /^sha256:[a-f0-9]{64}$/);
      assert.equal(coordinate.validation_status, 'verified');
    }
  }
});

test('독립 인계본은 공유 manifest와 인적 표기를 수정하지 않는다', async () => {
  const [handoff, manifest] = await Promise.all([
    readJson(handoffPath),
    readJson(path.join(topicDirectory, 'manifest.json')),
  ]);
  assert.ok(!manifest.topics.some((item) => item.file === handoffFile));
  assert.equal(handoff.checks.named_author_publication, false);

  const forbiddenKeys = new Set(['author', 'author_name', 'reviewer', 'reviewer_name', '감수자', '작성자']);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbiddenKeys.has(key), `공개하지 않는 인적 표기 필드가 포함됐습니다: ${key}`);
      visit(child);
    }
  };
  visit(handoff);
});
