import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AXIS_WEIGHTS,
  auditSemanticOverlaps,
  compareQuestionSignatures,
  deriveQuestionSignature,
  normalizeNormativeSource,
  validateAllHighScoreDecisions,
  validateHighScoreDecisions,
} from './audit-publication-semantic-overlap.mjs';

function dataset(prNumber, sources, rules, scenarios, entries) {
  return {
    source_path: `fixture-pr-${prNumber ?? 'current'}.json`,
    pr_number: prNumber,
    sources,
    rule_cards: rules,
    scenario_branches: scenarios,
    content_entries: entries,
  };
}

function source(prefix, law, article) {
  return {coordinate_id: `${prefix}.${article}`, law_name_ko: law, article_no: `제${article}조`};
}

function rule(id, actor, effect) {
  return {rule_id: id, norm: {actor_ko: actor, legal_effect_ko: effect}};
}

function entry({id, title, answer, facts, ruleId, sourceIds, related = [], signature}) {
  return {
    content_id: id,
    title_ko: title,
    one_line_answer_ko: answer,
    audience_situation_ko: title,
    action_steps_ko: [title],
    facts_to_check_ko: facts,
    search_intents_ko: [title],
    rule_ids: [ruleId],
    scenario_ids: [],
    source_coordinate_ids: sourceIds,
    related_content_ids: related,
    ...(signature ? {question_signature: signature} : {}),
  };
}

const insolvencyLaw = '채무자 회생 및 파산에 관한 법률';
const civilLaw = '민법';
const industrialLaw = '산업재해보상보험법';

const pr88 = dataset(88,
  [source('coord.personal-insolvency', insolvencyLaw, '579'), source('coord.personal-insolvency', insolvencyLaw, '588'), source('coord.personal-insolvency', insolvencyLaw, '593')],
  [
    rule('rule.88.eligibility', '계속적 수입이 있는 개인채무자', '담보채무 15억원, 그 밖의 채무 10억원 이하이면 개인회생을 신청할 수 있다.'),
    rule('rule.88.stay', '개인회생을 신청한 채무자', '신청만으로 추심과 압류가 자동 중단되지 않고 법원의 중지·금지명령이 필요할 수 있다.'),
  ], [], [
    entry({
      id: 'content.personal-insolvency-personal-rehabilitation-eligibility',
      title: '개인회생 신청 자격은 소득과 빚을 어떻게 보나요?',
      answer: '계속적·반복적 수입 가능성이 있고 담보부 채무 15억원·그 밖의 채무 10억원 이하인 개인채무자여야 합니다.',
      facts: ['계속적 수입', '담보채무 15억원', '무담보채무 10억원'],
      ruleId: 'rule.88.eligibility',
      sourceIds: ['coord.personal-insolvency.579', 'coord.personal-insolvency.588'],
    }),
    entry({
      id: 'content.personal-insolvency-filing-does-not-automatically-stop-collection',
      title: '개인회생을 신청하면 추심과 압류가 바로 자동 중단될까요?',
      answer: '신청만으로 모든 절차가 자동 중단되는 것은 아니며 법원의 중지·금지명령이 필요할 수 있습니다.',
      facts: ['신청 여부', '중지·금지명령 여부'],
      ruleId: 'rule.88.stay',
      sourceIds: ['coord.personal-insolvency.593'],
    }),
  ]);

const pr114 = dataset(114,
  [source('coord.personal-rehabilitation', insolvencyLaw, '579'), source('coord.personal-rehabilitation', insolvencyLaw, '588'), source('coord.personal-rehabilitation', insolvencyLaw, '593')],
  [
    rule('rule.114.eligibility', '정기적 수입 가능성이 있는 개인채무자', '담보채무 15억원·그 밖의 채무 10억원 이하이면 개인회생 신청자격이 있다.'),
    rule('rule.114.stay', '개인회생을 접수한 채무자', '접수만으로 독촉과 압류가 자동 중지되지 않고 법원의 중지·금지명령이 있어야 한다.'),
  ], [], [
    entry({
      id: 'content.personal-rehabilitation-eligibility',
      title: '소득이 있으면 누구나 개인회생을 신청할 수 있나',
      answer: '계속적·반복적인 수입 가능성이 있고 담보채무 15억원·그 밖의 채무 10억원 이하인 개인채무자여야 합니다.',
      facts: ['반복적 수입', '담보채무 15억원', '그 밖의 채무 10억원'],
      ruleId: 'rule.114.eligibility',
      sourceIds: ['coord.personal-rehabilitation.579', 'coord.personal-rehabilitation.588'],
    }),
    entry({
      id: 'content.personal-rehabilitation-stay-order',
      title: '개인회생을 접수하면 독촉과 압류가 자동으로 멈추나',
      answer: '접수만으로 모두 자동 중지되는 것은 아니며 법원이 중지·금지명령을 해야 합니다.',
      facts: ['신청 접수', '중지·금지명령'],
      ruleId: 'rule.114.stay',
      sourceIds: ['coord.personal-rehabilitation.593'],
    }),
  ]);

