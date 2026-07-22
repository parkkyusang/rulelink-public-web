'use client';

import {useEffect, useId, useRef, useState, type ReactNode} from 'react';

import {inlineTermsForConcept, splitTextByConceptTerms} from '@/lib/concept-terms';
import type {PublicConceptCard} from '@/types/publication';

import styles from './legal-concept-text.module.css';

type ConceptTerm = Pick<
  PublicConceptCard,
  'concept_id' | 'slug' | 'preferred_term_ko' | 'term_relations' | 'plain_definition_ko'
>;

export function LegalConceptText({concepts, text}: {concepts: ConceptTerm[]; text: string}) {
  const instanceId = useId().replaceAll(':', '');
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [openTermKey, setOpenTermKey] = useState<string | null>(null);

  useEffect(() => {
    if (!openTermKey) return;
    const activeTermKey = openTermKey;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenTermKey(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      triggerRefs.current.get(activeTermKey)?.focus();
      setOpenTermKey(null);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openTermKey]);

  const termToConcept = new Map<string, ConceptTerm>();
  for (const concept of concepts) {
    for (const term of inlineTermsForConcept(concept)) {
      if (term.length >= 2 && !termToConcept.has(term)) termToConcept.set(term, concept);
    }
  }
  const terms = [...termToConcept.keys()].sort((left, right) => right.length - left.length);
  if (!terms.length) return <>{text}</>;

  const parts = splitTextByConceptTerms(text, terms);
  const rendered: ReactNode[] = parts.map((part, index) => {
    const concept = termToConcept.get(part);
    if (!concept) return part;
    const termKey = `${concept.concept_id}-${index}`;
    const popoverId = `concept-${instanceId}-${index}`;
    const isOpen = openTermKey === termKey;
    return (
      <span className={styles.term} data-open={isOpen ? 'true' : undefined} key={termKey}>
        <button
          aria-controls={popoverId}
          aria-expanded={isOpen}
          aria-label={`${concept.preferred_term_ko} 뜻 ${isOpen ? '닫기' : '열기'}`}
          className={styles.termButton}
          onClick={() => setOpenTermKey(current => current === termKey ? null : termKey)}
          ref={node => {
            if (node) triggerRefs.current.set(termKey, node);
            else triggerRefs.current.delete(termKey);
          }}
          type="button"
        >
          {part}
        </button>
        <span aria-label={`${concept.preferred_term_ko} 용어 해설`} className={styles.popover} id={popoverId} role="group">
          <strong>{concept.preferred_term_ko}</strong>
          <span>{concept.plain_definition_ko}</span>
          <a href={`/ko/concepts/${concept.slug}`}>개념 페이지에서 근거와 요건 보기 →</a>
        </span>
      </span>
    );
  });

  return (
    <span
      className={styles.text}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenTermKey(null);
      }}
      ref={rootRef}
    >
      {rendered}
    </span>
  );
}

