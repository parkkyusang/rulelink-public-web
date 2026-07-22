import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'employment-exit.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

const [topic, current] = await Promise.all([readJson(topicPath), readJson(currentPath)]);
const sources = new Map(topic.sources.map(source => [source.coordinate_id, source]));
const rules = new Map(topic.rule_cards.map(rule => [rule.rule_id, rule]));
const scenarios = new Map(topic.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
const entries = new Map(topic.content_entries.map(entry => [entry.content_id, entry]));
const currentEntries = new Map(current.knowledge.content_entries.map(entry => [entry.content_id, entry]));
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys()]);

test('해고·퇴직·실업 10개 생활질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.employment-exit');
  assert.equal(topic.sources.length, 13);
  assert.equal(topic.rule_cards.length, 12);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
  assert.equal(topic.topic_hubs.length, 1);
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);

  for (const rule of rules.values()) {
    assert.ok(rule.source_coordinate_ids.length > 0, `${rule.rule_id}: 공식 근거가 없습니다.`);
    assert.notEqual(normalize(rule.proposition_ko), normalize(rule.norm.legal_effect_ko), `${rule.rule_id}: 적용명제와 법률효과가 중복됩니다.`);
    assert.ok(rule.norm.actor_ko.trim() && rule.norm.conditions_ko.trim() && rule.norm.legal_effect_ko.trim());
    for (const sourceId of rule.source_coordinate_ids) assert.ok(sources.has(sourceId), `${rule.rule_id}: 없는 근거 ${sourceId}`);
  }

  for (const scenario of scenarios.values()) {
    assert.ok(scenario.rule_ids.length > 0, `${scenario.scenario_id}: 연결 법리가 없습니다.`);
    assert.ok(scenario.source_coordinate_ids.length > 0, `${scenario.scenario_id}: 연결 근거가 없습니다.`);
    for (const ruleId of scenario.rule_ids) assert.ok(rules.has(ruleId), `${scenario.scenario_id}: 없는 법리 ${ruleId}`);
    for (const sourceId of scenario.source_coordinate_ids) assert.ok(sources.has(sourceId), `${scenario.scenario_id}: 없는 근거 ${sourceId}`);
  }

  for (const entry of entries.values()) {
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(entry.audience_situation_ko.trim(), `${entry.content_id}: 대상 상황이 없습니다.`);
    assert.ok(entry.key_points_ko.length >= 3, `${entry.content_id}: 핵심 요점이 부족합니다.`);
    assert.ok(entry.action_steps_ko.length >= 4, `${entry.content_id}: 행동 단계가 부족합니다.`);
    assert.ok(entry.facts_to_check_ko.length >= 5, `${entry.content_id}: 확인 사실이 부족합니다.`);
    assert.ok(entry.body_sections.length >= 2, `${entry.content_id}: 본문 구성이 부족합니다.`);
    assert.ok(entry.search_intents_ko.length >= 3, `${entry.content_id}: 검색 의도가 부족합니다.`);
    assert.ok(entry.rule_ids.length > 0 && entry.scenario_ids.length > 0 && entry.source_coordinate_ids.length > 0);
    for (const ruleId of entry.rule_ids) assert.ok(rules.has(ruleId), `${entry.content_id}: 없는 법리 ${ruleId}`);
    for (const scenarioId of entry.scenario_ids) assert.ok(scenarios.has(scenarioId), `${entry.content_id}: 없는 분기 ${scenarioId}`);
    for (const sourceId of entry.source_coordinate_ids) assert.ok(sources.has(sourceId), `${entry.content_id}: 없는 근거 ${sourceId}`);
    for (const relatedId of entry.related_content_ids) assert.ok(relatedUniverse.has(relatedId), `${entry.content_id}: 없는 관련 콘텐츠 ${relatedId}`);
  }
});

