import type {ReactNode} from 'react';

import type {PublicConceptCard} from '@/types/publication';

import styles from './legal-concept-text.module.css';

type ConceptTerm = Pick<
  PublicConceptCard,
  'concept_id' | 'slug' | 'preferred_term_ko' | 'aliases_ko' | 'plain_definition_ko'
>;

export function LegalConceptText({concepts, text}: {concepts: ConceptTerm[]; text: string}) {
  const termToConcept = new Map<string, ConceptTerm>();
  for (const concept of concepts) {
    for (const term of [concept.preferred_term_ko, ...concept.aliases_ko]) {
      const normalized = term.trim();
      if (normalized.length >= 2 && !termToConcept.has(normalized)) termToConcept.set(normalized, concept);
    }
  }
  const terms = [...termToConcept.keys()].sort((left, right) => right.length - left.length);
  if (!terms.length) return <>{text}</>;

  const parts = text.split(new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gu'));
  const rendered: ReactNode[] = parts.map((part, index) => {
    const concept = termToConcept.get(part);
    if (!concept) return part;
    return (
      <span className={styles.term} key={`${concept.concept_id}-${index}`}>
        <a
          aria-label={`${concept.preferred_term_ko} 뜻 보기`}
          className={styles.termLink}
          href={`/ko/concepts/${concept.slug}`}
        >
          {part}
        </a>
        <span className={styles.popover} role="note">
          <strong>{concept.preferred_term_ko}</strong>
          <span>{concept.plain_definition_ko}</span>
          <em>개념 페이지에서 근거와 요건 보기 →</em>
        </span>
      </span>
    );
  });

  return <>{rendered}</>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
