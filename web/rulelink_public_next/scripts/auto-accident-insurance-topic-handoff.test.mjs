import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'auto-accident-insurance.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

const [topic, current] = await Promise.all([readJson(topicPath), readJson(currentPath)]);
const sources = new Map(topic.sources.map(source => [source.coordinate_id, source]));
const rules = new Map(topic.rule_cards.map(rule => [rule.rule_id, rule]));
const scenarios = new Map(topic.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
const entries = new Map(topic.content_entries.map(entry => [entry.content_id, entry]));

test('자동차 교통사고·보험 10개 생활질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.auto-accident-insurance');
  assert.equal(topic.sources.length, 11);
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
    for (const relatedId of entry.related_content_ids) assert.ok(entries.has(relatedId), `${entry.content_id}: 없는 관련 콘텐츠 ${relatedId}`);
  }
});

test('활성 DB에서 확인한 현행 조문 11개의 공식 좌표와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['road_traffic_ko_0054', ['snapshot:5951578fbe50d0d3b541b014dd721d7a', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EB%8F%84%EB%A1%9C%EA%B5%90%ED%86%B5%EB%B2%95/%EC%A0%9C54%EC%A1%B0']],
    ['traffic_accident_special_ko_0003', ['snapshot:1851b667d470fbf9b9074eef5c87eaeb', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B5%90%ED%86%B5%EC%82%AC%EA%B3%A0%EC%B2%98%EB%A6%AC%ED%8A%B9%EB%A1%80%EB%B2%95/%EC%A0%9C3%EC%A1%B0']],
    ['traffic_accident_special_ko_0004', ['snapshot:aae9b4d63e5ac4098b790ea9d9893543', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B5%90%ED%86%B5%EC%82%AC%EA%B3%A0%EC%B2%98%EB%A6%AC%ED%8A%B9%EB%A1%80%EB%B2%95/%EC%A0%9C4%EC%A1%B0']],
    ['automobile_damage_compensation_guarantee_act_ko_0003', ['snapshot:ec02316ac4477c73bc6fc4a50a3037c2', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9E%90%EB%8F%99%EC%B0%A8%EC%86%90%ED%95%B4%EB%B0%B0%EC%83%81%EB%B3%B4%EC%9E%A5%EB%B2%95/%EC%A0%9C3%EC%A1%B0']],
    ['automobile_damage_compensation_guarantee_act_ko_0005', ['snapshot:2fa71717ac5c18cafb7c19a734c422e9', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9E%90%EB%8F%99%EC%B0%A8%EC%86%90%ED%95%B4%EB%B0%B0%EC%83%81%EB%B3%B4%EC%9E%A5%EB%B2%95/%EC%A0%9C5%EC%A1%B0']],
    ['automobile_damage_compensation_guarantee_act_ko_0010', ['snapshot:2201e35fe843086b77cbf06b5fd2fe99', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9E%90%EB%8F%99%EC%B0%A8%EC%86%90%ED%95%B4%EB%B0%B0%EC%83%81%EB%B3%B4%EC%9E%A5%EB%B2%95/%EC%A0%9C10%EC%A1%B0']],
    ['automobile_damage_compensation_guarantee_act_ko_0011', ['snapshot:b33e0aca835ffa851c30f8af87418ada', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9E%90%EB%8F%99%EC%B0%A8%EC%86%90%ED%95%B4%EB%B0%B0%EC%83%81%EB%B3%B4%EC%9E%A5%EB%B2%95/%EC%A0%9C11%EC%A1%B0']],
    ['automobile_damage_compensation_guarantee_act_ko_0012', ['snapshot:3d552ba0dc574d596bf25e06c1bd4f21', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9E%90%EB%8F%99%EC%B0%A8%EC%86%90%ED%95%B4%EB%B0%B0%EC%83%81%EB%B3%B4%EC%9E%A5%EB%B2%95/%EC%A0%9C12%EC%A1%B0']],
    ['automobile_damage_compensation_guarantee_act_ko_0030', ['snapshot:0be47e6498f8828494e6a02c06447dd0', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9E%90%EB%8F%99%EC%B0%A8%EC%86%90%ED%95%B4%EB%B0%B0%EC%83%81%EB%B3%B4%EC%9E%A5%EB%B2%95/%EC%A0%9C30%EC%A1%B0']],
    ['automobile_damage_compensation_guarantee_act_ko_0036', ['snapshot:4b519bf70b55e41c72086d2aaae49e5b', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9E%90%EB%8F%99%EC%B0%A8%EC%86%90%ED%95%B4%EB%B0%B0%EC%83%81%EB%B3%B4%EC%9E%A5%EB%B2%95/%EC%A0%9C36%EC%A1%B0']],
    ['automobile_damage_compensation_guarantee_act_ko_0041', ['snapshot:e43291cb1abf5689be6672e8c457ae8d', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9E%90%EB%8F%99%EC%B0%A8%EC%86%90%ED%95%B4%EB%B0%B0%EC%83%81%EB%B3%B4%EC%9E%A5%EB%B2%95/%EC%A0%9C41%EC%A1%B0']],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    const [snapshotId, officialUrl] = expected.get(source.source_id) ?? [];
    assert.equal(source.source_snapshot_id, snapshotId, source.source_id);
    assert.match(source.source_snapshot_id, /^snapshot:[0-9a-f]{32}$/, source.source_id);
    assert.equal(source.official_url, officialUrl, source.source_id);
    assert.ok(['도로교통법', '교통사고처리 특례법', '자동차손해배상 보장법'].includes(source.law_name_ko));
  }
  assert.equal(new Set(topic.sources.map(source => source.official_url)).size, 11);
});

test('표준 콘텐츠 유형·현재 검증시각·근거 11/11 역참조를 고정한다', () => {
  const standardTypes = new Set([
    'law_change',
    'doctrine_explainer',
    'fact_branch',
    'precedent_doctrine',
    'similar_case_comparison',
    'misconception_correction',
    'procedure_evidence',
    'recurring_issue_generalization',
  ]);
  const now = Date.now();

  for (const entry of entries.values()) {
    assert.ok(standardTypes.has(entry.content_type), `${entry.content_id}: 비표준 유형 ${entry.content_type}`);
    assert.ok(Date.parse(entry.reviewed_at) <= now, `${entry.content_id}: 미래 검토시각 ${entry.reviewed_at}`);
  }
  for (const source of sources.values()) {
    assert.ok(Date.parse(source.last_verified_at) <= now, `${source.source_id}: 미래 검증시각 ${source.last_verified_at}`);
  }

  const referenced = new Set();
  for (const rule of rules.values()) for (const sourceId of rule.source_coordinate_ids) referenced.add(sourceId);
  for (const scenario of scenarios.values()) for (const sourceId of scenario.source_coordinate_ids) referenced.add(sourceId);
  for (const entry of entries.values()) for (const sourceId of entry.source_coordinate_ids) referenced.add(sourceId);
  assert.equal(referenced.size, 11);
  for (const coordinateId of sources.keys()) assert.ok(referenced.has(coordinateId), `미참조 근거: ${coordinateId}`);
});

test('현장조치·형사특례·보험청구의 혼동 방지 문구를 회귀검사로 고정한다', () => {
  assert.match(rules.get('rule.auto-accident-insurance.immediate-measures').norm.legal_effect_ko, /즉시 정차.*구호.*인적사항/);
  assert.match(rules.get('rule.auto-accident-insurance.police-report').norm.legal_effect_ko, /차만 손괴.*예외/);
  assert.match(rules.get('rule.auto-accident-insurance.direct-claim').proposition_ko, /직접.*청구/);
  assert.match(rules.get('rule.auto-accident-insurance.victim-intent-special').norm.legal_effect_ko, /법정 예외/);
  assert.match(rules.get('rule.auto-accident-insurance.comprehensive-insurance-special').norm.legal_effect_ko, /중상해.*보험 효력.*도주.*음주/);
  assert.match(rules.get('rule.auto-accident-insurance.government-guarantee').norm.legal_effect_ko, /책임보험 보험금 한도/);
  assert.match(rules.get('rule.auto-accident-insurance.three-year-period').norm.legal_effect_ko, /3년/);
  assert.doesNotMatch(entries.get('content.auto-accident-insurance-settlement-criminal-effect').one_line_answer_ko, /반드시 끝/);
  assert.match(entries.get('content.auto-accident-insurance-three-year-limit').caution_ko, /다른 권리/);
});

test('식별자는 독립 인계와 정본 통합 단계 모두에서 같은 계약을 지킨다', () => {
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
  const integrated = current.knowledge.topic_hubs.some(item => item.hub_id === topic.topic_hubs[0].hub_id);
  for (const id of newIds) assert.equal(currentIds.has(id), integrated, `정본 통합 상태 불일치: ${id}`);

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
