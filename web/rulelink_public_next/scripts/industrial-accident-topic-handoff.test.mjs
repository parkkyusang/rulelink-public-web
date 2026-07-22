import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'industrial-accident.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

const [topic, current] = await Promise.all([readJson(topicPath), readJson(currentPath)]);
const sources = new Map(topic.sources.map(source => [source.coordinate_id, source]));
const rules = new Map(topic.rule_cards.map(rule => [rule.rule_id, rule]));
const scenarios = new Map(topic.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
const entries = new Map(topic.content_entries.map(entry => [entry.content_id, entry]));
const currentEntries = new Map(current.knowledge.content_entries.map(entry => [entry.content_id, entry]));
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys()]);

test('산업재해·산재보험 10개 생활질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.industrial-accident');
  assert.equal(topic.sources.length, 14);
  assert.equal(topic.rule_cards.length, 11);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
  assert.equal(topic.topic_hubs.length, 1);
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);

  for (const rule of rules.values()) {
    assert.ok(rule.source_coordinate_ids.length > 0, `${rule.rule_id}: 공식 근거가 없습니다.`);
    assert.notEqual(
      normalize(rule.proposition_ko),
      normalize(rule.norm.legal_effect_ko),
      `${rule.rule_id}: 적용명제와 법률효과가 중복됩니다.`,
    );
    assert.ok(rule.norm.actor_ko.trim() && rule.norm.conditions_ko.trim() && rule.norm.legal_effect_ko.trim());
    for (const sourceId of rule.source_coordinate_ids) {
      assert.ok(sources.has(sourceId), `${rule.rule_id}: 없는 근거 ${sourceId}`);
    }
  }

  for (const scenario of scenarios.values()) {
    assert.ok(scenario.rule_ids.length > 0, `${scenario.scenario_id}: 연결 법리가 없습니다.`);
    assert.ok(scenario.source_coordinate_ids.length > 0, `${scenario.scenario_id}: 연결 근거가 없습니다.`);
    for (const ruleId of scenario.rule_ids) assert.ok(rules.has(ruleId), `${scenario.scenario_id}: 없는 법리 ${ruleId}`);
    for (const sourceId of scenario.source_coordinate_ids) {
      assert.ok(sources.has(sourceId), `${scenario.scenario_id}: 없는 근거 ${sourceId}`);
    }
  }

  for (const entry of entries.values()) {
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(entry.audience_situation_ko.trim(), `${entry.content_id}: 대상 상황이 없습니다.`);
    assert.ok(entry.key_points_ko.length >= 3, `${entry.content_id}: 핵심 요점이 부족합니다.`);
    assert.ok(entry.action_steps_ko.length >= 5, `${entry.content_id}: 행동 단계가 부족합니다.`);
    assert.ok(entry.facts_to_check_ko.length >= 7, `${entry.content_id}: 확인 사실이 부족합니다.`);
    assert.ok(entry.body_sections.length >= 2, `${entry.content_id}: 본문 구성이 부족합니다.`);
    assert.ok(entry.search_intents_ko.length >= 3, `${entry.content_id}: 검색 의도가 부족합니다.`);
    assert.ok(entry.rule_ids.length > 0 && entry.scenario_ids.length > 0 && entry.source_coordinate_ids.length > 0);
    for (const ruleId of entry.rule_ids) assert.ok(rules.has(ruleId), `${entry.content_id}: 없는 법리 ${ruleId}`);
    for (const scenarioId of entry.scenario_ids) {
      assert.ok(scenarios.has(scenarioId), `${entry.content_id}: 없는 분기 ${scenarioId}`);
    }
    for (const sourceId of entry.source_coordinate_ids) {
      assert.ok(sources.has(sourceId), `${entry.content_id}: 없는 근거 ${sourceId}`);
    }
    for (const relatedId of entry.related_content_ids) {
      assert.ok(relatedUniverse.has(relatedId), `${entry.content_id}: 없는 관련 콘텐츠 ${relatedId}`);
    }
  }
});