const pr107 = dataset(107,
  [source('coord.housing-lease-living.civil', civilLaw, '623'), source('coord.housing-lease-living.civil', civilLaw, '626')],
  [
    rule('rule.107.repair', '주택 임대인과 임차인', '임대인은 사용·수익에 필요한 상태를 유지할 수선의무를 부담한다.'),
    rule('rule.107.cost', '필요비를 지출한 임차인', '임차인은 임대인에게 필요비 상환을 청구할 수 있다.'),
  ], [], [
    entry({id: 'content.housing-lease-living-repair-duty', title: '보일러·누수·전기 고장은 누가 수리해야 하나요?', answer: '임대인은 주택을 사용·수익할 수 있는 상태로 유지할 의무가 있습니다.', facts: ['고장 원인', '임차인 과실'], ruleId: 'rule.107.repair', sourceIds: ['coord.housing-lease-living.civil.623']}),
    entry({id: 'content.housing-lease-living-repair-reimbursement', title: '세입자가 먼저 낸 수리비를 돌려받을 수 있나요?', answer: '보존에 필요한 필요비는 임대인에게 상환을 청구할 수 있습니다.', facts: ['필요비', '실제 지출'], ruleId: 'rule.107.cost', sourceIds: ['coord.housing-lease-living.civil.626']}),
  ]);

const pr111 = dataset(111,
  [source('coord.neighbor-leak-noise.civil', civilLaw, '623'), source('coord.neighbor-leak-noise.civil', civilLaw, '626')],
  [
    rule('rule.111.repair', '누수 주택의 임대인과 임차인', '임대인은 사용·수익에 필요한 누수 수선을 해야 한다.'),
    rule('rule.111.cost', '누수 필요비를 지출한 임차인', '임차인은 임대인에게 긴급 수선비 상환을 청구할 수 있다.'),
  ], [], [
    entry({id: 'content.neighbor-leak-noise-rental-repair-duty', title: '임차한 집의 누수는 임대인이 반드시 고쳐야 하나', answer: '사용·수익에 필요한 누수 수선은 원칙적으로 임대인의 의무입니다.', facts: ['누수 원인', '임차인 과실'], ruleId: 'rule.111.repair', sourceIds: ['coord.neighbor-leak-noise.civil.623']}),
    entry({id: 'content.neighbor-leak-noise-urgent-repair-reimbursement', title: '임차인이 급히 누수를 고친 비용을 임대인에게 청구할 수 있나', answer: '임차물 보존에 필요한 비용을 지출했다면 임대인에게 상환을 청구할 수 있습니다.', facts: ['필요성', '긴급성', '실제 지출'], ruleId: 'rule.111.cost', sourceIds: ['coord.neighbor-leak-noise.civil.626']}),
  ]);

const pr100 = dataset(100,
  [source('coord.industrial-accident.act', industrialLaw, '37')],
  [rule('rule.100.recognition', '업무상 사고나 질병을 입은 근로자', '업무와 상당인과관계가 있는 사고나 질병은 업무상 재해로 인정될 수 있다.')], [], [
    entry({id: 'content.industrial-accident-recognition', title: '어떤 사고와 질병이 산재로 인정되나요?', answer: '업무상 사고·질병과 업무 사이 상당인과관계가 있으면 산업재해로 인정될 수 있습니다.', facts: ['업무 관련성', '상당인과관계'], ruleId: 'rule.100.recognition', sourceIds: ['coord.industrial-accident.act.37']}),
  ]);

const pr101 = dataset(101,
  [source('coord.workplace-harassment.iaci', industrialLaw, '37')],
  [rule('rule.101.mental', '직장 내 괴롭힘으로 정신질환이 생긴 근로자', '괴롭힘으로 인한 업무상 정신적 스트레스가 원인이 된 질병은 업무상 재해가 될 수 있다.')], [], [
    entry({id: 'content.harassment-mental-illness-industrial-accident', title: '직장 내 괴롭힘으로 생긴 정신질환도 산재가 되나요?', answer: '괴롭힘으로 인한 업무상 정신적 스트레스가 원인이 된 정신질환은 산재로 인정될 수 있습니다.', facts: ['괴롭힘 사실', '정신질환 진단', '업무 관련성'], ruleId: 'rule.101.mental', sourceIds: ['coord.workplace-harassment.iaci.37'], related: ['content.industrial-accident-recognition']}),
  ]);

const emptyCurrent = dataset(null, [], [], [], []);

