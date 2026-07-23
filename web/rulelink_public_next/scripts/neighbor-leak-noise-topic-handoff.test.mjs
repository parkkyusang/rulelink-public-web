import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const [topic, current] = await Promise.all([
  readJson(path.join(repoRoot, 'artifacts', 'publication', 'topics', 'neighbor-leak-noise.json')),
  readJson(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json')),
]);
const sources = new Map(topic.sources.map(item => [item.coordinate_id, item]));
const rules = new Map(topic.rule_cards.map(item => [item.rule_id, item]));
const scenarios = new Map(topic.scenario_branches.map(item => [item.scenario_id, item]));
const entries = new Map(topic.content_entries.map(item => [item.content_id, item]));
const currentEntries = new Map(current.knowledge.content_entries.map(item => [item.content_id, item]));
const pendingExternal = new Set([
  'content.housing-lease-living-repair-duty',
  'content.housing-lease-living-repair-reimbursement',
  'content.civil-small-claims-filing-method',
  'content.civil-small-claims-evidence-hearing',
]);
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys(), ...pendingExternal]);
const allowedTypes = new Set([
  'law_change','doctrine_explainer','fact_branch','precedent_doctrine',
  'similar_case_comparison','misconception_correction','procedure_evidence',
  'recurring_issue_generalization',
]);

test('누수·층간소음·공용부분 10개 질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.neighbor-leak-noise');
  assert.equal(topic.sources.length, 12);
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