test('활성 DB에서 확인한 현행 산재보험법 14개 조문 좌표와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['industrial_accident_compensation_insurance_act_ko_0005', 'snapshot:9fd58a63b8024215d097233c714e8654'],
    ['industrial_accident_compensation_insurance_act_ko_0006', 'snapshot:f99b8b7b3150ee745988c2d4cbd7f3cc'],
    ['industrial_accident_compensation_insurance_act_ko_0036', 'snapshot:26d40f2dd6d3b3d75a8681d90528abb5'],
    ['industrial_accident_compensation_insurance_act_ko_0037', 'snapshot:3c17edff2f521946e5037b0075a80067'],
    ['industrial_accident_compensation_insurance_act_ko_0040', 'snapshot:27fcb917f3a457c120fd9cb4ac0ffc19'],
    ['industrial_accident_compensation_insurance_act_ko_0052', 'snapshot:84b3d54399ee5678aef65aed3c977b87'],
    ['industrial_accident_compensation_insurance_act_ko_0057', 'snapshot:4eedafc672cd3cc440f0a33ed023f152'],
    ['industrial_accident_compensation_insurance_act_ko_0062', 'snapshot:bdfc129e5fa2e2f38012db7e7aaa4119'],
    ['industrial_accident_compensation_insurance_act_ko_0071', 'snapshot:f847fe29e000b2cd297b109ab88b25ae'],
    ['industrial_accident_compensation_insurance_act_ko_0112', 'snapshot:8de7b72ba6bd5c5449bc4acb48168a6f'],
    ['industrial_accident_compensation_insurance_act_ko_0116', 'snapshot:37008f9c8dd9b9b6d054afbe12e1f3ce'],
    ['industrial_accident_compensation_insurance_act_ko_0123', 'snapshot:33951c0efd472136b764855a49d11951'],
    ['industrial_accident_compensation_insurance_act_ko_0123_02', 'snapshot:bec15a7c4759eaaa3e7952857d855d78'],
    ['industrial_accident_compensation_insurance_act_ko_0124', 'snapshot:fb91d3c1da7afaad9a358760299f50cc'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  const officialLawUrl = 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%82%B0%EC%97%85%EC%9E%AC%ED%95%B4%EB%B3%B4%EC%83%81%EB%B3%B4%ED%97%98%EB%B2%95';
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.match(source.source_snapshot_id, /^snapshot:[0-9a-f]{32}$/, source.source_id);
    assert.equal(source.law_name_ko, '산업재해보상보험법');
    assert.equal(source.official_url, `${officialLawUrl}/${encodeURIComponent(source.article_no)}`, source.source_id);
  }
  assert.equal(new Set(topic.sources.map(source => source.official_url)).size, 14);
});

test('표준 유형·현재 검토시각·근거 14/14 역참조와 의존 식별자를 고정한다', () => {
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

  assert.ok(entries.has('content.industrial-accident-recognition'), '#101 의존 식별자가 사라졌습니다.');
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
  assert.equal(referenced.size, 14);
  for (const coordinateId of sources.keys()) assert.ok(referenced.has(coordinateId), `미참조 근거: ${coordinateId}`);
});

test('산재 인정·급여·시효의 핵심 수치와 분기 표현을 고정한다', () => {
  assert.match(rules.get('rule.industrial-accident.recognition').proposition_ko, /상당인과관계/);
  assert.match(rules.get('rule.industrial-accident.commute-route').norm.legal_effect_ko, /일탈·중단.*일상생활/);
  assert.match(rules.get('rule.industrial-accident.medical-benefit').norm.conditions_ko, /3일을 초과/);
  assert.match(rules.get('rule.industrial-accident.temporary-disability').norm.legal_effect_ko, /평균임금의 70퍼센트/);
  assert.match(rules.get('rule.industrial-accident.disability-benefit').norm.legal_effect_ko, /연금.*일시금/);
  assert.match(rules.get('rule.industrial-accident.limitation').norm.legal_effect_ko, /원칙적으로 3년.*5년/);
  assert.match(entries.get('content.industrial-accident-employer-refusal').one_line_answer_ko, /회사 확인이나 동의.*막히는 것은 아니며/);
  assert.match(entries.get('content.industrial-accident-survivor-funeral').caution_ko, /상속인.*수급권자.*아니며/);
});

test('기존 산재 민사배상 비교와 교차연결하고 식별자 충돌·인적 표기를 막는다', () => {
  assert.ok(currentEntries.has('content.industrial-accident-benefits-vs-civil-damages'));
  for (const id of [
    'content.industrial-accident-recognition',
    'content.industrial-accident-benefit-map',
  ]) {
    assert.ok(
      entries.get(id).related_content_ids.includes('content.industrial-accident-benefits-vs-civil-damages'),
      `${id}: 기존 산재·민사배상 비교 연결 누락`,
    );
  }

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
