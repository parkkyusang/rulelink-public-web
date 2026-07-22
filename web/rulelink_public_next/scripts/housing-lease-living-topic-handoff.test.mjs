import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const [topic, current] = await Promise.all([
  readJson(path.join(repoRoot, 'artifacts', 'publication', 'topics', 'housing-lease-living.json')),
  readJson(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json')),
]);
const sources = new Map(topic.sources.map(item => [item.coordinate_id, item]));
const rules = new Map(topic.rule_cards.map(item => [item.rule_id, item]));
const scenarios = new Map(topic.scenario_branches.map(item => [item.scenario_id, item]));
const entries = new Map(topic.content_entries.map(item => [item.content_id, item]));
const currentEntries = new Map(current.knowledge.content_entries.map(item => [item.content_id, item]));
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys()]);
const allowedTypes = new Set([
  'law_change','doctrine_explainer','fact_branch','precedent_doctrine',
  'similar_case_comparison','misconception_correction','procedure_evidence',
  'recurring_issue_generalization',
]);

test('주택임대차 유지단계 10개 질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.housing-lease-living');
  assert.equal(topic.sources.length, 13);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);
  for (const rule of rules.values()) {
    assert.ok(rule.source_coordinate_ids.length > 0);
    assert.notEqual(normalize(rule.proposition_ko), normalize(rule.norm.legal_effect_ko));
    for (const id of rule.source_coordinate_ids) assert.ok(sources.has(id), `${rule.rule_id}: 없는 근거 ${id}`);
  }
  for (const scenario of scenarios.values()) {
    for (const id of scenario.rule_ids) assert.ok(rules.has(id), `${scenario.scenario_id}: 없는 법리 ${id}`);
    for (const id of scenario.source_coordinate_ids) assert.ok(sources.has(id), `${scenario.scenario_id}: 없는 근거 ${id}`);
  }
  for (const entry of entries.values()) {
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(allowedTypes.has(entry.content_type), `${entry.content_id}: 비표준 유형 ${entry.content_type}`);
    assert.ok(entry.audience_situation_ko.trim());
    assert.ok(entry.key_points_ko.length >= 3 && entry.action_steps_ko.length >= 5);
    assert.ok(entry.facts_to_check_ko.length >= 8 && entry.body_sections.length >= 2);
    assert.ok(entry.search_intents_ko.length >= 3);
    for (const id of entry.rule_ids) assert.ok(rules.has(id));
    for (const id of entry.scenario_ids) assert.ok(scenarios.has(id));
    for (const id of entry.source_coordinate_ids) assert.ok(sources.has(id));
    for (const id of entry.related_content_ids) assert.ok(relatedUniverse.has(id), `${entry.content_id}: 없는 관련 콘텐츠 ${id}`);
  }
});

test('현행 민법·주택임대차법·신고법 13개 좌표와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['civil_act_ko_0623','snapshot:d53633aafa631d5b1fa9cf28e8cac6e9'],
    ['civil_act_ko_0626','snapshot:272fa1038442160c56a6343cb6daf914'],
    ['civil_act_ko_0629','snapshot:4c9fd4dfe63651fba4752bf2105aa4c5'],
    ['civil_act_ko_0640','snapshot:4729629d3ad0fab5a386ea0a1c333b5e'],
    ['housing_lease_ko_0004','snapshot:11e0783c1cc4e005c0bf520349c267a3'],
    ['housing_lease_ko_0006','snapshot:2df240ef9ffb2294a3887761f7ebcb45'],
    ['housing_lease_ko_0006_02','snapshot:af22efddc1288737a5496328e1653086'],
    ['housing_lease_ko_0006_03','snapshot:e16081afb1f30eb250e08152e8ff1237'],
    ['housing_lease_ko_0007','snapshot:2bb0c3e5ac78e9b13d32ef019047b9be'],
    ['law_012480_ko_0006_02','snapshot:66162f6aeae2ee362eebaf5ea6d81d76'],
    ['law_012480_ko_0006_03','snapshot:19816c8f8e5759e7acab7ca120122619'],
    ['law_012480_ko_0028','snapshot:38b91c67fb57ef4f25e3026d02ec843e'],
    ['law_012790_ko_0004_03','snapshot:fdcc934869d52e4effcd5087ff86dbbf3'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(!source.official_url.includes('lawView.do'));
  }
});

