'use client';

import {useEffect, useMemo, useState} from 'react';

import {AuthorityFragmentController} from '@/components/authority-fragment-controller';
import {AuthorityReadingCard} from '@/components/authority-reading-card';

import type {AuthorityReadingView} from '@/lib/authority-reading';
import {
  claimSelectionState,
  type ScenarioAnswerState,
} from '@/lib/legal-answer-journey-state';
import {
  KNOWLEDGE_SCENARIO_CHANGE_EVENT,
  type KnowledgeScenarioChangeDetail,
} from '@/lib/knowledge-scenario-state';
import type {CanonicalLegalAnswerProjection} from '@/types/legal-answer-packet';
import type {LegalAnswerClaim} from '@/types/legal-answer-packet';
import type {PublicConceptCard} from '@/types/publication';

import styles from './authority-reading-section.module.css';

export function AuthorityReadingSection({
  answer,
  asOf,
  claims = [],
  concepts,
  contentId,
  revisionKey,
  views,
}: {
  answer?: CanonicalLegalAnswerProjection | null;
  asOf: string | null;
  claims?: readonly LegalAnswerClaim[];
  concepts: PublicConceptCard[];
  contentId?: string;
  revisionKey?: string;
  views: readonly AuthorityReadingView[];
}) {
  const [scenarioAnswers, setScenarioAnswers] = useState<ScenarioAnswerState>({});
  useEffect(() => {
    if (!answer || !contentId || !revisionKey) return;
    function handleChange(event: Event) {
      const detail = (event as CustomEvent<KnowledgeScenarioChangeDetail>).detail;
      if (
        !detail
        || detail.contentId !== contentId
        || detail.revisionKey !== revisionKey
      ) return;
      setScenarioAnswers(current => {
        const next = {...current};
        if (detail.answer) next[detail.scenarioId] = detail.answer;
        else delete next[detail.scenarioId];
        return next;
      });
    }
    window.addEventListener(KNOWLEDGE_SCENARIO_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(KNOWLEDGE_SCENARIO_CHANGE_EVENT, handleChange);
  }, [answer, contentId, revisionKey]);
  const claimViews = useMemo(() => {
    if (!answer) return claims.map(claim => ({claim, state: 'active' as const}));
    return answer.claims
      .map(claim => ({
        claim,
        state: claimSelectionState(answer, claim, scenarioAnswers),
      }))
      .filter(item => item.state !== 'excluded');
  }, [answer, claims, scenarioAnswers]);
  if (!views.length) return null;
  return (
    <section
      aria-labelledby="authority-reading-title"
      className={styles.root}
      data-authority-reading-root
      id="statute-reading"
    >
      <AuthorityFragmentController />
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>공식 근거</p>
          <h2 id="authority-reading-title">이 글의 판단에 사용한 조문을 항·호별로 확인합니다.</h2>
          <p>쉬운 설명과 확인한 법령 문언을 나란히 읽을 수 있습니다.</p>
        </div>
        {asOf ? (
          <p className={styles.asOf}>
            <span>전체 기준일</span>
            <time dateTime={asOf}>{formatDate(asOf)}</time>
          </p>
        ) : null}
      </header>
      <div className={styles.grid}>
        {views.map((view, index) => (
          <AuthorityReadingCard
            claims={claimViews.filter(({claim}) => claim.authority_refs.some(reference => (
              reference.authority_reading_unit_id === view.authorityReadingUnitId
              || reference.source_coordinate_id === view.source.coordinate_id
            )))}
            concepts={concepts}
            key={view.authorityReadingUnitId}
            primary={index === 0}
            view={view}
          />
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
