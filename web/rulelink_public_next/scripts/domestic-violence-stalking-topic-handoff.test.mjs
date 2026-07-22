import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'domestic-violence-stalking.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const [topic, current] = await Promise.all([readJson(topicPath), readJson(currentPath)]);
const sources = new Map(topic.sources.map(item => [item.coordinate_id, item]));
const rules = new Map(topic.rule_cards.map(item => [item.rule_id, item]));
const scenarios = new Map(topic.scenario_branches.map(item => [item.scenario_id, item]));
const entries = new Map(topic.content_entries.map(item => [item.content_id, item]));
const currentEntries = new Map(current.knowledge.content_entries.map(item => [item.content_id, item]));
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys()]);
const allowedContentTypes = new Set([
  'law_change','doctrine_explainer','fact_branch','precedent_doctrine',
  'similar_case_comparison','misconception_correction','procedure_evidence',
  'recurring_issue_generalization',
]);

test('가정폭력·스토킹 10개 안전질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.domestic-violence-stalking');
  assert.equal(topic.sources.length, 22);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
  assert.equal(topic.topic_hubs.length, 1);
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);

  for (const rule of rules.values()) {
    assert.ok(rule.source_coordinate_ids.length > 0);
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

test('현행 가정폭력·스토킹 4개 법률의 공식 좌표와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['domestic_violence_special_ko_0002','snapshot:e5f14e7e9cc3c79af7e1a02062f84c8c'],
    ['domestic_violence_special_ko_0005','snapshot:a8fc1ffa00b31dc80bfa7c0262576d4c'],
    ['domestic_violence_special_ko_0008_02','snapshot:855adaf0cca1087e3be695efe1ecc2297'],
    ['domestic_violence_special_ko_0008_03','snapshot:9d1f24fdf01c7eb9c08939612d93e709'],
    ['domestic_violence_special_ko_0029','snapshot:70fc8483530432714fb76b4fc75c4e7c'],
    ['domestic_violence_special_ko_0055_02','snapshot:f662ba000e3c81c4606309e05863cd99'],
    ['domestic_violence_special_ko_0055_03','snapshot:4ce3c75a47852ba9ca958463e49def28'],
    ['law_000182_ko_0001_02','snapshot:c3993b432c9df44859afd340975f63a7'],
    ['law_000182_ko_0004_06','snapshot:b5c1491ce493830086405f5217fe8808'],
    ['law_000182_ko_0006','snapshot:d8350aa7a4702247a5af05df3977a3d4'],
    ['law_000182_ko_0007_02','snapshot:a2126f8e7d21f06ab6a52597c0b2b689'],
    ['law_000182_ko_0018','snapshot:efbd6c6e4d7929c2ea4df92fe9fa2f49'],
    ['stalking_punishment_ko_0002','snapshot:a6075f1c32ef928beddfc28b7c0940b0'],
    ['stalking_punishment_ko_0003','snapshot:0d29a78f35f575a2fd6af383624c3326'],
    ['stalking_punishment_ko_0004','snapshot:72c0ef832d6aa2c24c94390257866e83'],
    ['stalking_punishment_ko_0005','snapshot:a26b2631712df36cf288f277b70fe448'],
    ['stalking_punishment_ko_0008','snapshot:14fd99fa6abec573ac77b787bab75f8c'],
    ['stalking_punishment_ko_0009','snapshot:6cdb537618ea99e3aef35225e727f1e6'],
    ['stalking_punishment_ko_0017_04','snapshot:355c2e2b87e0f389160868b0a51d3191'],
    ['law_014392_ko_0006','snapshot:a0ca7f1818f6015cbf60e0e84491d608'],
    ['law_014392_ko_0009','snapshot:5ac4fc1b379fb1ee8653f3df308b339d'],
    ['law_014392_ko_0013','snapshot:3a865a7cbeeab104b841ae7ed427d89d1'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  const lawNames = new Set([
    '가정폭력범죄의 처벌 등에 관한 특례법',
    '가정폭력방지 및 피해자보호 등에 관한 법률',
    '스토킹범죄의 처벌 등에 관한 법률',
    '스토킹방지 및 피해자보호 등에 관한 법률',
  ]);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.ok(lawNames.has(source.law_name_ko), source.law_name_ko);
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(!source.official_url.includes('lawView.do'));
  }
});

