import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const [topic, current] = await Promise.all([
  readJson(path.join(repoRoot, 'artifacts', 'publication', 'topics', 'traffic-criminal-license.json')),
  readJson(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json')),
]);
const sources = new Map(topic.sources.map(item => [item.coordinate_id, item]));
const rules = new Map(topic.rule_cards.map(item => [item.rule_id, item]));
const scenarios = new Map(topic.scenario_branches.map(item => [item.scenario_id, item]));
const entries = new Map(topic.content_entries.map(item => [item.content_id, item]));
const currentEntries = new Map(current.knowledge.content_entries.map(item => [item.content_id, item]));
const pendingExternal = new Set([
  'content.auto-accident-insurance-immediate-response',
  'content.auto-accident-insurance-police-report',
  'content.auto-accident-insurance-settlement-criminal-effect',
  'content.auto-accident-insurance-comprehensive-insurance-criminal',
  'content.suspect-rights-right-to-silence',
  'content.suspect-rights-counsel-during-questioning',
  'content.suspect-rights-statement-record-and-illegal-evidence',
]);
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys(), ...pendingExternal]);
const allowedTypes = new Set([
  'law_change','doctrine_explainer','fact_branch','precedent_doctrine',
  'similar_case_comparison','misconception_correction','procedure_evidence',
  'recurring_issue_generalization',
]);

test('음주운전·도주·면허처분 10개 질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.traffic-criminal-license');
  assert.equal(topic.sources.length, 11);
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
    assert.ok(scenario.question_ko.trim() && scenario.decision_fact_ko.trim());
    for (const id of scenario.rule_ids) assert.ok(rules.has(id), `${scenario.scenario_id}: 없는 법리 ${id}`);
    for (const id of scenario.source_coordinate_ids) assert.ok(sources.has(id), `${scenario.scenario_id}: 없는 근거 ${id}`);
  }
  for (const entry of entries.values()) {
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(allowedTypes.has(entry.content_type), `${entry.content_id}: 비표준 유형 ${entry.content_type}`);
    assert.ok(entry.audience_situation_ko.trim());
    assert.ok(entry.key_points_ko.length >= 3 && entry.action_steps_ko.length >= 4);
    assert.ok(entry.facts_to_check_ko.length >= 6 && entry.body_sections.length >= 2);
    assert.ok(entry.search_intents_ko.length >= 3);
    for (const id of entry.rule_ids) assert.ok(rules.has(id));
    for (const id of entry.scenario_ids) assert.ok(scenarios.has(id));
    for (const id of entry.source_coordinate_ids) assert.ok(sources.has(id));
    for (const id of entry.related_content_ids) assert.ok(relatedUniverse.has(id), `${entry.content_id}: 없는 관련 콘텐츠 ${id}`);
  }
});

