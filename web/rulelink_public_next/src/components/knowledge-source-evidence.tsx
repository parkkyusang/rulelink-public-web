import {browserOfficialSourceUrl} from '@/lib/official-source-url';
import type {LegalAnswerClaim} from '@/types/legal-answer-packet';
import type {PublicKnowledgeSource} from '@/types/publication';

import styles from './knowledge-source-evidence.module.css';

export function KnowledgeSourceEvidence({
  claims = [],
  sources,
}: {
  claims?: readonly LegalAnswerClaim[];
  sources: readonly PublicKnowledgeSource[];
}) {
  if (!sources.length) return null;
  return (
    <section
      aria-labelledby="source-evidence-heading"
      className={styles.root}
      data-source-evidence
    >
      <header>
        <p className="eyebrow">이 답의 공식 근거</p>
        <h2 id="source-evidence-heading">페이지 안에서 근거 좌표를 먼저 확인하세요.</h2>
        <p>
          출판본에 저장된 법령·판례·공식문서의 정확한 이름과 좌표만 표시합니다.
          원문 전체 링크는 카드의 마지막에 둡니다.
        </p>
      </header>
      <div className={styles.grid}>
        {sources.map((source, index) => {
          const sourceClaims = claims.filter(claim => (
            claim.authority_refs.some(reference => (
              reference.source_coordinate_id === source.coordinate_id
            ))
          ));
          const versionStates = unique(
            sourceClaims.flatMap(claim => claim.authority_refs
              .filter(reference => reference.source_coordinate_id === source.coordinate_id)
              .map(reference => reference.version.time_state)),
          );
          const officialUrl = browserOfficialSourceUrl(source) ?? source.official_url;
          return (
            <article
              className={styles.card}
              id={`source-${source.coordinate_id}`}
              key={source.coordinate_id}
            >
              <details open={index === 0}>
                <summary>
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
                    <div><dt>근거 좌표</dt><dd>{sourceLocator(source)}</dd></div>
                    <div><dt>출판 원문본</dt><dd>{source.source_snapshot_id}</dd></div>
                    {sourceDate(source) ? (
                      <div><dt>{sourceDate(source)!.label}</dt><dd>{sourceDate(source)!.value}</dd></div>
                    ) : null}
                    {versionStates.length ? (
                      <div>
                        <dt>패킷 검증 상태</dt>
                        <dd>{versionStates.map(versionStateLabel).join(' · ')}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {sourceClaims.length ? (
                    <section aria-label={`${sourceLabel(source)}가 뒷받침하는 내용`}>
                      <h3>이 근거가 뒷받침하는 내용</h3>
                      <ul>
                        {sourceClaims.map(claim => (
                          <li key={claim.claim_id}>{claim.statement_ko}</li>
                        ))}
                      </ul>
                    </section>
                  ) : (
                    <p className={styles.boundary}>
                      별도 답변 패킷이 없는 글이므로 이 출처가 특정 문장을
                      뒷받침한다고 새로 추론하지 않습니다.
                    </p>
                  )}
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

function sourceKindLabel(source: PublicKnowledgeSource): string {
  if (source.source_kind === 'precedent') return '판례';
  if (source.source_kind === 'official_document') return '공식문서';
  return '법령';
}

function sourceLabel(source: PublicKnowledgeSource): string {
  if (source.source_kind === 'precedent' || source.source_kind === 'official_document') {
    return source.title_ko;
  }
  return `${source.law_name_ko} ${source.article_no}`;
}

function sourceLocator(source: PublicKnowledgeSource): string {
  if (source.source_kind === 'precedent') return source.case_number;
  if (source.source_kind === 'official_document') return source.promulgation_number;
  return source.article_no;
}

function sourceDate(source: PublicKnowledgeSource): {label: string; value: string} | null {
  if (source.source_kind === 'precedent') {
    return {label: '선고일', value: formatDate(source.decision_date)};
  }
  if (source.source_kind === 'official_document') {
    return {label: '시행일', value: formatDate(source.effective_date)};
  }
  return null;
}

function versionStateLabel(value: string): string {
  return {
    current_as_of_review: '검토일 현재 적용',
    future_effective: '향후 시행',
    historical: '과거 적용본',
  }[value] ?? value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
