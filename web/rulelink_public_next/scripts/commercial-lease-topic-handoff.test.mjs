import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'commercial-lease.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

const [topic, current] = await Promise.all([readJson(topicPath), readJson(currentPath)]);
const sources = new Map(topic.sources.map(source => [source.coordinate_id, source]));
const rules = new Map(topic.rule_cards.map(rule => [rule.rule_id, rule]));
const scenarios = new Map(topic.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
const entries = new Map(topic.content_entries.map(entry => [entry.content_id, entry]));
const currentEntries = new Map(current.knowledge.content_entries.map(entry => [entry.content_id, entry]));
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys()]);
const canonicalContentTypes = new Set([
  'law_change',
  'doctrine_explainer',
  'fact_branch',
  'precedent_doctrine',
  'similar_case_comparison',
  'misconception_correction',
  'procedure_evidence',
  'recurring_issue_generalization',
]);

test('상가건물 임대차 11개 생활질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.commercial-lease');
  assert.equal(topic.sources.length, 16);
  assert.equal(topic.rule_cards.length, 13);
  assert.equal(topic.scenario_branches.length, 11);
  assert.equal(topic.content_entries.length, 11);
  assert.equal(topic.topic_hubs.length, 1);
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);

  for (const rule of rules.values()) {
    assert.ok(rule.source_coordinate_ids.length > 0, `${rule.rule_id}: 공식 근거가 없습니다.`);
    assert.notEqual(normalize(rule.proposition_ko), normalize(rule.norm.legal_effect_ko), `${rule.rule_id}: 핵심 법리와 법적 효과가 중복됩니다.`);
    for (const sourceId of rule.source_coordinate_ids) assert.ok(sources.has(sourceId), `${rule.rule_id}: 없는 근거 ${sourceId}`);
  }

  for (const scenario of scenarios.values()) {
    assert.ok(scenario.rule_ids.length > 0, `${scenario.scenario_id}: 연결 법리가 없습니다.`);
    for (const ruleId of scenario.rule_ids) assert.ok(rules.has(ruleId), `${scenario.scenario_id}: 없는 법리 ${ruleId}`);
    for (const sourceId of scenario.source_coordinate_ids) assert.ok(sources.has(sourceId), `${scenario.scenario_id}: 없는 근거 ${sourceId}`);
  }

  for (const entry of entries.values()) {
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(canonicalContentTypes.has(entry.content_type), `${entry.content_id}: 비표준 콘텐츠 유형 ${entry.content_type}`);
    assert.ok(entry.audience_situation_ko.trim(), `${entry.content_id}: 대상 상황이 없습니다.`);
    assert.ok(entry.key_points_ko.length >= 3, `${entry.content_id}: 핵심 요점이 부족합니다.`);
    assert.ok(entry.action_steps_ko.length >= 4, `${entry.content_id}: 행동 단계가 부족합니다.`);
    assert.ok(entry.facts_to_check_ko.length >= 5, `${entry.content_id}: 확인 사실이 부족합니다.`);
    assert.ok(entry.body_sections.length >= 2, `${entry.content_id}: 본문 구성이 부족합니다.`);
    assert.ok(entry.rule_ids.length > 0 && entry.scenario_ids.length > 0 && entry.source_coordinate_ids.length > 0);
    for (const ruleId of entry.rule_ids) assert.ok(rules.has(ruleId), `${entry.content_id}: 없는 법리 ${ruleId}`);
    for (const scenarioId of entry.scenario_ids) assert.ok(scenarios.has(scenarioId), `${entry.content_id}: 없는 분기 ${scenarioId}`);
    for (const sourceId of entry.source_coordinate_ids) assert.ok(sources.has(sourceId), `${entry.content_id}: 없는 근거 ${sourceId}`);
    for (const relatedId of entry.related_content_ids) assert.ok(relatedUniverse.has(relatedId), `${entry.content_id}: 없는 관련 콘텐츠 ${relatedId}`);
  }
});

test('선언한 모든 공식 근거 좌표가 실제 법리·분기·콘텐츠에서 역참조된다', () => {
  const referenced = new Set([
    ...topic.rule_cards.flatMap(item => item.source_coordinate_ids ?? []),
    ...topic.scenario_branches.flatMap(item => item.source_coordinate_ids ?? []),
    ...topic.content_entries.flatMap(item => item.source_coordinate_ids ?? []),
    ...(topic.concept_cards ?? []).flatMap(item => item.source_coordinate_ids ?? []),
  ]);
  for (const source of topic.sources) {
    assert.ok(referenced.has(source.coordinate_id), `미참조 공식 근거 좌표: ${source.coordinate_id}`);
  }
});

