import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {buildKnowledgeLaunchJourney} from '../src/lib/knowledge-launch-journey.ts';
import {
  answerUnitSelectionState,
  claimSelectionState,
} from '../src/lib/legal-answer-journey-state.ts';

const root = path.resolve(import.meta.dirname, '..');
const packet = JSON.parse(await readFile(
  path.join(root, 'scripts/fixtures/legal-answer-packet/canonical-public.json'),
  'utf8',
));
const quickIds = new Set(packet.answer.quick_answer_unit_ids);
const answer = {
  packetId: packet.packet_id,
  status: packet.status,
  asOf: packet.as_of,
  canonicalContentIds: packet.retrieval.canonical_content_ids,
  quickAnswer: packet.answer.units.filter(unit => quickIds.has(unit.unit_id)),
  answerUnits: packet.answer.units,
  facts: packet.facts,
  branches: packet.branches,
  claims: packet.claims,
  evidence: packet.evidence_requirements,
  actions: packet.actions,
  deadlines: packet.deadlines,
};

test('조건부 답은 연결된 모든 사실분기가 맞기 전에는 활성화되지 않는다', () => {
  const claim = answer.claims.find(item => (
    item.claim_id === 'claim.compensation-order.eligibility'
  ));
  const unit = answer.quickAnswer[0];
  assert.equal(claimSelectionState(answer, claim, {}), 'pending');
  assert.equal(answerUnitSelectionState(answer, unit, {}), 'pending');

  const firstBranch = answer.branches[0];
  const secondBranch = answer.branches[1];
  assert.equal(claimSelectionState(answer, claim, {
    [firstBranch.scenario_id]: 'yes',
  }), 'pending');
  assert.equal(claimSelectionState(answer, claim, {
    [firstBranch.scenario_id]: 'yes',
    [secondBranch.scenario_id]: 'unknown',
  }), 'pending');
  assert.equal(claimSelectionState(answer, claim, {
    [firstBranch.scenario_id]: 'yes',
    [secondBranch.scenario_id]: 'yes',
  }), 'active');
  assert.equal(answerUnitSelectionState(answer, unit, {
    [firstBranch.scenario_id]: 'yes',
    [secondBranch.scenario_id]: 'yes',
  }), 'active');
  assert.equal(claimSelectionState(answer, claim, {
    [firstBranch.scenario_id]: 'no',
    [secondBranch.scenario_id]: 'yes',
  }), 'excluded');
});

test('패킷의 사실·자료·행동·기한은 정본 배열과 중복 없이 작업 흐름에 합쳐진다', () => {
  const journey = buildKnowledgeLaunchJourney({
    actionSteps: ['기존 행동', answer.actions[0].label_ko],
    answer,
    factsToCheck: ['기존 사실', answer.facts[0].statement_ko],
  });
  assert.ok(journey.factsToCheck.includes('기존 사실'));
  assert.ok(journey.factsToCheck.includes(answer.facts[0].statement_ko));
  assert.equal(
    journey.actionItems.filter(value => value.label === answer.actions[0].label_ko).length,
    1,
  );
  assert.deepEqual(
    journey.evidenceItems.map(item => item.id),
    answer.evidence.map(item => item.evidence_id),
  );
  assert.deepEqual(
    journey.actionItems.filter(item => item.id).map(item => item.id),
    answer.actions.map(item => item.action_id),
  );
  assert.deepEqual(
    journey.deadlines.map(item => item.id),
    answer.deadlines.map(item => item.deadline_id),
  );
});

test('주장별 자료·행동·기한 링크는 실제 작업 목록의 exact packet ID를 가리킨다', async () => {
  const [answerCard, page, sourceEvidence, workspace] = await Promise.all([
    readFile(path.join(root, 'src/components/verified-legal-answer-card.tsx'), 'utf8'),
    readFile(path.join(root, 'app/ko/knowledge/[slug]/page.tsx'), 'utf8'),
    readFile(path.join(root, 'src/components/knowledge-source-evidence.tsx'), 'utf8'),
    readFile(path.join(root, 'src/components/knowledge-action-workspace.tsx'), 'utf8'),
  ]);
  assert.match(answerCard, /href=\{`#packet-evidence-\$\{item\.evidence_id\}`\}/u);
  assert.match(answerCard, /href=\{`#packet-action-\$\{item\.action_id\}`\}/u);
  assert.match(answerCard, /href=\{`#packet-deadline-\$\{item\.deadline_id\}`\}/u);
  assert.match(workspace, /`packet-\$\{group\}-\$\{item\.id\}`/u);
  assert.match(workspace, /id=\{`packet-deadline-\$\{deadline\.id\}`\}/u);
  assert.match(workspace, /tabIndex=\{targetId \? -1 : undefined\}/u);
  assert.match(page, /\[view\.authorityReadingUnitId, view\.cardDomId\]/u);
  assert.match(answerCard, /authorityTargetIds\[reference\.authority_reading_unit_id \?\? ''\]/u);
  assert.match(sourceEvidence, /id=\{`source-summary-\$\{source\.coordinate_id\}`\}/u);
});

