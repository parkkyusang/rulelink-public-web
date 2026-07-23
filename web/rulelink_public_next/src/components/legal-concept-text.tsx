'use client';

import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  type OpenChangeReason,
} from '@floating-ui/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {inlineTermsForConcept, splitTextByConceptTerms} from '@/lib/concept-terms';
import type {PublicConceptCard} from '@/types/publication';

import styles from './legal-concept-text.module.css';

type ConceptTerm = Pick<
  PublicConceptCard,
  'concept_id' | 'slug' | 'preferred_term_ko' | 'term_relations' | 'plain_definition_ko'
>;

type ConceptLayerContextValue = {
  activePopoverId: string | null;
  closePopover: (popoverId: string) => void;
  isMobile: boolean;
  openPopover: (popoverId: string) => void;
};

const ConceptLayerContext = createContext<ConceptLayerContextValue | null>(null);
const conceptLayerId = 'rulelink-concept-layer';
const conceptContentGroupProps = {role: 'group'} as const;

export function LegalConceptLayer({children}: {children: ReactNode}) {
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const syncViewport = () => setIsMobile(query.matches);
    syncViewport();
    query.addEventListener('change', syncViewport);
    return () => query.removeEventListener('change', syncViewport);
  }, []);

  const openPopover = useCallback((popoverId: string) => {
    setActivePopoverId(popoverId);
  }, []);
  const closePopover = useCallback((popoverId: string) => {
    setActivePopoverId(current => current === popoverId ? null : current);
  }, []);
  const value = useMemo(() => ({
    activePopoverId,
    closePopover,
    isMobile,
    openPopover,
  }), [activePopoverId, closePopover, isMobile, openPopover]);

  return <ConceptLayerContext.Provider value={value}>{children}</ConceptLayerContext.Provider>;
}

export function LegalConceptText({concepts, text}: {concepts: ConceptTerm[]; text: string}) {
  const instanceId = useId().replaceAll(':', '');
  const termToConcept = new Map<string, ConceptTerm>();
  for (const concept of concepts) {
    for (const term of inlineTermsForConcept(concept)) {
      if (term.length >= 2 && !termToConcept.has(term)) termToConcept.set(term, concept);
    }
  }
  const terms = [...termToConcept.keys()].sort((left, right) => right.length - left.length);
  if (!terms.length) return <>{text}</>;

  const parts = splitTextByConceptTerms(text, terms);
  return (
    <span className={styles.text}>
      {parts.map((part, index) => {
        const concept = termToConcept.get(part);
        if (!concept) return part;
        const popoverId = `concept-${instanceId}-${index}`;
        return (
          <ConceptPopover
            concept={concept}
            key={`${concept.concept_id}-${index}`}
            part={part}
            popoverId={popoverId}
          />
        );
      })}
    </span>
  );
}

function ConceptPopover({
  concept,
  part,
  popoverId,
}: {
  concept: ConceptTerm;
  part: string;
  popoverId: string;
}) {
  const layer = useContext(ConceptLayerContext);
  if (!layer) throw new Error('LegalConceptText는 LegalConceptLayer 안에서 렌더링해야 합니다.');

  const {activePopoverId, closePopover, isMobile, openPopover} = layer;
  const isOpen = activePopoverId === popoverId;
  const titleId = `${popoverId}-title`;
  const descriptionId = `${popoverId}-description`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocus = useCallback(() => {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);
  const closeAndRestoreFocus = useCallback(() => {
    closePopover(popoverId);
    restoreTriggerFocus();
  }, [closePopover, popoverId, restoreTriggerFocus]);
  const handleOpenChange = useCallback((nextOpen: boolean, _event?: Event, reason?: OpenChangeReason) => {
    if (nextOpen) {
      openPopover(popoverId);
      return;
    }
    closePopover(popoverId);
    if (reason === 'escape-key') restoreTriggerFocus();
  }, [closePopover, openPopover, popoverId, restoreTriggerFocus]);
  const {context, floatingStyles, placement, refs} = useFloating({
    middleware: isMobile ? [] : [
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
    onOpenChange: handleOpenChange,
    open: isOpen,
    placement: 'top',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    delay: {close: 80, open: 60},
    handleClose: safePolygon({buffer: 2}),
    mouseOnly: true,
    move: false,
  });
  const focus = useFocus(context, {visibleOnly: true});
  const click = useClick(context, {event: 'click', stickIfOpen: true, toggle: true});
  const dismiss = useDismiss(context, {
    escapeKey: true,
    outsidePress: true,
    outsidePressEvent: 'pointerdown',
  });
  const {getFloatingProps, getReferenceProps} = useInteractions([hover, focus, click, dismiss]);

  return (
    <span className={styles.term} data-open={isOpen ? 'true' : undefined}>
      <button
        {...getReferenceProps({
          'aria-controls': popoverId,
          'aria-expanded': isOpen,
          'aria-haspopup': 'dialog',
          'aria-label': `${concept.preferred_term_ko} 뜻 보기`,
        })}
        className={styles.termButton}
        ref={node => {
          triggerRef.current = node;
          refs.setReference(node);
        }}
        type="button"
      >
        {part}
      </button>
      {isOpen ? (
        <FloatingPortal id={conceptLayerId}>
          <FloatingFocusManager context={context} initialFocus={-1} modal={false} returnFocus={false}>
            <span
              {...getFloatingProps({
                'aria-describedby': descriptionId,
                'aria-labelledby': titleId,
                'aria-modal': false,
                id: popoverId,
                role: 'dialog',
                tabIndex: -1,
              })}
              className={styles.popover}
              data-layout={isMobile ? 'sheet' : 'anchored'}
              data-placement={placement}
              ref={refs.setFloating}
              style={isMobile ? undefined : floatingStyles}
            >
              <span
                {...conceptContentGroupProps}
                aria-label={`${concept.preferred_term_ko} 용어 해설 내용`}
                className={styles.content}
              >
                <button
                  aria-label={`${concept.preferred_term_ko} 뜻 해설 닫기`}
                  className={styles.closeButton}
                  onClick={closeAndRestoreFocus}
                  type="button"
                >
                  닫기
                </button>
                <strong id={titleId}>{concept.preferred_term_ko}</strong>
                <span id={descriptionId}>{concept.plain_definition_ko}</span>
                <a href={`/ko/concepts/${concept.slug}`}>개념 페이지에서 근거와 요건 보기 →</a>
              </span>
            </span>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </span>
  );
}
