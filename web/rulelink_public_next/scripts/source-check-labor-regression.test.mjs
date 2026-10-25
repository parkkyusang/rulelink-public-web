import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const topic = JSON.parse(await readFile(new URL('../../../artifacts/publication/topics/workplace-harassment.json', import.meta.url), 'utf8'));
const review = JSON.parse(await readFile(new URL('./fixtures/source-check-20261025/labor-review.json', import.meta.url), 'utf8'));
const finding = review.findings.find(item => item.finding_id === 'labor.equal26.deadline-scope');

function entityFor(value, change) {
  const idKey = {rule_cards: 'rule_id', content_entries: 'content_id', scenario_branches: 'scenario_id'}[change.collection];
  const entity = value[change.collection].find(item => item[idKey] === change.id);
  assert.ok(entity, `교정 대상이 없습니다: ${change.id}`);
  return entity;
}

function fieldKeys(field) {
  return field.replace(/\[(\d+)\]/gu, '.$1').split('.');
}

function readField(entity, field) {
  return fieldKeys(field).reduce((value, key) => value?.[key], entity);
}

function restoreOld(value, change) {
  const entity = entityFor(value, change);
  const keys = fieldKeys(change.field);
  const owner = keys.slice(0, -1).reduce((current, key) => current[key], entity);
  owner[keys.at(-1)] = change.old;
}

function assertApprovedCorrections(value) {
  for (const change of finding.changes) {
    assert.equal(readField(entityFor(value, change), change.field), change.new, `${change.id}.${change.field}`);
  }
}

test('제26조 기산점 교정은 법리·본문·행동·주의·사실분기 9필드에 함께 적용된다', () => {
  assert.equal(finding.changes.length, 9);
  assertApprovedCorrections(topic);
  assert.deepEqual(new Set(finding.changes.map(change => change.collection)), new Set(['rule_cards', 'content_entries', 'scenario_branches']));
});

test('보호조치 미이행을 계속행위 종료일 기산으로 되돌리는 회귀를 모든 표시층에서 차단한다', () => {
  for (const change of finding.changes) {
    const mutated = structuredClone(topic);
    restoreOld(mutated, change);
    assert.throws(() => assertApprovedCorrections(mutated), {name: 'AssertionError'}, `${change.id}.${change.field} 회귀를 놓쳤습니다.`);
  }
});

test('제3호의 계속 불리한 처우 예외는 보존하고 제2호 미이행에는 일괄 적용하지 않는다', () => {
  const rule = topic.rule_cards.find(item => item.rule_id === 'rule.workplace-harassment.labor-commission');
  const entry = topic.content_entries.find(item => item.content_id === 'content.sexual-harassment-labor-commission-remedy');
  const scenario = topic.scenario_branches.find(item => item.scenario_id === 'scenario.workplace-harassment.labor-commission');
  assert.match(finding.basis.exact_text, /제1호 및 제3호/);
  assert.match(rule.norm.legal_effect_ko, /처우를 받은 날부터 6개월/);
  assert.match(rule.norm.legal_effect_ko, /제3호의 불리한 처우가 계속되는 경우에는 종료일/);
  assert.match(rule.norm.legal_effect_ko, /제2호의 보호조치 미이행에 그 기준을 일괄 적용해서는 안/);
  assert.match(entry.body_sections[1].paragraphs_ko[0], /제2호.*자동 적용된다고 가정하지 말고/su);
  assert.match(scenario.decision_fact_ko, /제2호.*발생일.*제3호.*발생일.*계속된 경우의 종료일/su);
  assert.match(scenario.when_false_ko, /종료일 기준이 적용된다고 단정하지 말고/);
  assert.match(entry.body_sections[1].paragraphs_ko[1], /내부절차.*외부 구제기간.*당연히 멈춘다고 가정하지/);
});

test('교정된 콘텐츠·법리·사실분기는 동일한 제26조 실제 근거 좌표를 유지한다', () => {
  const coordinate = finding.basis.coordinate_id;
  assert.ok(topic.sources.some(source => source.coordinate_id === coordinate));
  for (const change of finding.changes) {
    assert.ok(entityFor(topic, change).source_coordinate_ids.includes(coordinate), `${change.id}: 제26조 근거 연결이 없습니다.`);
  }
  assert.equal(topic.sources.length, 12);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
});