test('수선·2기연체·갱신·5퍼센트·30일의 오해방지 기준을 고정한다', () => {
  assert.match(rules.get('rule.housing-lease-living.repair-duty').proposition_ko, /사용·수익.*필요한 상태/);
  assert.match(rules.get('rule.housing-lease-living.repair-reimbursement').proposition_ko, /필요비.*유익비.*종료/);
  assert.match(rules.get('rule.housing-lease-living.sublease').proposition_ko, /동의 없이.*전대.*해지/);
  assert.match(rules.get('rule.housing-lease-living.rent-arrears').proposition_ko, /2기의 차임액.*자동 종료/);
  assert.match(rules.get('rule.housing-lease-living.minimum-term').proposition_ko, /2년.*임차인은.*짧은 기간/);
  assert.match(rules.get('rule.housing-lease-living.renewal-request').proposition_ko, /6개월 전부터 2개월 전까지.*1회.*2년/);
  assert.match(rules.get('rule.housing-lease-living.actual-residence').proposition_ko, /직계존비속.*제3자.*손해배상/);
  assert.match(rules.get('rule.housing-lease-living.increase-limit').proposition_ko, /1년.*20분의 1/);
  assert.match(rules.get('rule.housing-lease-living.tacit-renewal').proposition_ko, /동일 조건.*3개월/);
  assert.match(rules.get('rule.housing-lease-living.lease-report').proposition_ko, /6천만원.*30만원.*30일/);

  assert.match(entries.get('content.housing-lease-living-rent-arrears').caution_ko, /보증금이 충분.*연체가 없던 것이 되지/);
  assert.match(entries.get('content.housing-lease-living-minimum-term').caution_ko, /법정 2년.*계약갱신요구권.*다른 제도/);
  assert.match(entries.get('content.housing-lease-living-increase-limit').caution_ko, /신규계약.*기존 계약의 증액청구/);
  assert.match(entries.get('content.housing-lease-living-lease-report').caution_ko, /대항력·우선변제권.*자동 완성/);
});

test('기존 보증금·대항력 상세 정본으로 외부 이동을 닫는다', () => {
  const expected = new Map([
    ['content.housing-lease-living-tacit-renewal',['content.move-before-deposit-refund','content.lease-registration-application-is-not-completion']],
    ['content.housing-lease-living-lease-report',['content.housing-lease-opposability-basics','content.housing-lease-priority-repayment-basics']],
  ]);
  for (const [entryId, ids] of expected) {
    assert.deepEqual(entries.get(entryId).related_content_ids, ids);
    for (const id of ids) assert.ok(currentEntries.has(id), `현재 정본에 외부 연결 대상이 없습니다: ${id}`);
  }
});

test('표준 유형·식별자·인적표기·잘린 제목을 고정한다', () => {
  const serialized = JSON.stringify(topic);
  const keys = collectKeys(topic);
  for (const key of ['author','byline','reviewer_name']) assert.ok(!keys.has(key), `금지 필드: ${key}`);
  for (const text of ['procedure_guide','remedy_guide','박규상','동순…']) assert.ok(!serialized.includes(text));
  const currentIds = new Set([
    ...current.knowledge.sources.map(x => x.coordinate_id),
    ...current.knowledge.rule_cards.map(x => x.rule_id),
    ...current.knowledge.scenario_branches.map(x => x.scenario_id),
    ...current.knowledge.content_entries.map(x => x.content_id),
    ...current.knowledge.topic_hubs.map(x => x.hub_id),
  ]);
  const newIds = [
    ...topic.sources.map(x => x.coordinate_id),
    ...topic.rule_cards.map(x => x.rule_id),
    ...topic.scenario_branches.map(x => x.scenario_id),
    ...topic.content_entries.map(x => x.content_id),
    ...topic.topic_hubs.map(x => x.hub_id),
  ];
  assert.equal(new Set(newIds).size, newIds.length);
  for (const id of newIds) assert.ok(!currentIds.has(id), `현재 정본과 충돌: ${id}`);
  for (const title of [topic.topic_hubs[0].title_ko, ...topic.rule_cards.map(x=>x.title_ko), ...topic.content_entries.map(x=>x.title_ko)]) {
    assert.ok(!title.includes('…'), `잘린 제목: ${title}`);
  }
});

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) for (const item of value) collectKeys(item, keys);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    keys.add(key);
    collectKeys(item, keys);
  }
  return keys;
}
function normalize(value) { return value.replace(/\s+/g, ' ').trim(); }
async function readJson(filePath) { return JSON.parse(await readFile(filePath, 'utf8')); }
