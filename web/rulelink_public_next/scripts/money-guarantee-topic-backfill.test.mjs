import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {projectKnowledgeEntryCompatibility} from '../src/lib/knowledge-relations.ts';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topic = JSON.parse(await readFile(path.join(repoRoot, 'artifacts', 'publication', 'topics', 'money-guarantee.json'), 'utf8'));
const current = JSON.parse(await readFile(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8'));
const sources = new Map(topic.sources.map(source => [source.coordinate_id, source]));
const rules = new Map(topic.rule_cards.map(rule => [rule.rule_id, rule]));
const entries = new Map(topic.content_entries.map(entry => [entry.content_id, entry]));
const relatedUniverse = new Set([...entries.keys(), ...current.knowledge.content_entries.map(entry => entry.content_id)]);

const expectedSources = new Map([
  ['civil_act_ko_0598', 'snapshot:62c9abd62ae2907181f1bf7197dc2e43'],
  ['civil_act_ko_0603', 'snapshot:620a0f688ebec421544fd799c874c735'],
  ['interest_limitation_ko_0002', 'snapshot:9ff9730a11f34c6ca21633fb86237a57'],
  ['interest_limitation_ko_0003', 'snapshot:e51609fd4c496a51ed23769a2e33f7d3'],
  ['interest_limitation_ko_0004', 'snapshot:a924783deb9b6831282e34c61666f382'],
  ['src-interest-rate-20', 'snapshot:0bda91fb0a7a72f90a5814354657f781'],
  ['civil_act_ko_0476', 'snapshot:17508bd1f1cc8b784be868019fd90482'],
  ['civil_act_ko_0477', 'snapshot:8d4552e491f504df2b872e4798b13da7'],
  ['civil_act_ko_0478', 'snapshot:0b076a247338119c3dd9802b24b51ae9'],
  ['civil_act_ko_0479', 'snapshot:1ae84c4c6865a278b8cdfdbee34a15fb'],
  ['civil_act_ko_0428_02', 'snapshot:73bd081839cacee21b7b1b32d357749d'],
  ['civil_act_ko_0428_03', 'snapshot:c5073f9edbc623b7e80ccad062d5fbcd'],
  ['civil_act_ko_0429', 'snapshot:6942ac509b9968cd14a4746cb2688113'],
  ['civil_act_ko_0428', 'snapshot:490368327e149e4e150b07272609641e'],
  ['civil_act_ko_0430', 'snapshot:084379d3974c5260edbde413397e9d11'],
  ['civil_act_ko_0162', 'snapshot:b2bc0405fc2a3ab85fa85df111d7e986'],
  ['civil_act_ko_0174', 'snapshot:118310dcf6076c4e98ed4a792541fb83'],
]);

const expectedRelations = new Map([
  ['content.bank-transfer-loan-or-gift', [
    ['content.loan-proof-vs-enforceable-title', 'comparison'],
    ['content.loan-and-guarantee-evidence-checklist', 'procedure'],
    ['content.when-payment-order-fits', 'remedy'],
  ]],
  ['content.loan-without-written-note', [
    ['content.bank-transfer-loan-or-gift', 'prerequisite'],
    ['content.loan-proof-vs-enforceable-title', 'comparison'],
    ['content.loan-and-guarantee-evidence-checklist', 'procedure'],
  ]],
  ['content.loan-without-repayment-date', [
    ['content.bank-transfer-loan-or-gift', 'prerequisite'],
    ['content.when-default-interest-starts', 'deadline'],
    ['content.content-certified-demand-needs-followup', 'remedy'],
  ]],
  ['content.private-loan-interest-limit', [
    ['content.contractual-interest-vs-default-damages', 'comparison'],
    ['content.when-default-interest-starts', 'deadline'],
    ['content.partial-repayment-allocation', 'procedure'],
  ]],
  ['content.partial-repayment-allocation', [
    ['content.contractual-interest-vs-default-damages', 'prerequisite'],
    ['content.loan-and-guarantee-evidence-checklist', 'procedure'],
  ]],
  ['content.guarantee-by-message-validity', [
    ['content.loan-obligation-vs-guarantee-obligation', 'comparison'],
    ['content.loan-and-guarantee-evidence-checklist', 'procedure'],
  ]],
  ['content.continuing-guarantee-maximum-amount', [
    ['content.guarantee-by-message-validity', 'prerequisite'],
    ['content.loan-obligation-vs-guarantee-obligation', 'comparison'],
    ['content.loan-and-guarantee-evidence-checklist', 'procedure'],
  ]],
  ['content.scope-of-guarantee-debt', [
    ['content.continuing-guarantee-maximum-amount', 'prerequisite'],
    ['content.loan-obligation-vs-guarantee-obligation', 'comparison'],
    ['content.loan-and-guarantee-evidence-checklist', 'procedure'],
  ]],
  ['content.content-certified-letter-prescription', [
    ['content.certified-demand-vs-judicial-claim', 'comparison'],
    ['content.content-certified-demand-needs-followup', 'deadline'],
    ['content.when-payment-order-fits', 'remedy'],
  ]],
  ['content.loan-and-guarantee-evidence-checklist', [
    ['content.bank-transfer-loan-or-gift', 'prerequisite'],
    ['content.loan-proof-vs-enforceable-title', 'comparison'],
    ['content.when-payment-order-fits', 'remedy'],
    ['content.provisional-attachment-before-judgment', 'remedy'],
  ]],
]);

const expectedScenarios = [
  ['scenario.money-guarantee.sc-transfer-gift-dispute', '송금 당시 반환 합의와 변제기·이자 약정이 있었는지'],
  ['scenario.money-guarantee.sc-no-note', '차용증 대신 메신저·송금내역에 반환 합의가 나타나는지'],
  ['scenario.money-guarantee.sc-no-due-date', '반환시기를 정한 합의가 있는지'],
  ['scenario.money-guarantee.sc-partial-payment', '일부 변제 당시 어느 채무에 충당할지 합의하거나 지정했는지'],
  ['scenario.money-guarantee.sc-message-guarantee', '보증인의 기명날인 또는 서명이 있는 서면이 존재하는지'],
  ['scenario.money-guarantee.sc-continuing-guarantee', '불확정한 다수 채무를 보증하면서 최고액을 서면으로 특정했는지'],
  ['scenario.money-guarantee.sc-content-certified-demand', '채권의 시효 만료일, 최고가 채무자에게 도달한 날과 6개월 안의 후속조치 여부'],
];

test('후속 typed CTA 이관 전 기존 사실분기 ID와 판단사실을 보존한다', () => {
  assert.deepEqual(
    topic.scenario_branches.map(scenario => [scenario.scenario_id, scenario.decision_fact_ko]),
    expectedScenarios,
  );
});


test('판단규칙과 법률효과가 9개 RuleCard에서 분리된다', () => {
  assert.equal(rules.size, 9);
  for (const rule of rules.values()) {
    assert.notEqual(normalize(rule.proposition_ko), normalize(rule.norm.legal_effect_ko), rule.rule_id);
    assert.ok(rule.proposition_ko.trim() && rule.norm.legal_effect_ko.trim());
  }
});

test('10개 콘텐츠의 typed relation과 legacy 투영 집합을 정확히 고정한다', () => {
  assert.equal(entries.size, 10);
  for (const [entryId, expected] of expectedRelations) {
    const entry = entries.get(entryId);
    const actual = entry.related_edges.map(edge => [edge.target_id, edge.relation_type]);
    assert.deepEqual(actual, expected, entryId);
    assert.ok(entry.related_edges.every(edge => edge.target_kind === 'content' && edge.label_ko.trim()));
    assert.ok(entry.related_edges.every(edge => relatedUniverse.has(edge.target_id)), entryId);
    const expectedIds = expected.map(([targetId]) => targetId);
    assert.deepEqual(entry.related_content_ids, expectedIds, `${entryId}: 명시 legacy 집합`);
    assert.deepEqual(projectKnowledgeEntryCompatibility(entry).related_content_ids, expectedIds, `${entryId}: 투영 legacy 집합`);
    assert.deepEqual(entry.concept_ids, []);
  }
});

test('비용·이자·원본, 채무자 지정, 무지정 법정충당 숫자 예제를 검산한다', () => {
  const entry = entries.get('content.partial-repayment-allocation');
  const section = entry.body_sections.find(item => item.heading_ko === '숫자로 검산하는 세 가지 충당');
  assert.equal(section.paragraphs_ko.length, 3);
  assert.match(section.paragraphs_ko[0], /비용 1만원.*이자 9만원.*원본 20만원.*원본 80만원.*총잔액도 80만원/);
  assert.match(section.paragraphs_ko[1], /A채무 60만원.*B채무 40만원.*B채무에 유효하게 지정.*B채무는 10만원.*총잔액은 70만원/);
  assert.match(section.paragraphs_ko[2], /같은 날 이행기에 도달.*변제이익도 같으며.*어느 쪽도 지정하지 않은.*민법 제477조.*6대4 비율.*A에 18만원.*B에 12만원.*42만원과 28만원.*합계 70만원/);

  const ordered = {before: 1_100_000, payment: 300_000, cost: 10_000, interest: 90_000, principal: 200_000, remaining: 800_000};
  assert.equal(ordered.cost + ordered.interest + ordered.principal, ordered.payment);
  assert.equal(ordered.before - ordered.payment, ordered.remaining);
  const designated = {aBefore: 600_000, bBefore: 400_000, payment: 300_000, aAfter: 600_000, bAfter: 100_000};
  assert.equal(designated.aBefore + designated.bBefore - designated.payment, designated.aAfter + designated.bAfter);
  const statutory = {aBefore: 600_000, bBefore: 400_000, payment: 300_000, aPaid: 180_000, bPaid: 120_000, aAfter: 420_000, bAfter: 280_000};
  assert.equal(statutory.aPaid + statutory.bPaid, statutory.payment);
  assert.equal(statutory.aPaid / statutory.bPaid, statutory.aBefore / statutory.bBefore);
  assert.equal(statutory.aBefore - statutory.aPaid, statutory.aAfter);
  assert.equal(statutory.bBefore - statutory.bPaid, statutory.bAfter);
  assert.equal(statutory.aAfter + statutory.bAfter, 700_000);
});

test('법률상 원본 개념은 품질검토 후보로만 남기고 정본을 임의 생성하지 않는다', () => {
  assert.equal(topic.concept_link_candidates.length, 1);
  const candidate = topic.concept_link_candidates[0];
  assert.equal(candidate.preferred_term_ko, '법률상 원본(원금)');
  assert.equal(candidate.proposed_concept_id, 'concept.kr.obligations.principal');
  assert.equal(candidate.status, 'quality_review_requested');
  assert.ok(candidate.target_content_ids.includes('content.partial-repayment-allocation'));
  assert.equal('concept_cards' in topic, false);
  assert.ok(topic.content_entries.every(entry => entry.related_edges.every(edge => edge.target_kind !== 'concept')));
});

test('활성 DB와 공식 문서에서 재검증한 17개 source와 역참조를 고정한다', () => {
  assert.equal(sources.size, 17);
  assert.equal(expectedSources.size, 17);
  const referenced = new Set([
    ...topic.rule_cards.flatMap(rule => rule.source_coordinate_ids),
    ...topic.scenario_branches.flatMap(scenario => scenario.source_coordinate_ids),
    ...topic.content_entries.flatMap(entry => entry.source_coordinate_ids),
    ...topic.concept_link_candidates.flatMap(candidate => candidate.source_coordinate_ids),
  ]);
  const now = Date.now();
  for (const source of sources.values()) {
    assert.equal(source.source_snapshot_id, expectedSources.get(source.source_id), source.source_id);
    assert.match(source.source_snapshot_id, /^snapshot:[a-f0-9]{32}$/);
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/'));
    assert.ok(Date.parse(source.last_verified_at) <= now, `${source.source_id}: 미래 검증시각`);
    assert.ok(referenced.has(source.coordinate_id), `${source.coordinate_id}: 미참조 source`);
  }
  assert.ok(topic.content_entries.every(entry => Date.parse(entry.reviewed_at) <= now));
});

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, '').replace(/[.,!?·:;()]/g, '');
}
