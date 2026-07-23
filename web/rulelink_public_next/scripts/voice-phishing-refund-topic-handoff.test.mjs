import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const [topic, current] = await Promise.all([
  readJson(path.join(repoRoot, 'artifacts', 'publication', 'topics', 'voice-phishing-refund.json')),
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

test('보이스피싱 지급정지·피해환급 10개 질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.voice-phishing-refund');
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

test('2026년 7월 23일 현재 효력 근거 12개와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['law_011359_ko_0002','snapshot:b6418a5b72cbf20526ff44c8c39001e0'],
    ['law_011359_ko_0003','snapshot:c1352b34fbb91b1e457a66cbd6543912'],
    ['law_011359_ko_0004','snapshot:2a93bf127549dc41137c381d6b63e6f4'],
    ['law_011359_ko_0005','snapshot:d6f7f9a70440a9687ef937815757f04f'],
    ['law_011359_ko_0006','snapshot:f97a698980872e4ead25f117c18df935'],
    ['law_011359_ko_0007','snapshot:dd0f6e64169f54df08905d4b8697547a'],
    ['law_011359_ko_0008','snapshot:a111cb0cbc4b3eac918355aa547a9578'],
    ['law_011359_ko_0009','snapshot:016097b2878751ba5a97149f44d0ab0b'],
    ['law_011359_ko_0010','snapshot:0541f2b398b4c3a493c5428f03ca8cde'],
    ['law_011359_ko_0011','snapshot:cf398b7b246d6f957a4b5002fa4d0a9f'],
    ['law_011359_ko_0012','snapshot:06a2351c4816aa27384e22c22894d827'],
    ['civil_act_ko_0750','snapshot:cdf125767ab6640e07d557f6c73a0c53'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(source.official_url.endsWith(encodeURIComponent(source.article_no)));
    assert.ok(!source.official_url.includes('lawView.do'));
  }
  assert.ok(!JSON.stringify(topic).includes('electronic_financial_transactions_ko_'), '2026-12-17 미래 시행 전자금융거래법 판을 현행 근거로 혼입');
});

test('적용범위·지급정지·공고기한·비례환급·민사잔액을 고정한다', () => {
  assert.match(rules.get('rule.voice-phishing-refund.covered-scam').proposition_ko, /재화·용역.*제외.*대출.*포함/);
  assert.match(rules.get('rule.voice-phishing-refund.immediate-application').proposition_ko, /송금계좌.*사기이용계좌/);
  assert.match(rules.get('rule.voice-phishing-refund.transferred-again').proposition_ko, /다른 금융회사.*지급정지/);
  assert.match(rules.get('rule.voice-phishing-refund.cash-delivery-withdrawal').proposition_ko, /수사기관.*피해자와 피해금/);
  assert.match(rules.get('rule.voice-phishing-refund.low-balance-request').proposition_ko, /3만원.*30일/);
  assert.match(rules.get('rule.voice-phishing-refund.late-application').proposition_ko, /공고일부터 2개월/);
  assert.match(rules.get('rule.voice-phishing-refund.account-holder-objection').proposition_ko, /객관적 자료.*이의제기/);
  assert.match(rules.get('rule.voice-phishing-refund.claim-extinction-timeline').proposition_ko, /공고일부터 2개월.*소멸/);
  assert.match(rules.get('rule.voice-phishing-refund.refund-amount').proposition_ko, /피해금액 비율/);
  assert.match(rules.get('rule.voice-phishing-refund.refund-and-civil-claim').proposition_ko, /환급받은 한도에서 소멸/);
});

test('범죄피해·온라인거래·민사배상 정본으로 실제 외부 연결을 닫는다', () => {
  const required = new Map([
    ['content.voice-phishing-refund-covered-scam',['content.paid-but-goods-not-supplied','content.report-complaint-accusation-difference']],
    ['content.voice-phishing-refund-immediate-application',['content.crime-victim-urgent-safety-and-support','content.crime-evidence-preservation-first-steps']],
    ['content.voice-phishing-refund-cash-delivery-withdrawal',['content.how-to-file-criminal-complaint']],
    ['content.voice-phishing-refund-refund-and-civil-claim',['content.civil-damages-after-crime','content.compensation-order-eligible-damages']],
  ]);
  for (const [entryId, ids] of required) {
    const related = entries.get(entryId).related_content_ids;
    for (const id of ids) assert.ok(related.includes(id), `${entryId}: 외부 연결 누락 ${id}`);
  }
  for (const ids of required.values()) for (const id of ids) {
    assert.ok(currentEntries.has(id), `현재 정본에 외부 연결 대상이 없습니다: ${id}`);
  }
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
  const cautions = [];

  for (const entry of entries.values()) {
    assertEditorialCopyQuality(entry);
    cautions.push(normalizeRenderedCopy(entry.caution_ko));
  }

  assert.equal(
    new Set(cautions).size,
    cautions.length,
    "10개 글의 주의문은 각 쟁점의 예외·후속절차·증거위험에 맞게 달라야 합니다.",
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
