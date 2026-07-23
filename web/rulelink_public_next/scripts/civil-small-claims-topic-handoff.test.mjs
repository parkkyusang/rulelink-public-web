import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'civil-small-claims.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const [topic, current] = await Promise.all([readJson(topicPath), readJson(currentPath)]);
const sources = new Map(topic.sources.map(item => [item.coordinate_id, item]));
const rules = new Map(topic.rule_cards.map(item => [item.rule_id, item]));
const scenarios = new Map(topic.scenario_branches.map(item => [item.scenario_id, item]));
const entries = new Map(topic.content_entries.map(item => [item.content_id, item]));
const currentEntries = new Map(current.knowledge.content_entries.map(item => [item.content_id, item]));
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys()]);
const allowedContentTypes = new Set([
  'law_change',
  'doctrine_explainer',
  'fact_branch',
  'precedent_doctrine',
  'similar_case_comparison',
  'misconception_correction',
  'procedure_evidence',
  'recurring_issue_generalization',
]);

test('민사소송·소액재판 10개 생활질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.civil-small-claims');
  assert.equal(topic.sources.length, 20);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
  assert.equal(topic.topic_hubs.length, 1);
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);

  for (const rule of rules.values()) {
    assert.ok(rule.source_coordinate_ids.length > 0, `${rule.rule_id}: 공식 근거가 없습니다.`);
    assert.notEqual(normalize(rule.proposition_ko), normalize(rule.norm.legal_effect_ko));
    assert.ok(rule.norm.actor_ko.trim() && rule.norm.conditions_ko.trim() && rule.norm.legal_effect_ko.trim());
    for (const id of rule.source_coordinate_ids) assert.ok(sources.has(id), `${rule.rule_id}: 없는 근거 ${id}`);
  }
  for (const scenario of scenarios.values()) {
    assert.ok(scenario.rule_ids.length > 0 && scenario.source_coordinate_ids.length > 0);
    for (const id of scenario.rule_ids) assert.ok(rules.has(id), `${scenario.scenario_id}: 없는 법리 ${id}`);
    for (const id of scenario.source_coordinate_ids) assert.ok(sources.has(id), `${scenario.scenario_id}: 없는 근거 ${id}`);
  }
  for (const entry of entries.values()) {
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(allowedContentTypes.has(entry.content_type), `${entry.content_id}: 비표준 유형 ${entry.content_type}`);
    assert.ok(entry.audience_situation_ko.trim());
    assert.ok(entry.key_points_ko.length >= 3);
    assert.ok(entry.action_steps_ko.length >= 5);
    assert.ok(entry.facts_to_check_ko.length >= 8);
    assert.ok(entry.body_sections.length >= 2);
    assert.ok(entry.search_intents_ko.length >= 3);
    for (const id of entry.rule_ids) assert.ok(rules.has(id), `${entry.content_id}: 없는 법리 ${id}`);
    for (const id of entry.scenario_ids) assert.ok(scenarios.has(id), `${entry.content_id}: 없는 분기 ${id}`);
    for (const id of entry.source_coordinate_ids) assert.ok(sources.has(id), `${entry.content_id}: 없는 근거 ${id}`);
    for (const id of entry.related_content_ids) assert.ok(relatedUniverse.has(id), `${entry.content_id}: 없는 관련 콘텐츠 ${id}`);
  }
});

test('현행 민사소송법·소액사건심판법·규칙 20개 좌표와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['civil_procedure_ko_0002','snapshot:969be7b51c16c23d167b18ff35cb459c'],
    ['civil_procedure_ko_0008','snapshot:22b6333e3c581e1dc12897235705fbe0'],
    ['civil_procedure_ko_0098','snapshot:8b7151452ab30b6414b8da919a054679'],
    ['civil_procedure_ko_0202','snapshot:8f7dc9abe7d4b880719ea17f80ae6772'],
    ['civil_procedure_ko_0213','snapshot:788a76ae5522ff0eee2c3ab2825a8e0b'],
    ['civil_procedure_ko_0248','snapshot:2d1d8302cd09563aba0e9b66c5edc1ad'],
    ['civil_procedure_ko_0249','snapshot:56cc66bdcfbeb07c8edc013125ecc45c'],
    ['civil_procedure_ko_0256','snapshot:b81d9209b2834410a310e9af60e171a0'],
    ['civil_procedure_ko_0257','snapshot:7aa30b0312c82a6781170eca965121fd'],
    ['civil_procedure_ko_0396','snapshot:e94632c5b41d6a854849fb5a3374e74d'],
    ['law_005899_ko_0001_02','snapshot:bed671e0a17edbe9064bdb5a4afdf24b'],
    ['small_claims_trial_ko_0004','snapshot:5569e2a604056a00105372998cb7df76'],
    ['small_claims_trial_ko_0005_02','snapshot:60c8b6750fda606a1e9bd79d143deac4'],
    ['small_claims_trial_ko_0005_03','snapshot:d412b7de1e29c416045f75d6021e6e48'],
    ['small_claims_trial_ko_0005_04','snapshot:d3e67c24b901bfc9e724ed8cc86bff10'],
    ['small_claims_trial_ko_0005_07','snapshot:f9d22ee0c5f86476a141b53d063ab72f'],
    ['small_claims_trial_ko_0005_08','snapshot:b7d1887798292fb566c57c1ea19af9b7'],
    ['small_claims_trial_ko_0007','snapshot:7a6dcbcc269b66ee0f8700b8938cec55'],
    ['small_claims_trial_ko_0008','snapshot:c95ec81683d1d1c52e40eed3cd05e3d8'],
    ['small_claims_trial_ko_0011_02','snapshot:5d0d3b5b9d96dab4cf7a7f53ebfda9ed'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.ok(['민사소송법','소액사건심판법','소액사건심판규칙'].includes(source.law_name_ko));
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(!source.official_url.includes('lawView.do'));
  }
});