test('질문 서명 가중치는 정확히 100점이다', () => {
  assert.equal(Object.values(AXIS_WEIGHTS).reduce((sum, value) => sum + value, 0), 100);
});

test('근거 좌표 접두사가 달라도 법령명과 조문번호로 같은 근거가 된다', () => {
  assert.equal(
    normalizeNormativeSource(source('coord.a', civilLaw, '623')),
    normalizeNormativeSource(source('coord.b.other', civilLaw, '623')),
  );
});

test('#88과 #114의 개인회생 자격·자동중지 질문을 의미중복으로 차단한다', () => {
  const comparisons = auditSemanticOverlaps(emptyCurrent, [pr88, pr114], {minScore: 0});
  for (const ids of [
    ['content.personal-insolvency-personal-rehabilitation-eligibility', 'content.personal-rehabilitation-eligibility'],
    ['content.personal-insolvency-filing-does-not-automatically-stop-collection', 'content.personal-rehabilitation-stay-order'],
  ]) {
    const match = comparisons.find(value => ids.every(id => [value.left.content_id, value.right.content_id].includes(id)));
    assert.ok(match, `비교 결과가 필요합니다: ${ids.join(' / ')}`);
    assert.equal(match.classification, 'duplicate_blocked', `${match.score}점`);
  }
});

test('#107과 #111의 수선의무·비용상환 질문을 의미중복으로 차단한다', () => {
  const comparisons = auditSemanticOverlaps(emptyCurrent, [pr107, pr111], {minScore: 0});
  const blocked = comparisons.filter(value => value.classification === 'duplicate_blocked');
  assert.ok(
    blocked.some(value => value.left.content_id.includes('repair-duty') && value.right.content_id.includes('repair-duty')),
    JSON.stringify(comparisons, null, 2),
  );
  assert.ok(
    blocked.some(value => value.left.content_id.includes('reimbursement') && value.right.content_id.includes('reimbursement')),
    JSON.stringify(comparisons, null, 2),
  );
});

test('#100 일반 산재 인정과 #101 괴롭힘 정신질환 산재는 narrower_application으로 남긴다', () => {
  const [comparison] = auditSemanticOverlaps(emptyCurrent, [pr100, pr101], {minScore: 0});
  assert.notEqual(comparison.classification, 'duplicate_blocked');
  assert.equal(comparison.suggested_relationship, 'narrower_application');
});

test('명시 질문 서명을 우선하고 핵심 시점 충돌이면 자동 중복을 금지한다', () => {
  const base = entry({id: 'content.explicit.a', title: '같은 제목', answer: '같은 답', facts: ['같은 사실'], ruleId: 'none', sourceIds: [], signature: {
    actor_scope: '임차인', life_event: '보증금 반환', user_goal: '반환 청구', procedure_or_forum: '민사소송', legal_effect: '보증금 반환', time_scope: '계약 종료 전', decision_facts: ['계약 종료'], normative_sources: ['주택임대차보호법:3의3'],
  }});
  const later = {...base, content_id: 'content.explicit.b', question_signature: {...base.question_signature, time_scope: '계약 종료 후'}};
  const data = dataset(null, [], [], [], [base, later]);
  const left = deriveQuestionSignature(base, data);
  const right = deriveQuestionSignature(later, data);
  const result = compareQuestionSignatures(left, right, {leftEntry: base, rightEntry: later});
  assert.ok(result.core_conflicts.includes('time_scope'));
  assert.notEqual(result.classification, 'duplicate_blocked');
});

test('--pr-number 게이트에 해당하는 고득점 판정이 production queue에 없으면 실패한다', () => {
  const comparisons = auditSemanticOverlaps(emptyCurrent, [pr88, pr114], {minScore: 50});
  const queue = {items: [
    {pr_number: 88, overlap_decisions: [{target_pr: 114, relationship: 'split_required', rationale_ko: '분리'}]},
    {pr_number: 114, overlap_decisions: []},
  ]};
  assert.deepEqual(validateHighScoreDecisions(comparisons, queue, 88), []);
  assert.ok(validateHighScoreDecisions(comparisons, queue, 114).some(value => value.includes('overlap_decisions')));
});

test('prebuild 게이트는 양쪽 PR 중 한쪽의 명시 판정으로 중복을 해소한다', () => {
  const comparisons = auditSemanticOverlaps(emptyCurrent, [pr107, pr111], {minScore: 50});
  const resolved = {items: [
    {pr_number: 107, overlap_decisions: []},
    {pr_number: 111, overlap_decisions: [{target_pr: 107, relationship: 'split_required', rationale_ko: '분리'}]},
  ]};
  assert.deepEqual(validateAllHighScoreDecisions(comparisons, resolved), []);
  resolved.items[1].overlap_decisions = [];
  assert.ok(validateAllHighScoreDecisions(comparisons, resolved).some(value => value.includes('overlap_decisions')));
});
