'use client';

import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/react';
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
  const {context, floatingStyles, placement, refs} = useFloating({
    middleware: [
      offset(10),
      flip({fallbackAxisSideDirection: 'start', padding: 12}),
      shift({crossAxis: true, padding: 12}),
      size({
        padding: 12,
        apply({availableHeight, availableWidth, elements}) {
          elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
          elements.floating.style.maxWidth = `${Math.max(0, Math.min(320, availableWidth))}px`;
        },
      }),
    ],
    open: openTermKey !== null,
    placement: 'top',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!openTermKey) return;
    const activeTermKey = openTermKey;

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !refs.floating.current?.contains(target)) {
        setOpenTermKey(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpenTermKey(null);
      triggerRefs.current.get(activeTermKey)?.focus();
    }

    function closeOnFocusMove(event: FocusEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !refs.floating.current?.contains(target)) {
        setOpenTermKey(null);
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('focusin', closeOnFocusMove);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('focusin', closeOnFocusMove);
    };
  }, [openTermKey, refs.floating]);

  const termToConcept = new Map<string, ConceptTerm>();
  for (const concept of concepts) {
    for (const term of inlineTermsForConcept(concept)) {
      if (term.length >= 2 && !termToConcept.has(term)) termToConcept.set(term, concept);
    }
  }
  const terms = [...termToConcept.keys()].sort((left, right) => right.length - left.length);
  if (!terms.length) return <>{text}</>;

  const parts = splitTextByConceptTerms(text, terms);
  const annotatedParts = parts.map((part, index) => {
    const concept = termToConcept.get(part);
    return {
      concept,
      part,
      popoverId: concept ? `concept-${instanceId}-${index}` : null,
      termKey: concept ? `${concept.concept_id}-${index}` : null,
    };
  });
  const activePart = annotatedParts.find(part => part.termKey === openTermKey && part.concept);
  const rendered: ReactNode[] = annotatedParts.map(({concept, part, popoverId, termKey}) => {
    if (!concept || !popoverId || !termKey) return part;
    const isOpen = openTermKey === termKey;
    return (
      <span className={styles.term} data-open={isOpen ? 'true' : undefined} key={termKey}>
        <button
          aria-controls={popoverId}
          aria-expanded={isOpen}
          aria-label={`${concept.preferred_term_ko} 뜻 ${isOpen ? '닫기' : '열기'}`}
          className={styles.termButton}
          onClick={event => {
            refs.setReference(event.currentTarget);
            setOpenTermKey(current => current === termKey ? null : termKey);
          }}
          ref={node => {
            if (node) triggerRefs.current.set(termKey, node);
            else triggerRefs.current.delete(termKey);
          }}
          type="button"
        >
          {part}
        </button>
      </span>
    );
  });

  return (
    <>
      <span className={styles.text} ref={rootRef}>{rendered}</span>
      {activePart?.concept && activePart.popoverId ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} initialFocus={refs.floating} modal={false} returnFocus={false}>
            <span
              aria-label={`${activePart.concept.preferred_term_ko} 용어 해설`}
              className={styles.popover}
              data-placement={placement}
              id={activePart.popoverId}
              ref={refs.setFloating}
              role="group"
              style={floatingStyles}
              tabIndex={-1}
            >
              <strong>{activePart.concept.preferred_term_ko}</strong>
              <span>{activePart.concept.plain_definition_ko}</span>
              <a href={`/ko/concepts/${activePart.concept.slug}`}>개념 페이지에서 근거와 요건 보기 →</a>
            </span>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}

