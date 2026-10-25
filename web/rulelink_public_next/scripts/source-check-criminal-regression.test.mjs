import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const report = JSON.parse(await readFile(new URL('./fixtures/source-check-20261025/criminal-review.json', import.meta.url), 'utf8'));
const topicNames = ['crime-victim-response', 'domestic-violence-stalking', 'legal-concept-comparisons-02'];
const topics = await Promise.all(topicNames.map(async name => JSON.parse(await readFile(new URL(`../../../artifacts/publication/topics/${name}.json`, import.meta.url), 'utf8'))));
const collection = {content: 'content_entries', rule: 'rule_cards', scenario: 'scenario_branches'};
const idField = {content: 'content_id', rule: 'rule_id', scenario: 'scenario_id'};

function objectFor(values, target) {
  const matches = values.flatMap(topic => topic[collection[target.kind]])
    .filter(item => item[idField[target.kind]] === target.id);
  assert.equal(matches.length, 1, `교정 대상은 정확히 하나여야 합니다: ${target.id}`);
  return matches[0];
}

function valueFor(values, target) {
  return target.field_path.split('.').reduce((value, key) => value?.[key], objectFor(values, target));
}

function assertCorrections(values) {
  for (const finding of report.findings) {
    for (const target of finding.targets) {
      assert.notEqual(target.old_text, target.new_text, `${target.id}: 실질 교정문 누락`);
      assert.equal(valueFor(values, target), target.new_text, `${target.id}.${target.field_path}: 검토한 교정문이 정본에 없습니다.`);
    }
  }
}

test('현행 형사소송법 고소·고발 접수와 보호명령 청구 주체 교정을 정본 11필드에 반영한다', () => {
  assert.equal(report.findings.flatMap(finding => finding.targets).length, 11);
  assertCorrections(topics);
});

test('각 교정 필드를 과거 문구로 되돌리면 반드시 회귀시험이 실패한다', () => {
  for (const target of report.findings.flatMap(finding => finding.targets)) {
    const changed = structuredClone(topics);
    const parts = target.field_path.split('.');
    const owner = parts.slice(0, -1).reduce((value, key) => value[key], objectFor(changed, target));
    owner[parts.at(-1)] = target.old_text;
    assert.throws(() => assertCorrections(changed), {name: 'AssertionError'}, `${target.id}.${target.field_path}: 과거 문구가 허용됐습니다.`);
  }
});

test('접수 법리·요약·긍정분기는 같은 현행 안내를 유지하고 과거 접수기관 표현을 내지 않는다', () => {
  const finding = report.findings.find(item => item.finding_id === 'criminal-complaint-recipient-current-237');
  const mainTargets = finding.targets.filter(item => ['one_line_answer_ko', 'proposition_ko', 'norm.legal_effect_ko', 'when_true_ko'].includes(item.field_path));
  const actual = mainTargets.map(target => valueFor(topics, target));
  assert.equal(actual.length, 4);
  assert.equal(new Set(actual).size, 1);
  for (const target of finding.targets) assert.doesNotMatch(valueFor(topics, target), /검사나|검사 또는|검찰청|조서/u);
  assert.match(actual[0], /사법경찰관/u);
  assert.match(actual[0], /작성한 서류/u);
});

test('현재 원문 대조와 검토 기준일의 한계를 보고서에 함께 남긴다', () => {
  assert.equal(report.reviewed_laws.length, 5);
  assert.ok(report.scope_and_limits.some(text => text.includes('2026-10-20') && text.includes('이후')));
  const source = report.source_version_updates_required.find(item => item.article_no === '제237조');
  assert.equal(source.current_source_id, 'law_001671_ko_0237');
  assert.equal(source.current_source_hash, 'sha256:71f169a0b99d25d5463f3b500367239309feee79c3f33d6be1f3a10d07666be7');
  const authority = report.findings[0].authority;
  assert.equal(authority.effective_date, '2026-10-02');
  assert.match(authority.text_ko, /사법경찰관에게 하여야 한다/u);
  assert.doesNotMatch(authority.text_ko, /검사나|검사 또는/u);
});