test('분리·접근금지·보호명령·잠정조치의 주체와 시간축을 고정한다', () => {
  assert.match(rules.get('rule.domestic-violence-stalking.domestic-scope').proposition_ko, /사실혼.*과거 배우자.*동거 친족/);
  assert.match(rules.get('rule.domestic-violence-stalking.domestic-emergency').proposition_ko, /즉시 현장.*제지·분리.*긴급치료/);
  assert.match(rules.get('rule.domestic-violence-stalking.domestic-emergency-temporary').proposition_ko, /경찰의 긴급임시조치.*48시간.*법원 임시조치/);
  assert.match(rules.get('rule.domestic-violence-stalking.domestic-protection-order').proposition_ko, /퇴거·100미터 접근금지.*친권행사 제한.*면접교섭 제한/);
  assert.match(rules.get('rule.domestic-violence-stalking.domestic-protection-order').norm.legal_effect_ko, /1년 이내.*합산 3년 이내/);
  assert.match(rules.get('rule.domestic-violence-stalking.domestic-support').proposition_ko, /긴급전화.*단기·장기 보호시설.*의료 치료/);
  assert.match(rules.get('rule.domestic-violence-stalking.stalking-scope').proposition_ko, /불안감이나 공포심.*지속적 또는 반복적/);
  assert.match(rules.get('rule.domestic-violence-stalking.stalking-emergency').norm.legal_effect_ko, /1개월.*승인되지 않으면 즉시 취소/);
  assert.match(rules.get('rule.domestic-violence-stalking.stalking-provisional').proposition_ko, /100미터 접근금지.*전자장치 부착.*유치장 또는 구치소/);
  assert.match(rules.get('rule.domestic-violence-stalking.stalking-support').proposition_ko, /임시거소.*국선변호사/);
  assert.match(rules.get('rule.domestic-violence-stalking.stalking-workplace').proposition_ko, /해고·징계.*업무 연락처·근무장소 변경/);

  assert.match(entries.get('content.domestic-violence-stalking-domestic-emergency').caution_ko, /다시 들어가.*위험/);
  assert.match(entries.get('content.domestic-violence-stalking-domestic-support').caution_ko, /위치공유.*공동계정/);
  assert.match(entries.get('content.domestic-violence-stalking-stalking-scope').caution_ko, /반복성만 기다리며 신고를 미루지/);
});

test('범죄피해·이혼 상세 정본으로 외부 안전경로를 닫는다', () => {
  const expected = new Map([
    ['content.domestic-violence-stalking-domestic-scope',['content.divorce-cooling-period-shortening-for-violence']],
    ['content.domestic-violence-stalking-domestic-emergency',['content.crime-victim-urgent-safety-and-support','content.crime-evidence-preservation-first-steps']],
    ['content.domestic-violence-stalking-domestic-protection-order',['content.crime-victim-urgent-safety-and-support','content.divorce-child-custody-support-parental-authority-agreement']],
    ['content.domestic-violence-stalking-stalking-scope',['content.crime-evidence-preservation-first-steps','content.report-complaint-accusation-difference']],
    ['content.domestic-violence-stalking-stalking-support',['content.how-to-file-criminal-complaint','content.victim-statement-in-criminal-trial']],
  ]);
  for (const [entryId, relatedIds] of expected) {
    assert.deepEqual(entries.get(entryId).related_content_ids, relatedIds);
    for (const id of relatedIds) assert.ok(currentEntries.has(id), `현재 정본에 외부 연결 대상이 없습니다: ${id}`);
  }
  assert.ok(topic.content_entries.filter(item => item.related_content_ids.some(id => currentEntries.has(id))).length >= 7);
});

test('표준 콘텐츠 유형과 식별자·인적표기·잘린 제목을 고정한다', () => {
  const types = new Set(topic.content_entries.map(item => item.content_type));
  assert.deepEqual(types, new Set([
    'misconception_correction','procedure_evidence','fact_branch','recurring_issue_generalization',
  ]));
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
  for (const id of newIds) assert.ok(!currentIds.has(id), `현재 정본과 식별자 충돌: ${id}`);
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
