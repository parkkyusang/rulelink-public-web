import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'workplace-harassment.json');
const industrialAccidentPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'industrial-accident.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

const [topic, industrialAccidentTopic, current] = await Promise.all([
  readJson(topicPath),
  readJson(industrialAccidentPath),
  readJson(currentPath),
]);
const sources = new Map(topic.sources.map(source => [source.coordinate_id, source]));
const rules = new Map(topic.rule_cards.map(rule => [rule.rule_id, rule]));
const scenarios = new Map(topic.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
const entries = new Map(topic.content_entries.map(entry => [entry.content_id, entry]));
const currentEntries = new Map(current.knowledge.content_entries.map(entry => [entry.content_id, entry]));
const industrialAccidentEntries = new Map(industrialAccidentTopic.content_entries.map(entry => [entry.content_id, entry]));
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys(), ...industrialAccidentEntries.keys()]);

test('직장 내 괴롭힘·성희롱 10개 생활질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.workplace-harassment');
  assert.equal(topic.sources.length, 12);
  assert.equal(topic.rule_cards.length, 10);
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
    assert.ok(entry.facts_to_check_ko.length >= 8, `${entry.content_id}: 확인 사실이 부족합니다.`);
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

test('활성 DB에서 확인한 현행 조문 12개의 좌표와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['labor_standards_act_ko_0076_02', 'snapshot:3e204759ac760b446fde343e8ae17c17'],
    ['labor_standards_act_ko_0076_03', 'snapshot:f207c432a00d4f67c0cdb0ce1a7eefd5'],
    ['labor_standards_act_ko_0109', 'snapshot:b4b9f59bb50637d9f17e66f6481f858f'],
    ['labor_standards_act_ko_0116', 'snapshot:49d0c816451ea310d95594469cd0d6fb'],
    ['equal_employment_opportunity_work_family_balance_assistance_act_ko_0002', 'snapshot:bb8e73e9a7fd7c6ccdb1d910575266ec'],
    ['equal_employment_opportunity_work_family_balance_assistance_act_ko_0012', 'snapshot:cb0786784ff86afe5fa5c4fca9315f5f'],
    ['equal_employment_opportunity_work_family_balance_assistance_act_ko_0014', 'snapshot:4579f3f3f69df935a4d13ac7b16b88a6'],
    ['equal_employment_opportunity_work_family_balance_assistance_act_ko_0014_02', 'snapshot:85a239d8ab9bccd6deedb8708c3e7024'],
    ['equal_employment_opportunity_work_family_balance_assistance_act_ko_0026', 'snapshot:2592c43d52ab34db0453e522209dce84'],
    ['equal_employment_opportunity_work_family_balance_assistance_act_ko_0037', 'snapshot:cdbc0ffc9fd17dd3f1632d0f1e19eb43'],
    ['equal_employment_opportunity_work_family_balance_assistance_act_ko_0039', 'snapshot:073dcd97dd63f5d1998316b11f1a31fe'],
    ['industrial_accident_compensation_insurance_act_ko_0037', 'snapshot:3c17edff2f521946e5037b0075a80067'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.match(source.source_snapshot_id, /^snapshot:[0-9a-f]{32}$/, source.source_id);
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(!source.official_url.includes('lawView.do'));
    assert.ok(source.official_url.endsWith(`/${encodeURIComponent(source.article_no)}`), source.source_id);
    assert.ok([
      '근로기준법',
      '남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률',
      '산업재해보상보험법',
    ].includes(source.law_name_ko));
  }
  assert.equal(new Set(topic.sources.map(source => source.official_url)).size, 12);

  const serialized = JSON.stringify(topic);
  assert.ok(!serialized.includes('occupational_safety_health_act'));
  assert.ok(!serialized.includes('산업안전보건법'));
  assert.ok(!serialized.includes('20270108'), '2027년 1월 8일 시행 예정 산업안전보건법 판이 혼입됐습니다.');
});

test('표준 유형·현재 검토시각·근거 12/12 역참조를 고정한다', () => {
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
  assert.equal(referenced.size, 12);
  for (const coordinateId of sources.keys()) assert.ok(referenced.has(coordinateId), `미참조 근거: ${coordinateId}`);
});

test('괴롭힘·성희롱의 서로 다른 요건과 조사·보호·구제 분기를 고정한다', () => {
  assert.match(rules.get('rule.workplace-harassment.elements').proposition_ko, /우위의 이용.*업무상 적정범위 초과.*고통 또는 근무환경 악화/);
  assert.match(rules.get('rule.workplace-harassment.report-investigation').norm.legal_effect_ko, /지체 없이.*객관적인 조사/);
  assert.match(rules.get('rule.workplace-harassment.protection-action').norm.legal_effect_ko, /피해자의 의사에 반하지 않는/);
  assert.match(rules.get('rule.workplace-harassment.retaliation-confidentiality').norm.legal_effect_ko, /불리한 처우.*비밀을 누설/);
  assert.match(rules.get('rule.workplace-harassment.sexual-elements').norm.conditions_ko, /성적 언동.*굴욕감·혐오감.*고용상 불이익/);
  assert.match(rules.get('rule.workplace-harassment.customer-sexual').norm.legal_effect_ko, /근무장소 변경.*유급휴가.*불이익/);
  assert.match(rules.get('rule.workplace-harassment.labor-commission').norm.legal_effect_ko, /6개월 안에 노동위원회/);
  assert.match(rules.get('rule.workplace-harassment.mental-illness-industrial-accident').norm.legal_effect_ko, /업무상 질병.*산재보험급여/);

  assert.match(entries.get('content.workplace-harassment-vs-sexual-harassment').one_line_answer_ko, /서로 다른 법정 요건.*함께 적용/);
  assert.match(entries.get('content.sexual-harassment-labor-commission-remedy').caution_ko, /성희롱 사실확인.*시정신청 대상을 혼동하지/);
  assert.match(entries.get('content.harassment-mental-illness-industrial-accident').caution_ko, /자동 인정.*사라지는 것도 아닙니다/);
  assert.deepEqual(
    entries.get('content.harassment-mental-illness-industrial-accident').related_content_ids,
    ['content.industrial-accident-recognition'],
  );
  assert.equal(industrialAccidentTopic.topic_id, 'hub.industrial-accident');
  assert.ok(
    industrialAccidentEntries.has('content.industrial-accident-recognition'),
    'main의 산업재해 주제에 실제 관련 콘텐츠가 없습니다.',
  );
});

test('새 식별자는 현재 정본과 충돌하지 않고 인적 표기·잘린 제목을 막는다', () => {
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
  for (const title of [
    topic.topic_hubs[0].title_ko,
    ...topic.rule_cards.map(item => item.title_ko),
    ...topic.content_entries.map(item => item.title_ko),
  ]) assert.ok(!title.includes('…'), `잘린 제목: ${title}`);
});

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