test('현행 민법·민사소송법·집합건물법·공동주택관리법 12개 좌표와 효력판을 고정한다', () => {
  const expected = new Map([
    ['civil_act_ko_0214','snapshot:7f6091e41efd1c2b5adb6f12d6d8aad7'],
    ['civil_act_ko_0217','snapshot:7feaf7436d1b7522c275d623fde1ca45'],
    ['civil_procedure_ko_0375','snapshot:4bb11cb112435dd0544d2718f01bf06e'],
    ['civil_procedure_ko_0376','snapshot:b20085997d0047c270a71a3f352c50b'],
    ['civil_act_ko_0750','snapshot:cdf125767ab6640e07d557f6c73a0c53'],
    ['civil_act_ko_0758','snapshot:3e889ba204742d5b6bead0009d0e244b'],
    ['aggregate_buildings_ko_0005','snapshot:ba0b06aad5b4edc9b9673ab8c2cdb83b'],
    ['aggregate_buildings_ko_0006','snapshot:e2743432ae2da484402e50c9fe576f13'],
    ['aggregate_buildings_ko_0016','snapshot:5efc0ec9301b5c8de1beba0aacdb5c3'],
    ['aggregate_buildings_ko_0025','snapshot:0673814d538b9d1e1ed90911a4759e6'],
    ['law_012345_ko_0020','snapshot:d3f67100994e64661c28706d9e05db8b'],
    ['law_012345_ko_0071','snapshot:b7170b9712f31c225f71396d3a51f672'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(source.official_url.endsWith(encodeURIComponent(source.article_no)));
    assert.ok(!source.official_url.includes('lawView.do'));
    assert.equal(source.last_verified_at, '2026-07-23T08:00:00+00:00');
  }
});

test('원인위치 책임·점검거부 절차·공용부분·층간소음·구제수단의 핵심 분리를 고정한다', () => {
  assert.match(rules.get('rule.neighbor-leak-noise.leak-origin-evidence').proposition_ko, /관리주체.*원인.*인과관계/);
  assert.match(rules.get('rule.neighbor-leak-noise.cause-location-liability').proposition_ko, /위치·기능.*점유·소유관계.*관리주체/);
  assert.match(rules.get('rule.neighbor-leak-noise.inspection-refusal-evidence-preservation').proposition_ko, /임의 진입이 아니라.*증거보전.*제거청구/);
  assert.match(rules.get('rule.neighbor-leak-noise.occupant-owner-liability').proposition_ko, /고의·과실.*설치·보존 하자/);
  assert.match(rules.get('rule.neighbor-leak-noise.exclusive-common-area').proposition_ko, /공용부분의 흠으로 추정/);
  assert.match(rules.get('rule.neighbor-leak-noise.inspection-access').proposition_ko, /필요한 범위.*사용을 청구/);
  assert.match(rules.get('rule.neighbor-leak-noise.floor-noise-management-route').proposition_ko, /관리주체.*사실조사/);
  assert.match(rules.get('rule.neighbor-leak-noise.floor-noise-mediation').proposition_ko, /분쟁조정위원회/);
  assert.match(rules.get('rule.neighbor-leak-noise.neighbor-interference-limit').proposition_ko, /통상 용도/);
  assert.match(rules.get('rule.neighbor-leak-noise.injunction-vs-damages').proposition_ko, /제거·예방청구.*손해배상/);
});

test('임대차·매매하자·일상손해·소액사건 정본으로 실제 외부 연결을 닫는다', () => {
  const required = new Map([
    ['content.neighbor-leak-noise-cause-location-liability',['content.housing-lease-living-repair-duty','content.housing-lease-living-repair-reimbursement']],
    ['content.neighbor-leak-noise-inspection-refusal-evidence-preservation',['content.civil-small-claims-evidence-hearing']],
    ['content.neighbor-leak-noise-leak-origin-evidence',['content.accident-evidence-and-tort-limitation','content.hidden-defect-after-purchase','content.housing-lease-living-repair-duty','content.housing-lease-living-repair-reimbursement']],
    ['content.neighbor-leak-noise-occupant-owner-liability',['content.slip-fall-and-unsafe-facility-liability']],
    ['content.neighbor-leak-noise-injunction-vs-damages',['content.civil-small-claims-evidence-hearing']],
  ]);
  for (const [entryId, ids] of required) {
    const related = entries.get(entryId).related_content_ids;
    for (const id of ids) assert.ok(related.includes(id), `${entryId}: 외부 연결 누락 ${id}`);
  }
  for (const id of [
    'content.accident-evidence-and-tort-limitation',
    'content.hidden-defect-after-purchase',
    'content.slip-fall-and-unsafe-facility-liability',
  ]) assert.ok(currentEntries.has(id), `현재 정본에 외부 연결 대상이 없습니다: ${id}`);
  for (const id of pendingExternal) assert.ok([...entries.values()].some(entry => entry.related_content_ids.includes(id)), `대기열 외부 연결 미사용: ${id}`);
});

test('제623조·제626조 중복을 제거하고 #107 예정 정본 및 새 두 분기로 관계를 닫는다', () => {
  for (const id of [
    'content.neighbor-leak-noise-rental-repair-duty',
    'content.neighbor-leak-noise-urgent-repair-reimbursement',
  ]) assert.ok(!entries.has(id), `중복 콘텐츠가 남았습니다: ${id}`);
  for (const id of [
    'rule.neighbor-leak-noise.rental-repair-duty',
    'rule.neighbor-leak-noise.urgent-repair-reimbursement',
  ]) assert.ok(!rules.has(id), `중복 법리가 남았습니다: ${id}`);
  for (const id of [
    'scenario.neighbor-leak-noise.rental-repair-duty',
    'scenario.neighbor-leak-noise.urgent-repair-reimbursement',
  ]) assert.ok(!scenarios.has(id), `중복 분기가 남았습니다: ${id}`);
  for (const id of ['civil_act_ko_0623','civil_act_ko_0626']) {
    assert.ok(!topic.sources.some(source => source.source_id === id), `#107 중복 근거가 남았습니다: ${id}`);
  }

  const cause = entries.get('content.neighbor-leak-noise-cause-location-liability');
  for (const id of [
    'content.housing-lease-living-repair-duty',
    'content.housing-lease-living-repair-reimbursement',
    'content.neighbor-leak-noise-exclusive-common-area',
    'content.neighbor-leak-noise-occupant-owner-liability',
  ]) assert.ok(cause.related_content_ids.includes(id), `원인별 책임분기 연결 누락: ${id}`);

  const refusal = entries.get('content.neighbor-leak-noise-inspection-refusal-evidence-preservation');
  for (const id of [
    'content.neighbor-leak-noise-inspection-access',
    'content.neighbor-leak-noise-injunction-vs-damages',
    'content.civil-small-claims-evidence-hearing',
  ]) assert.ok(refusal.related_content_ids.includes(id), `점검거부 절차 연결 누락: ${id}`);

  assert.match(cause.one_line_answer_ko, /전유설비.*공용배관.*윗집/);
  assert.match(refusal.one_line_answer_ko, /임의로.*증거보전.*제거·예방청구/);
  assert.match(scenarios.get('scenario.neighbor-leak-noise.cause-location-liability').decision_fact_ko, /위치·기능.*점유·소유관계.*관리주체/);
  assert.match(scenarios.get('scenario.neighbor-leak-noise.inspection-refusal-evidence-preservation').decision_fact_ko, /거부 기록.*현상 변경 위험.*소 제기 여부/);
});

test('표준 유형·식별자·인적표기·잘린 제목을 고정한다', () => {
  const serialized = JSON.stringify(topic);
  const keys = collectKeys(topic);
  for (const key of ['author','byline','reviewer_name']) assert.ok(!keys.has(key), `금지 필드: ${key}`);
  for (const text of ['procedure_guide','remedy_guide','deadline_explainer','박규상','동순…']) {
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


test("렌더 순서에서 핵심요약·본문 중복과 복제된 편집문구를 차단한다", () => {
  const revisedIds = [
    "content.neighbor-leak-noise-leak-origin-evidence",
    "content.neighbor-leak-noise-occupant-owner-liability",
    "content.neighbor-leak-noise-exclusive-common-area",
    "content.neighbor-leak-noise-inspection-access",
    "content.neighbor-leak-noise-floor-noise-management-route",
    "content.neighbor-leak-noise-floor-noise-mediation",
    "content.neighbor-leak-noise-neighbor-interference-limit",
    "content.neighbor-leak-noise-injunction-vs-damages",
  ];

  for (const entry of entries.values()) {
    assertEditorialCopyQuality(entry);
  }

  const revisedCautions = revisedIds.map((contentId) =>
    normalizeRenderedCopy(entries.get(contentId).caution_ko),
  );
  assert.equal(
    new Set(revisedCautions).size,
    revisedCautions.length,
    "보강한 8개 글의 주의문은 각 쟁점의 예외·후속절차·증거위험에 맞게 달라야 합니다.",
  );
});


function normalizeRenderedCopy(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.…"'“”‘’(),·:;!?\-]/gu, "");
}

function normalizeSearchCopy(value) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function assertEditorialCopyQuality(entry) {
  const keyPoints = new Set(entry.key_points_ko.map(normalizeRenderedCopy));
  const paragraphs = entry.body_sections.flatMap((section) => section.paragraphs_ko);

  for (const paragraph of paragraphs) {
    assert.ok(
      !keyPoints.has(normalizeRenderedCopy(paragraph)),
      `${entry.content_id}: 핵심요약과 이어지는 본문에 같은 문장을 반복하면 안 됩니다.`,
    );
  }

  assert.ok(
    entry.search_intents_ko.length >= 3,
    `${entry.content_id}: 실제 한국어 검색질의를 3개 이상 제공해야 합니다.`,
  );

  const copiedFields = new Set(
    [entry.title_ko, entry.slug, entry.audience_situation_ko].map(normalizeSearchCopy),
  );
  for (const intent of entry.search_intents_ko) {
    const normalizedIntent = normalizeSearchCopy(intent);
    assert.match(intent, /[가-힣]/u, `${entry.content_id}: 검색질의는 실제 한국어 표현이어야 합니다.`);
    assert.ok(
      !copiedFields.has(normalizedIntent),
      `${entry.content_id}: 제목·슬러그·독자상황을 검색질의로 그대로 복사하면 안 됩니다.`,
    );
    assert.ok(
      !normalizedIntent.includes(normalizeSearchCopy(entry.slug)),
      `${entry.content_id}: 영문 슬러그를 검색질의에 포함하면 안 됩니다.`,
    );
  }
}

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
