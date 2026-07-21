'use client';

import {useEffect, useMemo, useState} from 'react';

import {buildCollectionSearchHref, parseCollectionSearchState, sanitizeCollectionQuery} from '@/lib/collection-search-state';
import {knowledgeContentTypeLabel} from '@/lib/content-labels';
import type {PublicKnowledgeSourceDocument} from '@/lib/knowledge-search';
import {browserOfficialSourceUrl} from '@/lib/official-source-url';

import styles from './knowledge-source-library.module.css';

type SourceFilter = 'all' | 'statute' | 'precedent' | 'official_document';

const SOURCE_FILTERS = ['all', 'statute', 'precedent', 'official_document'] as const satisfies readonly SourceFilter[];

export function KnowledgeSourceLibrary({documents}: {documents: PublicKnowledgeSourceDocument[]}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    const initial = parseCollectionSearchState({
      allowedFilters: SOURCE_FILTERS,
      defaultFilter: 'all',
      filterParam: 'type',
      search: window.location.search,
    });
    setQuery(initial.query);
    setFilter(initial.filter);
  }, []);

  function updateQuery(value: string) {
    const nextQuery = sanitizeCollectionQuery(value);
    setQuery(nextQuery);
    replaceSourceUrl(nextQuery, filter);
  }

  function updateFilter(nextFilter: SourceFilter) {
    setFilter(nextFilter);
    replaceSourceUrl(query, nextFilter);
  }

  const normalizedQuery = normalize(query);
  const counts = useMemo(() => ({
    all: documents.length,
    statute: documents.filter(document => sourceKind(document) === 'statute').length,
    precedent: documents.filter(document => sourceKind(document) === 'precedent').length,
    official_document: documents.filter(document => sourceKind(document) === 'official_document').length,
  }), [documents]);
  const visibleDocuments = useMemo(() => {
    const tokens = normalizedQuery.split(' ').filter(Boolean);
    return documents
      .filter(document => filter === 'all' || sourceKind(document) === filter)
      .filter(document => {
        if (!tokens.length) return true;
        const searchText = normalize([document.label_ko, ...document.search_terms_ko].join(' '));
        return tokens.every(token => searchText.includes(token));
      })
      .sort((left, right) => {
        const leftKind = sourceKind(left);
        const rightKind = sourceKind(right);
        if (leftKind !== rightKind) {
          const order = {precedent: 0, official_document: 1, statute: 2};
          return order[leftKind] - order[rightKind];
        }
        return right.entries.length - left.entries.length || left.label_ko.localeCompare(right.label_ko, 'ko');
      });
  }, [documents, filter, normalizedQuery]);

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

      <p aria-live="polite" className={styles.resultCount}>확인할 수 있는 공식 근거 {visibleDocuments.length}개</p>

      {visibleDocuments.length ? (
        <div className={styles.grid}>
          {visibleDocuments.map(document => {
            const source = document.source;
            const officialUrl = browserOfficialSourceUrl(source) ?? source.official_url;
            return (
              <article className={styles.card} key={source.coordinate_id}>
                <div className={styles.meta}>
                  <span className={sourceKind(document) === 'precedent' ? styles.precedent : styles.statute}>
                    {sourceKind(document) === 'precedent'
                      ? '판례'
                      : sourceKind(document) === 'official_document'
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
                  <b>이 근거를 사용하는 안내 {document.entries.length}개</b>
                  {document.entries.slice(0, 4).map(entry => (
                    <a href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>
                      <span>{entry.title_ko}</span>
                      <small>{knowledgeContentTypeLabel(entry.content_type)}</small>
                    </a>
                  ))}
                  {document.entries.length > 4 ? <em>그 밖의 연결 안내 {document.entries.length - 4}개</em> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>조건에 맞는 공식 근거를 찾지 못했습니다.</strong>
          <p>법 이름이나 사건번호를 짧게 입력하거나 전체 유형에서 다시 확인해 주세요.</p>
        </div>
      )}
    </section>
  );
}

function replaceSourceUrl(query: string, filter: SourceFilter) {
  window.history.replaceState(null, '', buildCollectionSearchHref({
    defaultFilter: 'all',
    filter,
    filterParam: 'type',
    hash: window.location.hash,
    pathname: window.location.pathname,
    query,
  }));
}

function sourceKind(document: PublicKnowledgeSourceDocument): Exclude<SourceFilter, 'all'> {
  const kind = document.source.source_kind;
  return kind === 'precedent' || kind === 'official_document' ? kind : 'statute';
}

function FilterButton({active, count, label, onClick}: {active: boolean; count: number; label: string; onClick: () => void}) {
  return (
    <button aria-pressed={active} className={active ? styles.active : ''} onClick={onClick} type="button">
      {label}<span>{count}</span>
    </button>
  );
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
