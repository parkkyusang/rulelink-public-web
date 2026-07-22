import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const [topic, current] = await Promise.all([
  readJson(path.join(repoRoot, 'artifacts', 'publication', 'topics', 'personal-rehabilitation.json')),
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

test('개인회생 신청·변제·면책 10개 질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.personal-rehabilitation');
  assert.equal(topic.sources.length, 14);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
  assert.equal(topic.topic_hubs.length, 1);
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);
  for (const rule of rules.values()) {
    assert.ok(rule.source_coordinate_ids.length > 0);
    assert.notEqual(normalize(rule.proposition_ko), normalize(rule.norm.legal_effect_ko));
    for (const id of rule.source_coordinate_ids) assert.ok(sources.has(id), rule.rule_id + ': 없는 근거 ' + id);
  }
  for (const scenario of scenarios.values()) {
    assert.ok(scenario.question_ko.trim() && scenario.decision_fact_ko.trim());
    for (const id of scenario.rule_ids) assert.ok(rules.has(id), scenario.scenario_id + ': 없는 법리 ' + id);
    for (const id of scenario.source_coordinate_ids) assert.ok(sources.has(id), scenario.scenario_id + ': 없는 근거 ' + id);
  }
  for (const entry of entries.values()) {
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(allowedTypes.has(entry.content_type), entry.content_id + ': 비표준 유형 ' + entry.content_type);
    assert.ok(entry.audience_situation_ko.trim());
    assert.ok(entry.key_points_ko.length >= 3 && entry.action_steps_ko.length >= 4);
    assert.ok(entry.facts_to_check_ko.length >= 6 && entry.body_sections.length >= 2);
    assert.ok(entry.search_intents_ko.length >= 3);
    for (const id of entry.rule_ids) assert.ok(rules.has(id), entry.content_id + ': 없는 법리 ' + id);
    for (const id of entry.scenario_ids) assert.ok(scenarios.has(id), entry.content_id + ': 없는 분기 ' + id);
    for (const id of entry.source_coordinate_ids) assert.ok(sources.has(id), entry.content_id + ': 없는 근거 ' + id);
    for (const id of entry.related_content_ids) assert.ok(relatedUniverse.has(id), entry.content_id + ': 없는 관련 콘텐츠 ' + id);
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
    assert.ok(referenced.has(source.coordinate_id), '미참조 공식 근거 좌표: ' + source.coordinate_id);
  }
});

test('2026년 7월 23일 현재 효력 근거 14개와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['law_009930_ko_0579','snapshot:39df2882bc3d4bb2adce27a63e80548a'],
    ['law_009930_ko_0588','snapshot:d53ac75b35d1fa4943328c58850cefb2'],
    ['law_009930_ko_0589','snapshot:8b1353f09645b69a237c1c08cbfa8d2a'],
    ['law_009930_ko_0593','snapshot:c8d1a89f8314e1b6d7587f5161df4b18'],
    ['law_009930_ko_0595','snapshot:9d3eec6ca6965bff1b830a1601fe8a94'],
    ['law_009930_ko_0596','snapshot:20204fe441d07da77fe2100e3a91710b'],
    ['law_009930_ko_0600','snapshot:a47fbdd402a60e2259e773397296de51'],
    ['law_009930_ko_0611','snapshot:2fc877b9ffdb92bbf58438de65a9e730'],
    ['law_009930_ko_0614','snapshot:ed0e47fa7299ae7d1f5bc23cc8ae352e'],
    ['law_009930_ko_0619','snapshot:90a49162ebe8df5c360c11d5ed2cf4fe'],
    ['law_009930_ko_0620','snapshot:42fdcefecf849f2783562b12e303d65d'],
    ['law_009930_ko_0621','snapshot:234c2aeab5a0a895456a5f925ef50830'],
    ['law_009930_ko_0624','snapshot:b634a8534417447175ee8758e2e395d3'],
    ['law_009930_ko_0625','snapshot:1ba54db3a5c199c4db0c4f1877d5ee36'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.equal(source.law_name_ko, '채무자 회생 및 파산에 관한 법률');
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(source.official_url.endsWith(encodeURIComponent(source.article_no)));
    assert.ok(!source.official_url.includes('lawView.do'));
  }
});

