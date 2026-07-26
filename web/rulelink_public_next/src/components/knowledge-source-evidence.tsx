'use client';

import {useEffect, useMemo, useState} from 'react';

import {
  claimSelectionState,
  type ScenarioAnswerState,
} from '@/lib/legal-answer-journey-state';
import {
  KNOWLEDGE_SCENARIO_CHANGE_EVENT,
  type KnowledgeScenarioChangeDetail,
} from '@/lib/knowledge-scenario-state';
import type {
  CanonicalLegalAnswerProjection,
  LegalAnswerClaim,
} from '@/types/legal-answer-packet';

import styles from './knowledge-source-evidence.module.css';

export type PublicKnowledgeSourceView = {
  coordinate_id: string;
  source_kind?: 'statute' | 'precedent' | 'official_document';
  title_ko?: string;
  law_name_ko?: string;
  article_no?: string;
  case_number?: string;
  promulgation_number?: string;
  official_url: string;
  last_verified_at: string;
  decision_date?: string;
  effective_date?: string;
};

export function KnowledgeSourceEvidence({
  answer,
  claims = [],
  contentId,
  revisionKey,
  sources,
  sourceTexts = {},
}: {
  answer?: CanonicalLegalAnswerProjection | null;
  claims?: readonly LegalAnswerClaim[];
  contentId?: string;
  revisionKey?: string;
  sources: readonly PublicKnowledgeSourceView[];
  sourceTexts?: Readonly<Record<string, string>>;
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

  if (!sources.length) return null;
  return (
    <section
      aria-labelledby="source-evidence-heading"
      className={styles.root}
      data-source-evidence
    >
      <header>
        <p className="eyebrow">공식 근거와 원문</p>
        <h2 id="source-evidence-heading">이 글에서 참고한 조문과 공식 자료입니다.</h2>
        <p>
          저장된 공식 원문과 이 글이 참고한 법령 버전이 일치하는 조문은
          페이지 안에서 바로 읽을 수 있습니다. 공식 사이트의 원문 전체도 함께 확인할 수 있습니다.
        </p>
      </header>
      <div className={styles.grid}>
        {sources.map((source, index) => {
          const sourceClaims = claimViews.filter(({claim}) => (
            claim.authority_refs.some(reference => (
              reference.source_coordinate_id === source.coordinate_id
            ))
          ));
          const versionStates = unique(
            sourceClaims.flatMap(({claim}) => claim.authority_refs
              .filter(reference => reference.source_coordinate_id === source.coordinate_id)
              .map(reference => reference.version.time_state)),
          );
          const officialUrl = source.official_url;
          const sourceText = sourceTexts[source.coordinate_id];
          return (
            <article
              className={styles.card}
              id={`source-${source.coordinate_id}`}
              key={source.coordinate_id}
            >
              <details open={index === 0}>
                <summary id={`source-summary-${source.coordinate_id}`}>
                  <span>
                    <small>{sourceKindLabel(source)}</small>
                    <strong>{sourceLabel(source)}</strong>
                  </span>
                  <span className={styles.reviewed}>
                    원문 확인 {formatDate(source.last_verified_at)}
                  </span>
                </summary>
                <div className={styles.body}>
                  <dl>
                    <div><dt>근거 위치</dt><dd>{sourceLocator(source)}</dd></div>
                    {sourceDate(source) ? (
                      <div>
                        <dt>{sourceDate(source)!.label}</dt>
                        <dd>{sourceDate(source)!.value}</dd>
                      </div>
                    ) : null}
                    {versionStates.length ? (
                      <div>
                        <dt>적용 상태</dt>
                        <dd>{versionStates.map(versionStateLabel).join(' · ')}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {sourceText ? (
                    <section className={styles.officialText}>
                      <h3>조문 원문</h3>
                      <p>{sourceText}</p>
                    </section>
                  ) : null}
                  {sourceClaims.length ? (
                    <section aria-label={`${sourceLabel(source)}가 뒷받침하는 내용`}>
                      <h3>이 근거가 뒷받침하는 내용</h3>
                      <ul>
                        {sourceClaims.map(({claim, state}) => (
                          <li data-claim-state={state} key={claim.claim_id}>
                            <span>
                              {state === 'pending' ? '사실 확인 전 조건부' : '선택한 사실과 연결'}
                            </span>
                            {claim.statement_ko}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  <a
                    className={styles.official}
                    href={officialUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    공식 원문 전체 보기 <span>(새 탭)</span>
                  </a>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function sourceKindLabel(source: PublicKnowledgeSourceView): string {
  if (source.source_kind === 'precedent') return '판례';
  if (source.source_kind === 'official_document') return '공식문서';
  return '법령';
}

function sourceLabel(source: PublicKnowledgeSourceView): string {
  if (source.source_kind === 'precedent' || source.source_kind === 'official_document') {
    return source.title_ko ?? '공식 자료';
  }
  return `${source.law_name_ko ?? '법령'} ${source.article_no ?? ''}`.trim();
}

function sourceLocator(source: PublicKnowledgeSourceView): string {
  if (source.source_kind === 'precedent') return source.case_number ?? '사건번호 확인';
  if (source.source_kind === 'official_document') {
    return source.promulgation_number ?? '문서번호 확인';
  }
  return source.article_no ?? '조문 확인';
}

function sourceDate(source: PublicKnowledgeSourceView): {label: string; value: string} | null {
  if (source.source_kind === 'precedent' && source.decision_date) {
    return {label: '선고일', value: formatDate(source.decision_date)};
  }
  if (source.source_kind === 'official_document' && source.effective_date) {
    return {label: '시행일', value: formatDate(source.effective_date)};
  }
  return null;
}

function versionStateLabel(value: string): string {
  return {
    current_as_of_review: '검토일 현재 적용',
    future_effective: '향후 시행',
    historical: '과거 적용법',
  }[value] ?? value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
