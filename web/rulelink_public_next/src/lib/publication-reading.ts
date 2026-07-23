import comparisonReadingContract from '@/lib/publication-comparison-reading-contract.json';

import type {
  PublicComparisonMatrix,
  PublicKnowledgeEntry,
  PublicProvisionReadingCard,
} from '@/types/publication';

export type PublicBodySection = PublicKnowledgeEntry['body_sections'][number];

export function comparisonBodySections(matrix: PublicComparisonMatrix): PublicBodySection[] {
  const subjectsById = new Map(matrix.subjects.map(subject => [subject.subject_id, subject]));
  return matrix.axes.map(axis => ({
    heading_ko: axis.title_ko,
    paragraphs_ko: matrix.subjects.map(subject => {
      const cell = axis.cells.find(candidate => candidate.subject_id === subject.subject_id);
      if (!cell) throw new Error(`비교축 ${axis.axis_key}에 ${subject.subject_id} 값이 없습니다.`);
      return `${subjectsById.get(subject.subject_id)?.label_ko} · ${cell.value_ko}`;
    }),
  }));
}

export function knowledgeBodySections(entry: PublicKnowledgeEntry): PublicBodySection[] {
  return entry.comparison_matrix
    ? comparisonBodySections(entry.comparison_matrix)
    : entry.body_sections;
}

export function requiredComparisonAxes(kind: PublicComparisonMatrix['kind']): string[] {
  return comparisonReadingContract.required_axes[kind].map(([key]) => key);
}

export function resolveProvisionReadingCards(
  entry: PublicKnowledgeEntry,
  sharedCards: PublicProvisionReadingCard[] = [],
): PublicProvisionReadingCard[] {
  const byId = new Map(sharedCards.map(card => [card.reading_card_id, card]));
  const resolved = (entry.provision_reading_card_refs ?? [])
    .map(cardId => byId.get(cardId))
    .filter((card): card is PublicProvisionReadingCard => Boolean(card));
  if (entry.provision_reading_card) resolved.unshift(entry.provision_reading_card);
  return resolved;
}