test('조문·출처 카드의 claim은 분기 선택 상태를 소비하고 배제 claim을 렌더하지 않는다', async () => {
  const [section, card, source] = await Promise.all([
    readFile(path.join(root, 'src/components/authority-reading-section.tsx'), 'utf8'),
    readFile(path.join(root, 'src/components/authority-reading-card.tsx'), 'utf8'),
    readFile(path.join(root, 'src/components/knowledge-source-evidence.tsx'), 'utf8'),
  ]);
  assert.match(section, /claimSelectionState\(answer, claim, scenarioAnswers\)/u);
  assert.match(section, /\.filter\(item => item\.state !== 'excluded'\)/u);
  assert.match(card, /data-claim-state=\{state\}/u);
  assert.match(card, /사실 확인 전 조건부/u);
  assert.match(source, /claimSelectionState\(answer, claim, scenarioAnswers\)/u);
  assert.match(source, /\.filter\(item => item\.state !== 'excluded'\)/u);
  assert.match(source, /data-claim-state=\{state\}/u);
});

test('검색 질문은 exact scenario anchor로 넘기고 상세는 같은 식별자로 받는다', async () => {
  const [search, page, focus] = await Promise.all([
    readFile(path.join(root, 'src/components/site-search.tsx'), 'utf8'),
    readFile(path.join(root, 'app/ko/knowledge/[slug]/page.tsx'), 'utf8'),
    readFile(path.join(root, 'src/components/scenario-handoff-focus.tsx'), 'utf8'),
  ]);
  assert.match(search, /#scenario-\$\{result\.decisionScenarioId\}/u);
  assert.match(page, /id=\{`scenario-\$\{branch\.scenario_id\}`\}/u);
  assert.match(page, /tabIndex=\{-1\}/u);
  assert.match(focus, /window\.location\.hash/u);
  assert.match(focus, /target\.focus/u);
});

test('상세 세로 흐름은 사실분기 뒤 조건부 답, 근거, 행동, 추가질문 순서다', async () => {
  const page = await readFile(
    path.join(root, 'app/ko/knowledge/[slug]/page.tsx'),
    'utf8',
  );
  const scenarios = page.indexOf('id="scenarios"');
  const verified = page.indexOf('<VerifiedLegalAnswerCard', scenarios);
  const rules = page.indexOf('id="rules"', verified);
  const sources = page.indexOf('id="sources"', rules);
  const actions = page.indexOf('id="actions"', sources);
  const followUp = page.indexOf('<KnowledgeFollowUpQuestions', actions);
  assert.ok(
    scenarios >= 0
    && verified > scenarios
    && rules > verified
    && sources > rules
    && actions > sources
    && followUp > actions,
  );
  assert.doesNotMatch(page, /\/ko\/answers/u);
});

test('공식근거 카드는 내부 식별자를 숨기고 검증된 조문 원문과 공식 링크를 제공한다', async () => {
  const source = await readFile(
    path.join(root, 'src/components/knowledge-source-evidence.tsx'),
    'utf8',
  );
  assert.match(source, /source\.coordinate_id/u);
  assert.doesNotMatch(source, /source\.source_snapshot_id/u);
  assert.doesNotMatch(source, /별도 답변 패킷|출판 원문본/u);
  assert.match(source, /<p>\{sourceText\}<\/p>/u);
  assert.match(source, /조문 원문/u);
  assert.ok(
    source.indexOf('data-claim-authority') < 0,
    '축약 근거 카드는 claim 연결을 새로 추론하지 않아야 합니다.',
  );
  assert.ok(source.indexOf('className={styles.official}') > source.indexOf('sourceClaims.length'));
  assert.doesNotMatch(source, /content\.[a-z0-9.-]+/u);
});