test('관할·3천만원·답변·이행권고·집행·항소의 혼동 방지 법리를 고정한다', () => {
  assert.match(rules.get('rule.civil-small-claims.jurisdiction').proposition_ko, /피고의 보통재판적.*의무이행지/);
  assert.match(rules.get('rule.civil-small-claims.small-claim-scope').proposition_ko, /3천만원 이하.*일부만 떼어/);
  assert.match(rules.get('rule.civil-small-claims.filing-method').proposition_ko, /소장을 제출.*구술/);
  assert.match(rules.get('rule.civil-small-claims.complaint-content').proposition_ko, /청구취지.*청구원인/);
  assert.match(rules.get('rule.civil-small-claims.answer-default').norm.legal_effect_ko, /30일.*무대응.*변론 없는 판결/);
  assert.match(rules.get('rule.civil-small-claims.evidence-hearing').proposition_ko, /한 차례 변론기일.*증거/);
  assert.match(rules.get('rule.civil-small-claims.performance-recommendation').norm.legal_effect_ko, /이의.*소송절차.*확정판결과 같은 효력/);
  assert.match(rules.get('rule.civil-small-claims.family-representation').proposition_ko, /배우자·직계혈족·형제자매.*신분관계와 수권관계/);
  assert.match(rules.get('rule.civil-small-claims.judgment-enforcement').proposition_ko, /가집행.*집행문 없이/);
  assert.match(rules.get('rule.civil-small-claims.costs-appeal').proposition_ko, /패소자.*송달된 날부터 2주/);

  assert.match(entries.get('content.civil-small-claims-performance-recommendation').caution_ko, /지급명령.*별도 제도/);
  assert.match(entries.get('content.civil-small-claims-judgment-enforcement').caution_ko, /가집행.*최종 확정.*원상회복/);
  assert.match(entries.get('content.civil-small-claims-costs-appeal').caution_ko, /협의 중.*2주 기간이 멈추지/);
});

test('기존 지급명령·강제집행 상세 정본으로 외부 연결을 닫는다', () => {
  const expected = new Map([
    ['content.civil-small-claims-small-claim-scope',['content.payment-order-vs-civil-lawsuit','content.when-payment-order-fits']],
    ['content.civil-small-claims-performance-recommendation',['content.documents-that-allow-compulsory-enforcement','content.payment-order-objection-two-weeks']],
    ['content.civil-small-claims-judgment-enforcement',['content.documents-that-allow-compulsory-enforcement','content.bank-account-seizure-and-collection-order','content.property-disclosure-when-assets-unknown']],
  ]);
  for (const [entryId, relatedIds] of expected) {
    assert.deepEqual(entries.get(entryId).related_content_ids, relatedIds);
    for (const id of relatedIds) assert.ok(currentEntries.has(id), `현재 정본에 외부 연결 대상이 없습니다: ${id}`);
  }
});

test('표준 콘텐츠 유형과 새 식별자·표시 품질을 고정한다', () => {
  const types = new Set(topic.content_entries.map(item => item.content_type));
  assert.deepEqual(types, new Set(['procedure_evidence','doctrine_explainer']));
  const serialized = JSON.stringify(topic);
  for (const forbidden of ['procedure_guide','remedy_guide','author','byline','reviewer_name','박규상','동순…']) {
    assert.ok(!serialized.includes(forbidden), `금지 표현이 남았습니다: ${forbidden}`);
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
  const integrated = current.knowledge.topic_hubs.some(item => item.hub_id === topic.topic_hubs[0].hub_id);
  for (const id of newIds) assert.equal(currentIds.has(id), integrated, `정본 통합 상태 불일치: ${id}`);
  for (const title of [
    topic.topic_hubs[0].title_ko,
    ...topic.rule_cards.map(item => item.title_ko),
    ...topic.content_entries.map(item => item.title_ko),
  ]) assert.ok(!title.includes('…'), `잘린 제목: ${title}`);
});


test('20개 공식 근거가 모두 실제 법리·분기·콘텐츠에서 역참조된다', () => {
  const referenced = new Set([
    ...topic.rule_cards.flatMap(item => item.source_coordinate_ids),
    ...topic.scenario_branches.flatMap(item => item.source_coordinate_ids),
    ...topic.content_entries.flatMap(item => item.source_coordinate_ids),
  ]);
  assert.equal(referenced.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.ok(referenced.has(source.coordinate_id), `사용되지 않은 근거: ${source.coordinate_id}`);
  }
});

test('공식 URL 20개와 실제 검증시각을 고정한다', () => {
  assert.equal(new Set(topic.sources.map(item => item.official_url)).size, 20);
  for (const source of topic.sources) {
    assert.equal(source.last_verified_at, '2026-07-22T22:45:00+00:00');
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
  }
  for (const entry of topic.content_entries) {
    assert.equal(entry.reviewed_at, '2026-07-22T22:45:00+00:00');
  }
});

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}
async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
