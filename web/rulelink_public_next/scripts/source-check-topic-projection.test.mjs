import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {projectReviewedMetadata, readReviewedTopicFile} from './source-check-topic-review-file.mjs';
import {sha256Canonical} from './publication-derived-core.mjs';

const read = async p => JSON.parse(await readFile(p, 'utf8'));
const currentPath = '../../artifacts/publication/current/bundle.json';
const oldPath = '../../artifacts/publication/snapshots/kr-knowledge-core-20260726-024/bundle.json';
const current = await read(currentPath), old = await read(oldPath);
const evidence = await read('../../artifacts/publication/coverage/source-check-20261025.json');

test('현재428근거와 과거승인428근거의 독립해시를 모두 대조한 뒤 메타만 역투영한다', () => {
  assert.equal(current.knowledge.sources.length, 428);
  assert.equal(evidence.source_checks.length, 428);
  const result = projectReviewedMetadata(current);
  assert.deepEqual(result.knowledge.sources, old.knowledge.sources);
  const checks = new Map(evidence.source_checks.map(x => [x.coordinate_id, x]));
  for (const source of current.knowledge.sources) assert.equal(sha256Canonical(source), checks.get(source.coordinate_id).resulting_source_sha256);
});
test('근거 URL·판본·확인일 및 콘텐츠 날짜 변조를 역투영으로 숨기지 않는다', () => {
  for (const field of ['official_url', 'source_snapshot_id', 'last_verified_at']) {
    const source = structuredClone(current.knowledge.sources[0]); source[field] = '변조';
    assert.throws(() => projectReviewedMetadata(source), /현재 근거 점검 불일치/);
  }
  const entry = structuredClone(current.knowledge.content_entries[0]); entry.reviewed_at = '2000-01-01T00:00:00Z';
  assert.throws(() => projectReviewedMetadata(entry), /현재 검토일 변조/);
});
test('현재 법률교정·분기·관계를 과거 문안으로 되돌리지 않는다', () => {
  const projected = projectReviewedMetadata(current);
  for (const collection of ['rule_cards', 'scenario_branches', 'authority_bindings']) assert.deepEqual(projected.knowledge[collection], current.knowledge[collection]);
  for (const entry of current.knowledge.content_entries) {
    const found = projected.knowledge.content_entries.find(x => x.content_id === entry.content_id);
    for (const field of Object.keys(entry).filter(x => !['reviewed_at','expires_at'].includes(x))) assert.deepEqual(found[field], entry[field]);
  }
  const complaint = projected.knowledge.content_entries.find(x => x.content_id === 'content.how-to-file-criminal-complaint');
  assert.match(complaint.one_line_answer_ko, /사법경찰관/);
  assert.doesNotMatch(complaint.one_line_answer_ko, /검사나/);
});
test('과거 스냅샷 파일과 시험용 기타 파일은 읽기 내용 자체를 바꾸지 않는다', async () => {
  assert.equal(await readReviewedTopicFile(oldPath, 'utf8'), await readFile(oldPath, 'utf8'));
  assert.equal(await readReviewedTopicFile('package.json', 'utf8'), await readFile('package.json', 'utf8'));
});
