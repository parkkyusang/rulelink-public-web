import type {
  CanonicalLegalAnswerProjection,
  LegalAnswerClaim,
  LegalAnswerUnit,
} from '@/types/legal-answer-packet';
import type {KnowledgeScenarioAnswer} from './knowledge-scenario-state';

export type ClaimSelectionState = 'active' | 'excluded' | 'pending';

export type ScenarioAnswerState = Record<string, KnowledgeScenarioAnswer>;

export function claimSelectionState(
  answer: CanonicalLegalAnswerProjection,
  claim: LegalAnswerClaim,
  scenarioAnswers: ScenarioAnswerState,
): ClaimSelectionState {
  if (!claim.conditions.branch_ids.length) return 'active';
  const branches = claim.conditions.branch_ids.map(branchId => (
    answer.branches.find(branch => branch.branch_id === branchId)
  ));
  if (branches.some(branch => !branch)) return 'pending';
  for (const branch of branches) {
    const selected = scenarioAnswers[branch!.scenario_id];
    if (!selected || selected === 'unknown') return 'pending';
    if (selected !== branch!.answer) return 'excluded';
  }
  return 'active';
}

export function answerUnitSelectionState(
  answer: CanonicalLegalAnswerProjection,
  unit: LegalAnswerUnit,
  scenarioAnswers: ScenarioAnswerState,
): ClaimSelectionState {
  const claims = unit.claim_ids.map(claimId => (
    answer.claims.find(claim => claim.claim_id === claimId)
  ));
  if (!claims.length || claims.some(claim => !claim)) return 'pending';
  const states = claims.map(claim => (
    claimSelectionState(answer, claim!, scenarioAnswers)
  ));
  if (states.includes('excluded')) return 'excluded';
  if (states.includes('pending')) return 'pending';
  return 'active';
}

export function selectedClaims(
  answer: CanonicalLegalAnswerProjection,
  scenarioAnswers: ScenarioAnswerState,
): LegalAnswerClaim[] {
  return answer.claims.filter(claim => (
    claimSelectionState(answer, claim, scenarioAnswers) === 'active'
  ));
}
