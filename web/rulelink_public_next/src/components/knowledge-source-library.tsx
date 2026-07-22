'use client';

import {useEffect, useMemo, useState} from 'react';

import {buildCollectionSearchHref, parseCollectionSearchState, sanitizeCollectionQuery} from '@/lib/collection-search-state';
import {knowledgeContentTypeLabel} from '@/lib/content-labels';
import type {PublicKnowledgeSourceDocument} from '@/lib/knowledge-search';
import {
  filterAndRankKnowledgeSourceDocuments,
  knowledgeSourceKind,
  normalizeKnowledgeSourceSearchText,
  type KnowledgeSourceFilter,
} from '@/lib/knowledge-source-ranking';
import {browserOfficialSourceUrl} from '@/lib/official-source-url';
import {
  DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE,
  initialProgressiveResultLimit,
  nextProgressiveResultLimit,
} from '@/lib/progressive-results';

import styles from './knowledge-source-library.module.css';
import {ProgressiveResultFooter} from './progressive-result-footer';

const SOURCE_FILTERS = ['all', 'statute', 'precedent', 'official_document'] as const satisfies readonly KnowledgeSourceFilter[];

export function KnowledgeSourceLibrary({documents}: {documents: PublicKnowledgeSourceDocument[]}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<KnowledgeSourceFilter>('all');
  const [visibleLimit, setVisibleLimit] = useState(() => initialProgressiveResultLimit(documents.length));

  useEffect(() => {
    const initial = parseCollectionSearchState({
      allowedFilters: SOURCE_FILTERS,
      defaultFilter: 'all',
      filterParam: 'type',
      search: window.location.search,
    });
    setQuery(initial.query);
    setFilter(initial.filter);
    setVisibleLimit(DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE);
  }, []);

  function updateQuery(value: string) {
    const nextQuery = sanitizeCollectionQuery(value);
    setQuery(nextQuery);
    setVisibleLimit(DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE);
    replaceSourceUrl(nextQuery, filter);
  }

  function updateFilter(nextFilter: KnowledgeSourceFilter) {
    setFilter(nextFilter);
    setVisibleLimit(DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE);
    replaceSourceUrl(query, nextFilter);
  }

  const normalizedQuery = normalizeKnowledgeSourceSearchText(query);
  const counts = useMemo(() => ({
    all: documents.length,
    statute: documents.filter(document => knowledgeSourceKind(document) === 'statute').length,
    precedent: documents.filter(document => knowledgeSourceKind(document) === 'precedent').length,
    official_document: documents.filter(document => knowledgeSourceKind(document) === 'official_document').length,
  }), [documents]);
  const visibleDocuments = useMemo(() => {
    return filterAndRankKnowledgeSourceDocuments(documents, {filter, query: normalizedQuery});
  }, [documents, filter, normalizedQuery]);
  const displayedDocuments = visibleDocuments.slice(0, visibleLimit);
  const hiddenResultCount = visibleDocuments.length - displayedDocuments.length;

  return (
    <section aria-labelledby="knowledge-source-library-heading" className={styles.library}>
      <div className={styles.controls}>
        <label htmlFor="knowledge-source-search">법 이름, 조문이나 판례 사건번호를 적어보세요</label>
        <div className={styles.searchRow}>
          <span aria-hidden="true">⌕</span>
          <input
            id="knowledge-source-search"
            onChange={event => updateQuery(event.target.value)}
            placeholder="예: 민법 제1026조, 2013다73520, 임차권등기"
            type="search"
            value={query}
          />
        </div>
      </div>

      <div aria-label="공식 근거 종류" className={styles.filters} role="group">
        <FilterButton active={filter === 'all'} count={counts.all} label="전체" onClick={() => updateFilter('all')} />
        <FilterButton active={filter === 'statute'} count={counts.statute} label="법령 조문" onClick={() => updateFilter('statute')} />
        <FilterButton active={filter === 'precedent'} count={counts.precedent} label="판례" onClick={() => updateFilter('precedent')} />
        <FilterButton active={filter === 'official_document'} count={counts.official_document} label="개정·시행 문서" onClick={() => updateFilter('official_document')} />
      </div>

      <p aria-live="polite" className={styles.resultCount}>
        확인할 수 있는 공식 근거 {visibleDocuments.length}개
        {hiddenResultCount > 0 ? <span> · {displayedDocuments.length}개 표시 중</span> : null}
      </p>

      {visibleDocuments.length ? (
        <>
          <div className={styles.grid} id="knowledge-source-result-grid">
            {displayedDocuments.map(document => {
              const source = document.source;
              const officialUrl = browserOfficialSourceUrl(source) ?? source.official_url;
              const visibleConcepts = document.concepts.slice(0, 2);
              const visibleEntries = document.entries.slice(0, Math.max(0, 4 - visibleConcepts.length));
              const totalLinks = document.concepts.length + document.entries.length;
              const remainingLinks = totalLinks - visibleConcepts.length - visibleEntries.length;
              return (
                <article className={styles.card} key={source.coordinate_id}>
                <div className={styles.meta}>
                  <span className={knowledgeSourceKind(document) === 'precedent' ? styles.precedent : styles.statute}>
                    {knowledgeSourceKind(document) === 'precedent'
                      ? '판례'
                      : knowledgeSourceKind(document) === 'official_document'
                        ? '개정·시행 문서'
                        : '법령 조문'}
                  </span>
                  <time dateTime={source.last_verified_at}>원문 확인 {formatDate(source.last_verified_at)}</time>
                </div>
                <h2>{document.label_ko}</h2>
                {source.source_kind === 'precedent' ? (
                  <p>사건번호 {source.case_number} · 선고일 {formatDate(source.decision_date)}</p>
                ) : source.source_kind === 'official_document' ? (
                  <p>{source.promulgation_number} · 시행 {formatDate(source.effective_date)}</p>
                ) : (
                  <p>{source.law_name_ko} {source.article_no}</p>
                )}
                <a className={styles.official} href={officialUrl} rel="noreferrer" target="_blank">
                  국가법령정보센터 원문 <span aria-hidden="true">↗</span>
                </a>
                <div className={styles.related}>
                  <b>이 근거를 사용하는 연결 지식 {totalLinks}개</b>
                  {visibleConcepts.map(concept => (
                    <a href={`/ko/concepts/${concept.slug}`} key={concept.concept_id}>
                      <span>{concept.preferred_term_ko}</span>
                      <small>법률개념</small>
                    </a>
                  ))}
                  {visibleEntries.map(entry => (
                    <a href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>
                      <span>{entry.title_ko}</span>
                      <small>{knowledgeContentTypeLabel(entry.content_type)}</small>
                    </a>
                  ))}
                  {remainingLinks > 0 ? <em>그 밖의 연결 지식 {remainingLinks}개</em> : null}
                </div>
                </article>
              );
            })}
          </div>
          <ProgressiveResultFooter
            controlsId="knowledge-source-result-grid"
            description="법 이름·조문·사건번호 검색은 아직 펼치지 않은 공식 근거에도 똑같이 적용됩니다."
            hiddenCount={hiddenResultCount}
            label="공식 근거 더 보기"
            onLoadMore={() => setVisibleLimit(current => nextProgressiveResultLimit(visibleDocuments.length, current))}
          />
        </>
      ) : (
        <div className={styles.empty}>
          <strong>조건에 맞는 공식 근거를 찾지 못했습니다.</strong>
          <p>법 이름이나 사건번호를 짧게 입력하거나 전체 유형에서 다시 확인해 주세요.</p>
        </div>
      )}
    </section>
  );
}

function replaceSourceUrl(query: string, filter: KnowledgeSourceFilter) {
  window.history.replaceState(null, '', buildCollectionSearchHref({
    defaultFilter: 'all',
    filter,
    filterParam: 'type',
    hash: window.location.hash,
    pathname: window.location.pathname,
    query,
  }));
}

function FilterButton({active, count, label, onClick}: {active: boolean; count: number; label: string; onClick: () => void}) {
  return (
    <button aria-pressed={active} className={active ? styles.active : ''} onClick={onClick} type="button">
      {label}<span>{count}</span>
    </button>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