test('활성 DB에서 확인한 현행 조문 13개의 공식 좌표와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['labor_standards_act_ko_0011', 'snapshot:cde55bb735b61fed8ec935911db463db'],
    ['labor_standards_act_ko_0023', 'snapshot:d242c504b81114f57aeb43ddd9a01584'],
    ['labor_standards_act_ko_0024', 'snapshot:17265462e933f969d7e623558a77fc3c'],
    ['labor_standards_act_ko_0026', 'snapshot:aa0ffc32663cb16d8ba7b89c972008e1'],
    ['labor_standards_act_ko_0030', 'snapshot:8edaec2a93460de1a67174860a37bd15'],
    ['labor_standards_act_ko_0031', 'snapshot:a80e869870449aa22f6f9245ceababd4'],
    ['employee_retirement_benefit_security_act_ko_0004', 'snapshot:667bfbd7a72a6f840c4ceecf58e8dd87'],
    ['employee_retirement_benefit_security_act_ko_0009', 'snapshot:0f2437ecfa8c411196cc5b8ff42bec50'],
    ['employment_insurance_act_ko_0040', 'snapshot:4911920bb21db1363517ba0f014c8ce6'],
    ['employment_insurance_act_ko_0042', 'snapshot:75f5e46e1758283b45747844c16fe643'],
    ['employment_insurance_act_ko_0043', 'snapshot:04f481ca75173b5e914cdf4ea0284e3e'],
    ['employment_insurance_act_ko_0048', 'snapshot:cbd8387c2c2935e762f7214044763221'],
    ['employment_insurance_act_ko_0058', 'snapshot:05902796bdf59d3704858ca5bb0ed331'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(!source.official_url.includes('lawView.do'));
    assert.ok(['근로기준법', '근로자퇴직급여 보장법', '고용보험법'].includes(source.law_name_ko));
  }
});

test('기존 임금 주제의 중복을 피하고 퇴직 전후의 빈 경로를 연결한다', () => {
  const titles = [...entries.values()].map(entry => entry.title_ko);
  for (const existingTitle of [
    '전화나 말로 해고 통보하면 효력이 있나',
    '해고통지서에는 이유를 얼마나 구체적으로 써야 하나',
    '부당해고 구제신청은 언제까지 해야 하나',
    '퇴직금 계산의 기본 출발점',
    '퇴직금도 퇴직 후 14일 안에 지급해야 하나',
  ]) assert.ok(!titles.includes(existingTitle), `기존 질문 중복: ${existingTitle}`);

  for (const id of [
    'content.verbal-dismissal-written-notice',
    'content.specific-reason-in-dismissal-notice',
    'content.unfair-dismissal-remedy-three-months',
    'content.retirement-pay-basic-formula',
    'content.retirement-pay-payment-deadline',
    'content.final-wages-after-retirement-14-days',
  ]) assert.ok(currentEntries.has(id), `기존 상세 정본 연결 누락: ${id}`);

  assert.match(rules.get('rule.employment-exit.dismissal-notice-pay').norm.legal_effect_ko, /30일 전.*30일분/);
  assert.match(rules.get('rule.employment-exit.managerial-dismissal').norm.legal_effect_ko, /긴박.*해고회피.*선정기준.*50일/);
  assert.match(rules.get('rule.employment-exit.remedy-appeal').norm.legal_effect_ko, /10일.*15일/);
  assert.match(rules.get('rule.employment-exit.retirement-eligibility').norm.legal_effect_ko, /1년 미만.*15시간 미만/);
  assert.match(rules.get('rule.employment-exit.unemployment-eligibility').norm.legal_effect_ko, /18개월.*180일/);
  assert.match(rules.get('rule.employment-exit.report-recognition-period').norm.legal_effect_ko, /12개월/);
  assert.match(entries.get('content.employment-exit-notice-pay-not-validity').one_line_answer_ko, /별개/);
});

test('새 식별자는 현재 공개 정본과 충돌하지 않고 인적 표기를 요구하지 않는다', () => {
  const currentIds = new Set([
    ...current.knowledge.sources.map(item => item.coordinate_id),
    ...current.knowledge.rule_cards.map(item => item.rule_id),
    ...current.knowledge.scenario_branches.map(item => item.scenario_id),
    ...current.knowledge.content_entries.map(item => item.content_id),
    ...current.knowledge.topic_hubs.map(item => item.hub_id),
  ]);
  const newIds = [
    ...topic.sources.map(item => item.coordinate_id),
    ...topic.rule_cards.map(item => item.rule_id),
    ...topic.scenario_branches.map(item => item.scenario_id),
    ...topic.content_entries.map(item => item.content_id),
    ...topic.topic_hubs.map(item => item.hub_id),
  ];
  assert.equal(new Set(newIds).size, newIds.length);
  for (const id of newIds) assert.ok(!currentIds.has(id), `현재 정본과 식별자 충돌: ${id}`);

  const serialized = JSON.stringify(topic);
  for (const forbidden of ['author', 'byline', 'reviewer_name', '박규상', '동순…']) {
    assert.ok(!serialized.includes(forbidden), `금지 표현이 남았습니다: ${forbidden}`);
  }
});

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