test('활성 DB에서 확인한 현행 조문 16개의 공식 좌표와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['commercial_lease_ko_0002', 'snapshot:724498cc3a92ca6939cadc8328d2cf0f'],
    ['commercial_lease_ko_0003', 'snapshot:1d9c6a00a2afec23963281fd3a8e60c2'],
    ['commercial_lease_ko_0004', 'snapshot:b70a07dd3d220873faa70d94b28da52e'],
    ['commercial_lease_ko_0005', 'snapshot:27d338062dcb0a856bbe73fd4f49f656'],
    ['commercial_lease_ko_0006', 'snapshot:868f409769b920d9313a5d10b1e2a31d'],
    ['commercial_lease_ko_0009', 'snapshot:d88fb6aa651b41cfee3e2342fef6244b'],
    ['commercial_lease_ko_0010', 'snapshot:1e7ccf5e5ebb15e63ea54caffd3352de'],
    ['commercial_lease_ko_0010_03', 'snapshot:6e5796b6baf27047bbd039a0fdd2193f'],
    ['commercial_lease_ko_0010_04', 'snapshot:5d77c09a5eb6de889a0c4b42096de695'],
    ['commercial_lease_ko_0010_05', 'snapshot:efcf094dd364395a0ea8c44c2b11a8fb'],
    ['commercial_lease_ko_0010_08', 'snapshot:becea8c05193844530b23ca64adc08d8'],
    ['commercial_lease_ko_0011', 'snapshot:d4b50be5ea68aaa12d2a0cec207a2645'],
    ['commercial_lease_ko_0011_02', 'snapshot:7fb3ade7ffb9afef43270682f9877885'],
    ['commercial_lease_ko_0012', 'snapshot:119a07f74cf3c64821a90338bff86223'],
    ['commercial_lease_ko_0019_02', 'snapshot:959d1d862d7fa5e33a9dae165cec9b06'],
    ['commercial_lease_ko_0020', 'snapshot:4a04b15c57fdeaea6a3e000e0e5fa9d3'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.equal(source.official_url, 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%83%81%EA%B0%80%EA%B1%B4%EB%AC%BC%EC%9E%84%EB%8C%80%EC%B0%A8%EB%B3%B4%ED%98%B8%EB%B2%95');
    assert.ok(!source.official_url.includes('lawView.do'));
    assert.equal(source.law_name_ko, '상가건물 임대차보호법');
  }
});

test('갱신·연체·권리금·폐업해지·관리비의 핵심 숫자와 효과를 회귀검사로 고정한다', () => {
  assert.match(rules.get('rule.commercial-lease.opposability').proposition_ko, /다음 날/);
  assert.match(rules.get('rule.commercial-lease.renewal').proposition_ko, /6개월 전.*1개월 전.*10년/);
  assert.match(rules.get('rule.commercial-lease.three-rents-arrears').proposition_ko, /3기의 차임액/);
  assert.match(rules.get('rule.commercial-lease.key-money').proposition_ko, /종료 6개월 전부터 종료 시까지/);
  assert.match(rules.get('rule.commercial-lease.key-money').norm.legal_effect_ko, /3년/);
  assert.match(rules.get('rule.commercial-lease.closure-termination').proposition_ko, /총 3개월 이상/);
  assert.match(rules.get('rule.commercial-lease.closure-termination').norm.legal_effect_ko, /받은 날부터 3개월/);
  assert.match(rules.get('rule.commercial-lease.management-fee').norm.legal_effect_ko, /부과기간·항목·금액/);
});

test('주거임대차·민사조정 정본으로 실제 외부 연결을 닫는다', () => {
  const required = new Map([
    ['content.commercial-lease-opposability-and-registration',['content.housing-lease-opposability-basics']],
    ['content.commercial-lease-priority-repayment',['content.housing-lease-priority-repayment-basics']],
    ['content.commercial-lease-move-before-deposit-refund',['content.move-before-deposit-refund','content.lease-registration-application-is-not-completion']],
    ['content.commercial-lease-dispute-conciliation',['content.civil-mediation-vs-civil-lawsuit']],
    ['content.commercial-lease-closure-termination',['content.civil-mediation-vs-civil-lawsuit']],
  ]);
  for (const [entryId, ids] of required) {
    const related = entries.get(entryId).related_content_ids;
    for (const id of ids) {
      assert.ok(currentEntries.has(id), `현재 정본에 외부 연결 대상이 없습니다: ${id}`);
      assert.ok(related.includes(id), `${entryId}: 외부 연결 누락 ${id}`);
    }
  }
  assert.equal(entries.get('content.commercial-lease-closure-termination').content_type, 'doctrine_explainer');
});

test('새 식별자는 현재 공개 정본과 충돌하지 않고 독립 인계 계약을 지킨다', () => {
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
  for (const forbidden of ['author', 'byline', 'reviewer_name', '박규상']) {
    assert.ok(!serialized.includes(forbidden), `인적 표기가 남았습니다: ${forbidden}`);
  }
});

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
