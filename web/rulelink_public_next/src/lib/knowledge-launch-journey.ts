import type {
  CanonicalLegalAnswerProjection,
  LegalAnswerDeadline,
} from '@/types/legal-answer-packet';

export type KnowledgeJourneyDeadline = {
  date?: string;
  id: string;
  label: string;
  statusLabel: string;
};

export type KnowledgeJourneyChecklistItem = {
  id?: string;
  label: string;
};

export type KnowledgeLaunchJourney = {
  actionItems: KnowledgeJourneyChecklistItem[];
  evidenceItems: KnowledgeJourneyChecklistItem[];
  factsToCheck: string[];
  deadlines: KnowledgeJourneyDeadline[];
};

export function buildKnowledgeLaunchJourney({
  actionSteps,
  answer,
  factsToCheck,
}: {
  actionSteps: readonly string[];
  answer: CanonicalLegalAnswerProjection | null;
  factsToCheck: readonly string[];
}): KnowledgeLaunchJourney {
  const packetFacts = answer?.facts
    .filter(fact => (
      fact.confirmation !== 'contradicted'
      && ['blocking', 'outcome_changing'].includes(fact.materiality)
    ))
    .map(fact => fact.statement_ko) ?? [];
  const packetActions = answer?.actions
    .filter(action => action.status !== 'not_applicable')
    .map(action => ({id: action.action_id, label: action.label_ko})) ?? [];
  const packetEvidence = answer?.evidence
    .filter(evidence => evidence.status !== 'not_applicable')
    .map(evidence => ({id: evidence.evidence_id, label: evidence.label_ko})) ?? [];

  return {
    actionItems: uniqueItems([
      ...packetActions,
      ...actionSteps.map(label => ({label})),
    ]),
    evidenceItems: uniqueItems(packetEvidence),
    factsToCheck: uniqueText([...packetFacts, ...factsToCheck]),
    deadlines: answer?.deadlines
      .filter(deadline => deadline.status !== 'not_applicable')
      .map(toJourneyDeadline) ?? [],
  };
}

function toJourneyDeadline(deadline: LegalAnswerDeadline): KnowledgeJourneyDeadline {
  return {
    ...(deadline.calculated_date ? {date: deadline.calculated_date} : {}),
    id: deadline.deadline_id,
    label: deadline.label_ko,
    statusLabel: {
      calculated: '계산된 날짜',
      exception_possible: '예외 확인 필요',
      needs_trigger_fact: '기준 사실 확인 필요',
      not_applicable: '해당 없음',
    }[deadline.status],
  };
}

function uniqueItems(
  values: readonly KnowledgeJourneyChecklistItem[],
): KnowledgeJourneyChecklistItem[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = normalizedText(value.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = normalizedText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}
