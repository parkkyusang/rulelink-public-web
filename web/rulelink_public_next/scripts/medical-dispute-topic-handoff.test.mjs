import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'medical-dispute.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const [topic, current] = await Promise.all([readJson(topicPath), readJson(currentPath)]);

const sources = new Map(topic.sources.map(item => [item.coordinate_id, item]));
const rules = new Map(topic.rule_cards.map(item => [item.rule_id, item]));
const scenarios = new Map(topic.scenario_branches.map(item => [item.scenario_id, item]));
const entries = new Map(topic.content_entries.map(item => [item.content_id, item]));

test('의료사고·의료분쟁 10개 생활질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.medical-dispute');
  assert.equal(topic.sources.length, 13);
  assert.equal(topic.rule_cards.length, 12);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);

  for (const rule of rules.values()) {
    assert.ok(rule.source_coordinate_ids.length > 0, `${rule.rule_id}: 공식 근거가 없습니다.`);
    assert.notEqual(normalize(rule.proposition_ko), normalize(rule.norm.legal_effect_ko), `${rule.rule_id}: 핵심 법리와 법적 효과가 중복됩니다.`);
    for (const sourceId of rule.source_coordinate_ids) assert.ok(sources.has(sourceId), `${rule.rule_id}: 없는 근거 ${sourceId}`);
  }

  for (const scenario of scenarios.values()) {
    assert.ok(scenario.rule_ids.length > 0);
    for (const ruleId of scenario.rule_ids) assert.ok(rules.has(ruleId), `${scenario.scenario_id}: 없는 법리 ${ruleId}`);
    for (const sourceId of scenario.source_coordinate_ids) assert.ok(sources.has(sourceId), `${scenario.scenario_id}: 없는 근거 ${sourceId}`);
  }

  for (const entry of entries.values()) {
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(entry.audience_situation_ko.trim());
    assert.ok(entry.key_points_ko.length >= 3, `${entry.content_id}: 핵심요점 부족`);
    assert.ok(entry.action_steps_ko.length >= 4, `${entry.content_id}: 행동단계 부족`);
    assert.ok(entry.facts_to_check_ko.length >= 6, `${entry.content_id}: 확인사실 부족`);
    assert.ok(entry.body_sections.length >= 2, `${entry.content_id}: 본문 부족`);
    for (const ruleId of entry.rule_ids) assert.ok(rules.has(ruleId), `${entry.content_id}: 없는 법리 ${ruleId}`);
    for (const scenarioId of entry.scenario_ids) assert.ok(scenarios.has(scenarioId), `${entry.content_id}: 없는 분기 ${scenarioId}`);
    for (const sourceId of entry.source_coordinate_ids) assert.ok(sources.has(sourceId), `${entry.content_id}: 없는 근거 ${sourceId}`);
    for (const relatedId of entry.related_content_ids) assert.ok(entries.has(relatedId), `${entry.content_id}: 없는 관련 콘텐츠 ${relatedId}`);
  }
});

test('활성 DB에서 확인한 의료법·의료분쟁조정법 조문 13개의 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['medical_act_ko_0021', 'snapshot:bc3ccdfad4f00e1653ca79d0a5cc4e93'],
    ['medical_act_ko_0022', 'snapshot:5bba2aeb82a75e2345be5753eb6d7616'],
    ['medical_act_ko_0024_02', 'snapshot:841d1c5881914f0c6a7afe9e3fcad49f'],
    ['medical_dispute_ko_0027', 'snapshot:0492713e1fb420d4c573d28d25d44490'],
    ['medical_dispute_ko_0028', 'snapshot:0cdad8f39537ee883cbc9bab90a28945'],
    ['medical_dispute_ko_0029', 'snapshot:227aa05f9cdac541d4faf9ed8c8533f6'],
    ['medical_dispute_ko_0032', 'snapshot:b69c7091cba8a5a1b44da88839ccfee0'],
    ['medical_dispute_ko_0033', 'snapshot:a9de4152168695079debf9a5b578fb71'],
    ['medical_dispute_ko_0036', 'snapshot:687d7537958c135aac67cb3a39def3dd'],
    ['medical_dispute_ko_0038', 'snapshot:6abca08da6e59f12b42ac7484bed2b63'],
    ['medical_dispute_ko_0040', 'snapshot:0f60626fd7b62cae58200c2b745ef746'],
    ['medical_dispute_ko_0042', 'snapshot:eb75654b0ccaee5b7bd2f9601b15e49b'],
    ['medical_dispute_ko_0050', 'snapshot:9a6d4a6c9974ee96f14ecc682f9255cc'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.match(source.official_url, /^https:\/\/www\.law\.go\.kr\/%EB%B2%95%EB%A0%B9\//);
    assert.ok(!source.official_url.includes('lawView.do'));
  }
});

test('기록·설명동의·조정개시·감정·결정·시효의 핵심 수치와 효과를 고정한다', () => {
  assert.match(rules.get('rule.medical-dispute.record-access').norm.legal_effect_ko, /추가기재·수정 전후 기록/);
  assert.match(rules.get('rule.medical-dispute.explanation-consent').proposition_ko, /진단명.*필요성·방법.*부작용/);
  assert.match(rules.get('rule.medical-dispute.mediation-application').proposition_ko, /10년.*3년/);
  assert.match(rules.get('rule.medical-dispute.ordinary-commencement').proposition_ko, /14일/);
  assert.match(rules.get('rule.medical-dispute.automatic-commencement').proposition_ko, /사망.*1개월 이상 의식불명/);
  assert.match(rules.get('rule.medical-dispute.investigation-appraisal').norm.legal_effect_ko, /60일.*30일/);
  assert.match(rules.get('rule.medical-dispute.decision-and-effect').proposition_ko, /90일.*30일.*15일/);
  assert.match(rules.get('rule.medical-dispute.decision-and-effect').norm.legal_effect_ko, /재판상 화해/);
  assert.match(rules.get('rule.medical-dispute.lawsuit-and-limitation').norm.legal_effect_ko, /1개월/);
});

test('새 식별자는 현재 공개 정본과 충돌하지 않고 인적 저자 표기를 두지 않는다', () => {
  const currentIds = new Set([
    ...current.knowledge.sources.map(item => item.coordinate_id),
    ...current.knowledge.rule_cards.map(item => item.rule_id),
    ...current.knowledge.scenario_branches.map(item => item.scenario_id),
    ...current.knowledge.content_entries.map(item => item.content_id),
    ...current.knowledge.topic_hubs.map(item => item.hub_id),
  ]);
  const ids = [
    ...topic.sources.map(item => item.coordinate_id),
    ...topic.rule_cards.map(item => item.rule_id),
    ...topic.scenario_branches.map(item => item.scenario_id),
    ...topic.content_entries.map(item => item.content_id),
    ...topic.topic_hubs.map(item => item.hub_id),
  ];
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(!currentIds.has(id), `현재 정본과 식별자 충돌: ${id}`);

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
