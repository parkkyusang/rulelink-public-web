import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(process.cwd(), '../..');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const report = read('scripts/fixtures/source-check-20261025/change-brief-review.json');
const sets = ['law-change-briefs.json', 'law-change-briefs-02.json', 'law-change-briefs-administrative-appeals.json']
  .map(name => read(path.join(repoRoot, 'artifacts/publication/topics', name)));
const briefs = new Map(sets.flatMap(set => set.change_briefs).map(brief => [brief.change_brief_id, brief]));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const at = (value, field) => field.split('.').reduce((node, key) => node[key], value);
const set = (value, field, text) => { const keys = field.split('.'); const last = keys.pop(); keys.reduce((node, key) => node[key], value)[last] = text; };
function reviewedBody(brief, entry) {
  assert.ok(Number.isFinite(Date.parse(entry.original_reviewed_at)));
  assert.ok(Number.isFinite(Date.parse(entry.original_expires_at)));
  return {...structuredClone(brief), reviewed_at: entry.original_reviewed_at, expires_at: entry.original_expires_at};
}

test('변화 안내 11건 전체를 개별 검토 해시와 일대일로 결박한다', () => {
  assert.equal(report.entries.length, 11);
  assert.equal(new Set(report.entries.map(x => x.change_brief_id)).size, 11);
  assert.deepEqual([...briefs.keys()].sort(), report.entries.map(x => x.change_brief_id).sort());
  for (const entry of report.entries) {
    const brief = reviewedBody(briefs.get(entry.change_brief_id), entry);
    assert.equal(hash(brief), entry.corrected_input_sha256 ?? entry.input_sha256, entry.change_brief_id);
    const old = structuredClone(brief);
    for (const correction of entry.corrections) for (const field of correction.field_paths) {
      assert.equal(at(brief, field), correction.new_text);
      set(old, field, correction.old_text);
    }
    assert.equal(hash(old), entry.input_sha256, `교정 외 변경: ${entry.change_brief_id}`);
  }
});

test('신원정보·상속권상실 각 교정 필드의 과거 문언 복귀를 차단한다', () => {
  const corrections = report.entries.flatMap(entry => entry.corrections.flatMap(correction =>
    correction.field_paths.map(field => ({entry, correction, field}))));
  assert.equal(corrections.length, 4);
  for (const {entry, correction, field} of corrections) {
    const mutated = reviewedBody(briefs.get(entry.change_brief_id), entry);
    set(mutated, field, correction.old_text);
    assert.notEqual(hash(mutated), entry.corrected_input_sha256);
    assert.throws(() => assert.equal(at(mutated, field), correction.new_text));
  }
});

test('검토일 두 필드만 바뀌면 본문 해시는 유지되고 다른 필드 변조는 차단한다', () => {
  for (const entry of report.entries) {
    const brief = structuredClone(briefs.get(entry.change_brief_id));
    brief.reviewed_at = '2026-10-25T00:00:00+09:00';
    brief.expires_at = '2027-01-23T00:00:00+09:00';
    const expected = entry.corrected_input_sha256 ?? entry.input_sha256;
    assert.equal(hash(reviewedBody(brief, entry)), expected);
    for (const field of ['summary_ko', 'title_ko', 'transition_note_ko']) {
      const mutated = structuredClone(brief);
      mutated[field] += ' 미검토 변경';
      assert.notEqual(hash(reviewedBody(mutated, entry)), expected);
    }
    const changedNorm = structuredClone(brief);
    changedNorm.norm_delta.new_frame.legal_effect.push('미검토 법률효과');
    assert.notEqual(hash(reviewedBody(changedNorm, entry)), expected);
  }
});

test('현행 재검토와 미실시 역사 원문 검증을 혼동하지 않는다', () => {
  assert.equal(report.historical_original_reverified, false);
  assert.equal(report.historical_metadata_update_allowed, false);
  assert.equal(report.entries.filter(x => x.current_review_status === 'pass').length, 9);
  assert.equal(report.entries.filter(x => x.current_review_status === 'pass_after_correction').length, 2);
  assert.ok(report.entries.every(x => x.historical_review_status === 'not_reverified'));
  assert.match(report.scope_and_limits.join(' '), /last_verified_at.*갱신하지/);
});