test('현행 교통·도주 조문 11개 좌표와 2026년 효력판을 고정한다', () => {
  const expected = new Map([
    ['road_traffic_ko_0044','snapshot:c21a9e922d796ffd7fb617002dcc8196'],
    ['road_traffic_ko_0050_03','snapshot:cd9ded21df5d68ff3e77221e03ee2aa'],
    ['road_traffic_ko_0054','snapshot:5951578fbe50d0d3b541b014dd721d7'],
    ['road_traffic_ko_0080_02','snapshot:eaf57ac6a141c3fd0cc2882869f3fd5'],
    ['road_traffic_ko_0082','snapshot:7b4e96511af8d16b67bb07cfcbd80b'],
    ['road_traffic_ko_0093','snapshot:897f44dffdc5c127397924ce8659e2a'],
    ['road_traffic_ko_0094','snapshot:ad74e0e0b2c57ada48a4ea309ebc9d'],
    ['road_traffic_ko_0148','snapshot:a0be7ec2581b41b60f9d0b7f929e0c'],
    ['road_traffic_ko_0148_02','snapshot:b62534cea39c6921deea8f768bea017'],
    ['traffic_accident_special_ko_0003','snapshot:1851b667d470fbf9b9074eef5c87eaeb'],
    ['aggravated_specific_crimes_ko_0005_03','snapshot:0405f419bfdc2dfbb4b425df98506470'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(source.official_url.endsWith(encodeURIComponent(source.article_no)));
    assert.ok(!source.official_url.includes('lawView.do'));
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

test('0.03퍼센트·측정방해·10년·도주·면허 불복·방지장치 기준을 고정한다', () => {
  assert.match(rules.get('rule.traffic-criminal-license.drunk-threshold').proposition_ko, /0\.03퍼센트/);
  assert.match(rules.get('rule.traffic-criminal-license.breath-blood-test').proposition_ko, /동의.*혈액 채취/);
  assert.match(rules.get('rule.traffic-criminal-license.refusal-obstruction').proposition_ko, /추가로 술.*물품/);
  assert.match(rules.get('rule.traffic-criminal-license.penalty-repeat').proposition_ko, /10년 내 재위반/);
  assert.match(rules.get('rule.traffic-criminal-license.hit-and-run').proposition_ko, /구호조치.*도주/);
  assert.match(rules.get('rule.traffic-criminal-license.license-criminal-separation').proposition_ko, /근거와 절차가 다른/);
  assert.match(rules.get('rule.traffic-criminal-license.license-objection').proposition_ko, /60일.*90일/);
  assert.match(rules.get('rule.traffic-criminal-license.disqualification-reacquisition').proposition_ko, /의무교육/);
  assert.match(rules.get('rule.traffic-criminal-license.ignition-interlock').proposition_ko, /5년 안.*조건부면허/);
  assert.match(rules.get('rule.traffic-criminal-license.interlock-compliance').proposition_ko, /대리 호흡/);
  assert.match(entries.get('content.traffic-criminal-license-refusal-obstruction').caution_ko, /침묵.*호흡측정 불응/);
  assert.match(entries.get('content.traffic-criminal-license-license-objection').caution_ko, /기한/);
});

test('자동차사고·피의자권리·행정불복 정본으로 실제 외부 연결을 닫는다', () => {
  const required = new Map([
    ['content.traffic-criminal-license-refusal-obstruction',[
      'content.suspect-rights-right-to-silence',
      'content.suspect-rights-counsel-during-questioning',
    ]],
    ['content.traffic-criminal-license-hit-and-run',[
      'content.auto-accident-insurance-immediate-response',
      'content.auto-accident-insurance-police-report',
      'content.crime-evidence-preservation-first-steps',
    ]],
    ['content.traffic-criminal-license-license-objection',[
      'content.administrative-appeal-vs-revocation-lawsuit',
      'content.administrative-appeal-suspension-vs-court-suspension',
    ]],
  ]);
  for (const [entryId, ids] of required) {
    const related = entries.get(entryId).related_content_ids;
    for (const id of ids) assert.ok(related.includes(id), `${entryId}: 외부 연결 누락 ${id}`);
  }
  for (const id of [
    'content.crime-evidence-preservation-first-steps',
    'content.administrative-appeal-vs-revocation-lawsuit',
    'content.administrative-appeal-suspension-vs-court-suspension',
  ]) assert.ok(currentEntries.has(id), `현재 정본에 외부 연결 대상이 없습니다: ${id}`);
  for (const id of pendingExternal) assert.ok([...entries.values()].some(entry => entry.related_content_ids.includes(id)), `대기열 외부 연결 미사용: ${id}`);
});

test('표준 유형·식별자·인적표기·잘린 제목을 고정한다', () => {
  const serialized = JSON.stringify(topic);
  const keys = collectKeys(topic);
  for (const key of ['author','byline','reviewer_name']) assert.ok(!keys.has(key), `금지 필드: ${key}`);
  for (const text of ['procedure_guide','remedy_guide','deadline_explainer','comparison','박규상','동순…']) {
    assert.ok(!serialized.includes(text), `금지 표현 또는 비표준 유형: ${text}`);
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
  for (const id of newIds) assert.ok(!currentIds.has(id), `현재 정본과 충돌: ${id}`);
  for (const title of [topic.topic_hubs[0].title_ko, ...topic.rule_cards.map(x => x.title_ko), ...topic.content_entries.map(x => x.title_ko)]) {
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