test('자격·중지명령·개시·변제기간·인가·변경·폐지·면책 핵심효과를 고정한다', () => {
  assert.match(rules.get('rule.personal-rehabilitation.eligibility').proposition_ko, /급여·영업소득자.*담보채무 15억원.*그 밖의 채무 10억원/);
  assert.match(rules.get('rule.personal-rehabilitation.application-documents').proposition_ko, /채권자목록.*재산목록.*수입·지출목록.*소득증명/);
  assert.match(rules.get('rule.personal-rehabilitation.stay-order').proposition_ko, /중지·금지할 수 있고.*기각되면.*다시 진행/);
  assert.doesNotMatch(rules.get('rule.personal-rehabilitation.stay-order').proposition_ko, /자동/);
  assert.match(rules.get('rule.personal-rehabilitation.opening-effects').proposition_ko, /신청일부터 1개월.*결정시부터 효력/);
  assert.match(rules.get('rule.personal-rehabilitation.dismissal-risks').proposition_ko, /최근 5년 이내 면책/);
  assert.match(rules.get('rule.personal-rehabilitation.repayment-period').proposition_ko, /원칙적으로 3년.*5년 이내/);
  assert.match(rules.get('rule.personal-rehabilitation.approval-objection').proposition_ko, /이의하면.*청산가치 보장.*가용소득 전부 제공/);
  assert.match(rules.get('rule.personal-rehabilitation.plan-change').proposition_ko, /변제 완료 전.*변경안/);
  assert.match(rules.get('rule.personal-rehabilitation.procedure-termination').proposition_ko, /인가 전.*인가 후.*폐지사유/);
  assert.match(rules.get('rule.personal-rehabilitation.discharge-scope').proposition_ko, /면책제외채권.*보증인·공동채무자·담보.*영향을 받지/);
});

test('채무집행·보증·금전채무 상세 정본으로 실제 외부 연결을 닫는다', () => {
  const required = new Map([
    ['content.personal-rehabilitation-eligibility',['content.when-default-interest-starts','content.debt-limitation-is-not-always-ten-years']],
    ['content.personal-rehabilitation-application-documents',['content.loan-and-guarantee-evidence-checklist','content.scope-of-guarantee-debt']],
    ['content.personal-rehabilitation-stay-order',['content.bank-account-seizure-and-collection-order','content.wage-and-protected-claim-seizure']],
    ['content.personal-rehabilitation-opening-effects',['content.documents-that-allow-compulsory-enforcement']],
    ['content.personal-rehabilitation-discharge-scope',['content.scope-of-guarantee-debt','content.guarantee-by-message-validity']],
  ]);
  for (const [entryId, ids] of required) {
    const related = entries.get(entryId).related_content_ids;
    for (const id of ids) assert.ok(related.includes(id), entryId + ': 외부 연결 누락 ' + id);
  }
  for (const ids of required.values()) for (const id of ids) {
    assert.ok(currentEntries.has(id), '현재 정본에 외부 연결 대상이 없습니다: ' + id);
  }
});

test('표준 유형·식별자·인적표기·잘린 제목을 고정한다', () => {
  const serialized = JSON.stringify(topic);
  const keys = collectKeys(topic);
  for (const key of ['author','byline','reviewer_name']) assert.ok(!keys.has(key), '금지 필드: ' + key);
  for (const text of ['procedure_guide','remedy_guide','deadline_explainer','박규상','동순…']) {
    assert.ok(!serialized.includes(text), '금지 표현 또는 비표준 유형: ' + text);
  }
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
  for (const id of newIds) assert.ok(!currentIds.has(id), '현재 정본과 충돌: ' + id);
  for (const title of [topic.topic_hubs[0].title_ko, ...topic.rule_cards.map(x => x.title_ko), ...topic.content_entries.map(x => x.title_ko)]) {
    assert.ok(!title.includes('…'), '잘린 제목: ' + title);
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
