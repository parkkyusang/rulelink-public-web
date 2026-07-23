import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicsRoot = path.join(repoRoot, 'artifacts', 'publication', 'topics');
const topicPath = path.join(topicsRoot, 'consumer-online-contracts.json');

const topic = await readJson(topicPath);
const topicFiles = (await readdir(topicsRoot))
  .filter(name => name.endsWith('.json') && name !== 'manifest.json');
const allTopics = await Promise.all(
  topicFiles.map(name => readJson(path.join(topicsRoot, name))),
);
const allEntries = new Map(
  allTopics.flatMap(candidate => candidate.content_entries ?? [])
    .map(entry => [entry.content_id, entry]),
);
const sources = new Map(topic.sources.map(source => [source.coordinate_id, source]));
const rules = new Map(topic.rule_cards.map(rule => [rule.rule_id, rule]));
const scenarios = new Map(topic.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
const entries = new Map(topic.content_entries.map(entry => [entry.content_id, entry]));

const EXPECTED_SOURCE_BINDINGS = new Map([
  ['ecommerce_consumer_ko_0017', ['snapshot:9000691e73e3e70501ab42f3a663ae79', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%A0%84%EC%9E%90%EC%83%81%EA%B1%B0%EB%9E%98%20%EB%93%B1%EC%97%90%EC%84%9C%EC%9D%98%20%EC%86%8C%EB%B9%84%EC%9E%90%EB%B3%B4%ED%98%B8%EC%97%90%20%EA%B4%80%ED%95%9C%20%EB%B2%95%EB%A5%A0/%EC%A0%9C17%EC%A1%B0']],
  ['ecommerce_consumer_ko_0018', ['snapshot:00a11a59976f8ecf3cbe4a3179a14c86', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%A0%84%EC%9E%90%EC%83%81%EA%B1%B0%EB%9E%98%20%EB%93%B1%EC%97%90%EC%84%9C%EC%9D%98%20%EC%86%8C%EB%B9%84%EC%9E%90%EB%B3%B4%ED%98%B8%EC%97%90%20%EA%B4%80%ED%95%9C%20%EB%B2%95%EB%A5%A0/%EC%A0%9C18%EC%A1%B0']],
  ['ecommerce_consumer_ko_0013', ['snapshot:4ce49167c1ae10749e042ec03a8041e6', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%A0%84%EC%9E%90%EC%83%81%EA%B1%B0%EB%9E%98%20%EB%93%B1%EC%97%90%EC%84%9C%EC%9D%98%20%EC%86%8C%EB%B9%84%EC%9E%90%EB%B3%B4%ED%98%B8%EC%97%90%20%EA%B4%80%ED%95%9C%20%EB%B2%95%EB%A5%A0/%EC%A0%9C13%EC%A1%B0']],
  ['ecommerce_consumer_ko_0014', ['snapshot:aea7f545e0ea6b5e8a2a829e67c662ed', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%A0%84%EC%9E%90%EC%83%81%EA%B1%B0%EB%9E%98%20%EB%93%B1%EC%97%90%EC%84%9C%EC%9D%98%20%EC%86%8C%EB%B9%84%EC%9E%90%EB%B3%B4%ED%98%B8%EC%97%90%20%EA%B4%80%ED%95%9C%20%EB%B2%95%EB%A5%A0/%EC%A0%9C14%EC%A1%B0']],
  ['ecommerce_consumer_ko_0015', ['snapshot:f8a52a421791937f8763911bc6d9f545', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%A0%84%EC%9E%90%EC%83%81%EA%B1%B0%EB%9E%98%20%EB%93%B1%EC%97%90%EC%84%9C%EC%9D%98%20%EC%86%8C%EB%B9%84%EC%9E%90%EB%B3%B4%ED%98%B8%EC%97%90%20%EA%B4%80%ED%95%9C%20%EB%B2%95%EB%A5%A0/%EC%A0%9C15%EC%A1%B0']],
  ['ecommerce_consumer_ko_0020_04', ['snapshot:8a1aec26352f849b6e4223da51818c58', 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%A0%84%EC%9E%90%EC%83%81%EA%B1%B0%EB%9E%98%20%EB%93%B1%EC%97%90%EC%84%9C%EC%9D%98%20%EC%86%8C%EB%B9%84%EC%9E%90%EB%B3%B4%ED%98%B8%EC%97%90%20%EA%B4%80%ED%95%9C%20%EB%B2%95%EB%A5%A0/%EC%A0%9C20%EC%A1%B0%EC%9D%984']],
  ['src-ecommerce-revision-20260721', ['snapshot:02db1cc69a101bf763210f3a1377f866', 'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=282793&viewCls=lsRvsDocInfoR']],
]);

const EXPECTED_RULE_IDS = [
  'rule.consumer-online-contracts.rule-withdrawal-7days',
  'rule.consumer-online-contracts.rule-nonconforming-3m30d',
  'rule.consumer-online-contracts.rule-return-cost',
  'rule.consumer-online-contracts.rule-withdrawal-exceptions',
  'rule.consumer-online-contracts.rule-exception-disclosure',
  'rule.consumer-online-contracts.rule-refund-3businessdays',
  'rule.consumer-online-contracts.rule-supply-timeline',
  'rule.consumer-online-contracts.rule-recurring-payment-change',
  'rule.consumer-online-contracts.rule-platform-information',
];

const EXPECTED_SCENARIO_FACTS = new Map([
  ['scenario.consumer-online-contracts.sc-change-mind', '계약내용 서면 수신일·상품 수령일과 청약철회 통지일'],
  ['scenario.consumer-online-contracts.sc-not-as-advertised', '표시·광고 또는 계약내용과 실제 공급된 상품의 차이 및 그 발견일'],
  ['scenario.consumer-online-contracts.sc-opened-package', '포장을 연 목적과 범위, 상품 자체의 훼손·사용 및 가치 감소 여부'],
  ['scenario.consumer-online-contracts.sc-digital-started', '디지털콘텐츠의 다운로드·재생·열람·아이템 사용 등 실제 제공 개시 시점과 미제공 부분'],
  ['scenario.consumer-online-contracts.sc-undelivered', '청약일·대금 지급일과 약정한 공급시기 및 실제 공급 여부'],
  ['scenario.consumer-online-contracts.sc-free-to-paid', '무료체험 종료일, 유료 전환 조건의 사전 고지와 소비자 동의 기록'],
  ['scenario.consumer-online-contracts.sc-platform-seller-unknown', '거래일이 2026년 7월 21일 이후인지, 판매자가 개인인지, 법정 요청 주체와 절차를 갖췄는지'],
]);

const EXPECTED_CONTENT_SCENARIOS = new Map([
  ['content.online-purchase-cancellation-seven-days', ['scenario.consumer-online-contracts.sc-change-mind', 'scenario.consumer-online-contracts.sc-not-as-advertised']],
  ['content.goods-different-from-advertisement-deadline', ['scenario.consumer-online-contracts.sc-not-as-advertised']],
  ['content.opened-package-return-right', ['scenario.consumer-online-contracts.sc-opened-package']],
  ['content.digital-content-cancellation-exception', ['scenario.consumer-online-contracts.sc-digital-started']],
  ['content.who-pays-return-shipping', ['scenario.consumer-online-contracts.sc-change-mind', 'scenario.consumer-online-contracts.sc-not-as-advertised']],
  ['content.refund-within-three-business-days', ['scenario.consumer-online-contracts.sc-undelivered', 'scenario.consumer-online-contracts.sc-change-mind']],
  ['content.paid-but-goods-not-supplied', ['scenario.consumer-online-contracts.sc-undelivered']],
  ['content.free-trial-to-paid-subscription', ['scenario.consumer-online-contracts.sc-free-to-paid']],
  ['content.platform-seller-information-2026-change', ['scenario.consumer-online-contracts.sc-platform-seller-unknown']],
  ['content.online-contract-evidence-checklist', ['scenario.consumer-online-contracts.sc-change-mind', 'scenario.consumer-online-contracts.sc-not-as-advertised', 'scenario.consumer-online-contracts.sc-platform-seller-unknown']],
]);

const EXPECTED_RELATED = new Map([
  ['content.online-purchase-cancellation-seven-days', [
    ['content.opened-package-return-right', 'comparison', '개봉·사용이 철회를 제한하는지 비교'],
    ['content.digital-content-cancellation-exception', 'comparison', '디지털콘텐츠 제공 개시 예외 확인'],
    ['content.who-pays-return-shipping', 'procedure', '철회가 가능하면 반품비 부담 확인'],
  ]],
  ['content.goods-different-from-advertisement-deadline', [
    ['content.who-pays-return-shipping', 'procedure', '계약 불일치 반품비 부담 확인'],
  ]],
  ['content.opened-package-return-right', [
    ['content.who-pays-return-shipping', 'procedure', '철회 가능 판단 뒤 반품비 부담 확인'],
  ]],
  ['content.digital-content-cancellation-exception', [
    ['content.refund-within-three-business-days', 'procedure', '철회 가능한 부분의 환급기한 확인'],
  ]],
  ['content.who-pays-return-shipping', [
    ['content.refund-within-three-business-days', 'procedure', '반송 뒤 환급 기준일과 기한 확인'],
  ]],
  ['content.refund-within-three-business-days', [
    ['content.civil-mediation-vs-civil-lawsuit', 'remedy', '판매자 환급 거부 뒤 민사조정과 소송 비교'],
    ['content.payment-order-vs-civil-mediation', 'remedy', '환급액 청구는 지급명령과 조정 비교'],
    ['content.small-claims-trial-vs-general-civil-lawsuit', 'remedy', '청구액에 따라 소액사건과 일반소송 비교'],
  ]],
  ['content.paid-but-goods-not-supplied', [
    ['content.refund-within-three-business-days', 'deadline', '미공급 취소 뒤 환급기한 확인'],
  ]],
  ['content.free-trial-to-paid-subscription', [
    ['content.online-purchase-cancellation-seven-days', 'comparison', '유료 전환 결제의 일반 철회기간 비교'],
  ]],
  ['content.platform-seller-information-2026-change', [
    ['content.online-contract-evidence-checklist', 'prerequisite', '판매자·플랫폼·거래내역을 먼저 정리'],
  ]],
  ['content.online-contract-evidence-checklist', [
    ['content.online-purchase-cancellation-seven-days', 'comparison', '단순변심이면 일반 철회기한 확인'],
    ['content.goods-different-from-advertisement-deadline', 'comparison', '광고·계약 불일치면 특례기한 확인'],
    ['content.paid-but-goods-not-supplied', 'procedure', '배송·공급이 없으면 미공급 절차 확인'],
    ['content.free-trial-to-paid-subscription', 'comparison', '무료체험 유료 전환이면 동의 기록 확인'],
    ['content.civil-mediation-vs-civil-lawsuit', 'remedy', '판매자 거부 뒤 민사조정과 소송 비교'],
    ['content.payment-order-vs-civil-mediation', 'remedy', '정해진 금액은 지급명령과 조정 비교'],
    ['content.small-claims-trial-vs-general-civil-lawsuit', 'remedy', '청구액에 따라 소액사건과 일반소송 비교'],
  ]],
]);

const ALLOWED_RELATION_TYPES = new Set([
  'prerequisite',
  'comparison',
  'deadline',
  'procedure',
  'remedy',
  'law_change',
  'concept',
  'concierge_boundary',
]);

const REMEDY_TARGETS = new Set([
  'content.civil-mediation-vs-civil-lawsuit',
  'content.payment-order-vs-civil-mediation',
  'content.small-claims-trial-vs-general-civil-lawsuit',
]);

test('소비자·온라인 계약의 기존 식별자와 결정사실을 변경하지 않는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.consumer-online-contracts');
  assert.equal(topic.sources.length, 7);
  assert.equal(topic.rule_cards.length, 9);
  assert.equal(topic.scenario_branches.length, 7);
  assert.equal(topic.content_entries.length, 10);
  assert.equal(topic.topic_hubs.length, 1);
  assert.deepEqual([...EXPECTED_SOURCE_BINDINGS.keys()], topic.sources.map(source => source.source_id));
  assert.deepEqual(EXPECTED_RULE_IDS, topic.rule_cards.map(rule => rule.rule_id));
  assert.deepEqual([...EXPECTED_SCENARIO_FACTS.keys()], topic.scenario_branches.map(scenario => scenario.scenario_id));
  assert.deepEqual([...EXPECTED_CONTENT_SCENARIOS.keys()], topic.content_entries.map(entry => entry.content_id));
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);

  for (const [scenarioId, decisionFact] of EXPECTED_SCENARIO_FACTS) {
    assert.equal(scenarios.get(scenarioId)?.decision_fact_ko, decisionFact, scenarioId);
  }
  for (const [contentId, scenarioIds] of EXPECTED_CONTENT_SCENARIOS) {
    assert.deepEqual(entries.get(contentId)?.scenario_ids, scenarioIds, contentId);
  }
});

test('9개 법리카드는 판단규칙과 법률효과를 분리하고 근거를 닫는다', () => {
  for (const rule of rules.values()) {
    assert.notEqual(normalize(rule.proposition_ko), normalize(rule.norm.legal_effect_ko), rule.rule_id);
    assert.ok(rule.norm.actor_ko.trim(), `${rule.rule_id}: 행위주체가 없습니다.`);
    assert.ok(rule.norm.conditions_ko.trim(), `${rule.rule_id}: 요건이 없습니다.`);
    assert.ok(rule.norm.legal_effect_ko.trim(), `${rule.rule_id}: 법률효과가 없습니다.`);
    assert.ok(rule.source_coordinate_ids.length > 0, `${rule.rule_id}: 근거가 없습니다.`);
    for (const coordinateId of rule.source_coordinate_ids) {
      assert.ok(sources.has(coordinateId), `${rule.rule_id}: 없는 근거 ${coordinateId}`);
    }
  }

  assert.match(rules.get('rule.consumer-online-contracts.rule-withdrawal-7days').proposition_ko, /기산점/u);
  assert.match(rules.get('rule.consumer-online-contracts.rule-withdrawal-7days').norm.legal_effect_ko, /7일 이내.*철회/u);
  assert.match(rules.get('rule.consumer-online-contracts.rule-return-cost').proposition_ko, /철회사유/u);
  assert.match(rules.get('rule.consumer-online-contracts.rule-return-cost').norm.legal_effect_ko, /소비자.*통신판매업자/u);
  assert.match(rules.get('rule.consumer-online-contracts.rule-refund-3businessdays').norm.legal_effect_ko, /3영업일.*지연배상금/u);
  assert.match(rules.get('rule.consumer-online-contracts.rule-platform-information').proposition_ko, /판매자가 사업자인지 개인인지/u);
});

test('10개 글의 타입 관계와 기존 related_content_ids 투영을 정확히 고정한다', () => {
  for (const [contentId, expected] of EXPECTED_RELATED) {
    const entry = entries.get(contentId);
    assert.ok(entry, contentId);
    assert.ok(Array.isArray(entry.related_edges) && entry.related_edges.length > 0, `${contentId}: 타입 관계가 없습니다.`);
    assert.deepEqual(
      entry.related_edges.map(edge => [edge.target_id, edge.relation_type, edge.label_ko]),
      expected,
      contentId,
    );

    const projectedContentIds = entry.related_edges
      .filter(edge => edge.target_kind === 'content')
      .map(edge => edge.target_id);
    assert.deepEqual(entry.related_content_ids, projectedContentIds, `${contentId}: 기존 필드 투영 불일치`);
    const edgeSignatures = entry.related_edges.map(edge =>
      [edge.target_kind, edge.target_id, edge.relation_type, edge.label_ko].join('\u0000'),
    );
    assert.equal(new Set(edgeSignatures).size, edgeSignatures.length, `${contentId}: 동일 관계 중복`);

    for (const edge of entry.related_edges) {
      assert.equal(edge.target_kind, 'content', `${contentId}: 이번 흐름은 기존 콘텐츠만 연결합니다.`);
      assert.ok(ALLOWED_RELATION_TYPES.has(edge.relation_type), `${contentId}: 비허용 관계 ${edge.relation_type}`);
      assert.ok(edge.label_ko.trim(), `${contentId}: 관계 설명이 없습니다.`);
      assert.notEqual(edge.target_id, contentId, `${contentId}: 자기 참조`);
      assert.ok(allEntries.has(edge.target_id), `${contentId}: main에 없는 대상 ${edge.target_id}`);
    }
  }
});

test('분쟁유형부터 철회·예외·반품비·환급·거부 후 구제까지 순방향으로 닫힌다', () => {
  assertPath([
    'content.online-contract-evidence-checklist',
    'content.online-purchase-cancellation-seven-days',
    'content.opened-package-return-right',
    'content.who-pays-return-shipping',
    'content.refund-within-three-business-days',
    'content.civil-mediation-vs-civil-lawsuit',
  ]);
  assertPath([
    'content.online-purchase-cancellation-seven-days',
    'content.digital-content-cancellation-exception',
    'content.refund-within-three-business-days',
    'content.payment-order-vs-civil-mediation',
  ]);
  assertPath([
    'content.goods-different-from-advertisement-deadline',
    'content.who-pays-return-shipping',
    'content.refund-within-three-business-days',
    'content.small-claims-trial-vs-general-civil-lawsuit',
  ]);
  assertPath([
    'content.paid-but-goods-not-supplied',
    'content.refund-within-three-business-days',
    'content.payment-order-vs-civil-mediation',
  ]);

  for (const contentId of entries.keys()) {
    assert.ok(reachesAnyRemedy(contentId), `${contentId}: 구제 경로가 닫히지 않았습니다.`);
  }
});

test('활성 DB에서 재확인한 현행 조문·시행문서 좌표와 전수 역참조를 고정한다', () => {
  assert.equal(EXPECTED_SOURCE_BINDINGS.size, sources.size);
  for (const source of sources.values()) {
    const [snapshotId, officialUrl] = EXPECTED_SOURCE_BINDINGS.get(source.source_id) ?? [];
    assert.equal(source.source_snapshot_id, snapshotId, source.source_id);
    assert.match(source.source_snapshot_id, /^snapshot:[0-9a-f]{32}$/u, source.source_id);
    assert.equal(source.official_url, officialUrl, source.source_id);
    assert.match(source.official_url, /^https:\/\/www\.law\.go\.kr\//u, source.source_id);
  }
  assert.equal(
    sources.get('coord.consumer-online-contracts.src-ecommerce-revision-20260721')?.effective_date,
    '2026-07-21',
  );

  const referenced = new Set();
  for (const rule of rules.values()) for (const coordinateId of rule.source_coordinate_ids) referenced.add(coordinateId);
  for (const scenario of scenarios.values()) {
    assert.ok(scenario.source_coordinate_ids.length > 0, `${scenario.scenario_id}: 근거가 없습니다.`);
    for (const coordinateId of scenario.source_coordinate_ids) {
      assert.ok(sources.has(coordinateId), `${scenario.scenario_id}: 없는 근거 ${coordinateId}`);
      referenced.add(coordinateId);
    }
  }
  for (const entry of entries.values()) {
    assert.ok(entry.source_coordinate_ids.length > 0, `${entry.content_id}: 근거가 없습니다.`);
    for (const coordinateId of entry.source_coordinate_ids) {
      assert.ok(sources.has(coordinateId), `${entry.content_id}: 없는 근거 ${coordinateId}`);
      referenced.add(coordinateId);
    }
  }
  assert.equal(referenced.size, sources.size);
  for (const coordinateId of sources.keys()) {
    assert.ok(referenced.has(coordinateId), `역참조 없는 근거: ${coordinateId}`);
  }
});

test('미래 검토시각과 일반인 변호사 연결을 추가하지 않는다', () => {
  const now = Date.now();
  for (const source of sources.values()) {
    assert.ok(Date.parse(source.last_verified_at) <= now, `${source.source_id}: 미래 검증시각`);
    if (source.effective_date) {
      assert.ok(Date.parse(`${source.effective_date}T00:00:00Z`) <= now, `${source.source_id}: 미래 시행문서`);
    }
  }
  for (const entry of entries.values()) {
    assert.equal(entry.reviewed_at, '2026-07-21T08:30:00+00:00', `${entry.content_id}: 검토시각 변경`);
    assert.ok(Date.parse(entry.reviewed_at) <= now, `${entry.content_id}: 미래 검토시각`);
    assert.ok(!Object.hasOwn(entry, 'cta'), `${entry.content_id}: CTA 추가 금지`);
    assert.ok(!Object.hasOwn(entry, 'product_roles'), `${entry.content_id}: 제품 역할 변경 금지`);
    assert.ok(!Object.hasOwn(entry, 'gate_id'), `${entry.content_id}: 게이트 변경 금지`);
    if (entry.lawyer_workspace_entry) {
      assert.equal(entry.lawyer_workspace_entry.href, '/ko/lawyer-workspace');
      assert.equal(entry.lawyer_workspace_entry.audience, 'verified_attorney');
      assert.ok(!Object.hasOwn(entry.lawyer_workspace_entry, 'gate_id'), `${entry.content_id}: 게이트 변경 금지`);
    }
  }
});

function assertPath(contentIds) {
  for (let index = 0; index < contentIds.length - 1; index += 1) {
    const from = entries.get(contentIds[index]);
    assert.ok(
      from?.related_content_ids.includes(contentIds[index + 1]),
      `${contentIds[index]} -> ${contentIds[index + 1]} 경로가 없습니다.`,
    );
  }
}

function reachesAnyRemedy(startId) {
  const queue = [startId];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (REMEDY_TARGETS.has(current)) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const entry = entries.get(current);
    if (entry) queue.push(...entry.related_content_ids);
  }
  return false;
}

function normalize(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
