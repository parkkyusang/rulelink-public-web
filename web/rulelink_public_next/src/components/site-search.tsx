'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {buildCollectionSearchHref, parseCollectionSearchState, sanitizeCollectionQuery} from '@/lib/collection-search-state';
import {
  DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE,
  initialProgressiveResultLimit,
  nextProgressiveResultLimit,
} from '@/lib/progressive-results';
import {
  rankSiteSearchDocuments,
  type SiteSearchDocument,
  type SiteSearchResultCounts,
  type SiteSearchResultFilter,
  type SiteSearchResultKind,
} from '@/lib/site-search-discovery';
import {decodeSiteSearchIndex} from '@/lib/site-search-index';

import styles from './site-search.module.css';
import {ProgressiveResultFooter} from './progressive-result-footer';

type Props = {
  freshnessNow: string;
  indexHref: '/search-index.json';
  initialDocuments: SiteSearchDocument[];
  totalCounts: SiteSearchResultCounts;
};

const RESULT_FILTERS = ['all', 'issue', 'knowledge', 'change'] as const satisfies readonly SiteSearchResultFilter[];

export function SiteSearch({
  freshnessNow,
  indexHref,
  initialDocuments,
  totalCounts,
}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SiteSearchResultFilter>('all');
  const [fullDocuments, setFullDocuments] = useState<SiteSearchDocument[] | null>(null);
  const [indexState, setIndexState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const indexPromise = useRef<Promise<SiteSearchDocument[]> | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(() => initialProgressiveResultLimit(
    totalCounts.all,
  ));

  const ensureFullIndex = useCallback((): Promise<SiteSearchDocument[]> => {
    if (indexPromise.current) return indexPromise.current;
    setIndexState('loading');
    indexPromise.current = fetch(indexHref, {
      cache: 'force-cache',
      headers: {'Accept': 'application/json'},
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`검색 인덱스 응답 실패: ${response.status}`);
        }
        const payload = decodeSiteSearchIndex(await response.json());
        if (!payload) {
          throw new Error('검색 인덱스 형식이 올바르지 않습니다.');
        }
        setFullDocuments(payload.documents);
        setIndexState('ready');
        return payload.documents;
      })
      .catch(error => {
        setIndexState('error');
        indexPromise.current = null;
        throw error;
      });
    return indexPromise.current;
  }, [indexHref]);

  useEffect(() => {
    const initial = parseCollectionSearchState({
      allowedFilters: RESULT_FILTERS,
      defaultFilter: 'all',
      filterParam: 'type',
      search: window.location.search,
    });
    setQuery(initial.query);
    setFilter(initial.filter);
    setVisibleLimit(DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE);
    if (initial.query || initial.filter !== 'all') {
      void ensureFullIndex().catch(() => undefined);
    }
  }, [ensureFullIndex]);

  function updateQuery(value: string) {
    const nextQuery = sanitizeCollectionQuery(value);
    setQuery(nextQuery);
    setVisibleLimit(DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE);
    replaceSearchUrl(nextQuery, filter);
    void ensureFullIndex().catch(() => undefined);
  }

  function updateFilter(nextFilter: SiteSearchResultFilter) {
    setFilter(nextFilter);
    setVisibleLimit(DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE);
    replaceSearchUrl(query, nextFilter);
    void ensureFullIndex().catch(() => undefined);
  }

  const documents = fullDocuments ?? initialDocuments;
  const visibleResults = useMemo(
    () => rankSiteSearchDocuments(documents, {
      filter,
      now: new Date(freshnessNow),
      query,
    }),
    [documents, filter, freshnessNow, query],
  );
  const displayedResults = visibleResults.slice(0, visibleLimit);
  const hasQuery = query.trim().length > 0;
  const isQueryIndexPending = hasQuery
    && !fullDocuments
    && (indexState === 'idle' || indexState === 'loading');
  const totalResultCount = fullDocuments
    ? visibleResults.length
    : hasQuery
      ? visibleResults.length
      : totalCounts[filter];
  const hiddenResultCount = Math.max(
    0,
    totalResultCount - displayedResults.length,
  );

  return (
    <section
      aria-labelledby="site-search-heading"
      className={styles.search}
      data-search-index-state={indexState}
      data-site-search
    >
      <div className={styles.searchBox}>
        <label htmlFor="site-search">상황, 법 이름, 조문이나 사건번호를 적어보세요</label>
        <div className={styles.searchInput}>
          <span aria-hidden="true">⌕</span>
          <input
            autoComplete="off"
            id="site-search"
            onFocus={() => {
              void ensureFullIndex().catch(() => undefined);
            }}
            onChange={event => updateQuery(event.target.value)}
            placeholder="예: 보증금 반환, 민법 제1026조, 2013다73520"
            type="search"
            value={query}
          />
        </div>
        <p>공개 승인을 마친 법률정보 안에서만 찾습니다.</p>
      </div>

      <div aria-label="법률정보 종류" className={styles.filters} role="group">
        <FilterButton active={filter === 'all'} count={totalCounts.all} label="전체" onClick={() => updateFilter('all')} />
        <FilterButton active={filter === 'issue'} count={totalCounts.issue} label="상황별 안내" onClick={() => updateFilter('issue')} />
        <FilterButton active={filter === 'knowledge'} count={totalCounts.knowledge} label="연결 지식" onClick={() => updateFilter('knowledge')} />
        <FilterButton active={filter === 'change'} count={totalCounts.change} label="법령 변화" onClick={() => updateFilter('change')} />
      </div>

      <p aria-live="polite" className={styles.resultCount}>
        {isQueryIndexPending
          ? '전체 검색 인덱스를 불러오는 중입니다.'
          : indexState === 'error'
            ? `검색 인덱스를 불러오지 못해 먼저 표시된 ${displayedResults.length}개 안에서 찾았습니다.`
            : `찾은 법률정보 ${totalResultCount}개`}
        {hiddenResultCount > 0 ? <span> · {displayedResults.length}개 표시 중</span> : null}
      </p>

      {visibleResults.length ? (
        <>
          <div className={styles.results} id="site-search-result-grid">
            {displayedResults.map(result => (
              <a
                className={styles.result}
                data-search-result-id={result.id}
                data-search-result-kind={result.kind}
                href={result.decisionScenarioId
                  ? `${result.href}#scenario-${result.decisionScenarioId}`
                  : result.href}
                key={`${result.kind}-${result.id}`}
              >
                <div className={styles.resultMeta}>
                  <span className={styles[result.kind]}>{kindLabel(result.kind)}</span>
                  <span
                    aria-label={freshnessLabel(result.freshnessState)}
                    className={styles.freshness}
                    data-freshness-state={result.freshnessState}
                  >
                    {freshnessLabel(result.freshnessState)}
                  </span>
                </div>
                <h2>{result.title}</h2>
                <p>{result.summary}</p>
                <small>{result.context}</small>
                {result.kind === 'knowledge' && result.decisionQuestion ? (
                  <div className={styles.decisionQuestion} data-decision-question>
                    <b>결론을 가르는 질문</b>
                    <p>{result.decisionQuestion}</p>
                  </div>
                ) : null}
                <div aria-label="정보 현재성" className={styles.reviewDates}>
                  <time dateTime={result.reviewedAt}>
                    기준 확인 {formatDate(result.reviewedAt)}
                  </time>
                  <time dateTime={result.expiresAt}>
                    다음 점검 {formatDate(result.expiresAt)}
                  </time>
                </div>
                {result.matchReasons.length ? (
                  <div
                    aria-label="검색 결과가 맞는 이유"
                    className={styles.matchReasons}
                    data-match-reasons
                  >
                    <b>왜 이 결과인가</b>
                    <ul>
                      {result.matchReasons.map(reason => (
                        <li key={`${reason.field}:${reason.text_ko}`}>
                          <span>{reason.label_ko}</span>
                          <p>{reason.text_ko}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.evidenceLabels.length ? (
                  <div aria-label="연결된 공식 근거" className={styles.evidence}>
                    <b>연결 근거</b>
                    {result.evidenceLabels.slice(0, 3).map(label => <span key={label}>{label}</span>)}
                  </div>
                ) : null}
                <strong>내용 확인하기 <span aria-hidden="true">→</span></strong>
              </a>
            ))}
          </div>
          <ProgressiveResultFooter
            controlsId="site-search-result-grid"
            description="검색어와 유형 필터는 아직 펼치지 않은 법률정보에도 똑같이 적용됩니다."
            hiddenCount={hiddenResultCount}
            label="검색 결과 더 보기"
            onLoadMore={() => {
              void ensureFullIndex()
                .then(allDocuments => {
                  const total = rankSiteSearchDocuments(allDocuments, {
                    filter,
                    now: new Date(freshnessNow),
                    query,
                  }).length;
                  setVisibleLimit(current => (
                    nextProgressiveResultLimit(total, current)
                  ));
                })
                .catch(() => undefined);
            }}
          />
        </>
      ) : isQueryIndexPending ? null : (
        <div className={styles.empty} data-search-empty>
          <strong>조건에 맞는 법률정보를 찾지 못했습니다.</strong>
          <p>검색어를 더 짧게 바꾸거나 전체 유형에서 다시 확인해 주세요.</p>
        </div>
      )}
    </section>
  );
}

function FilterButton({active, count, label, onClick}: {active: boolean; count: number; label: string; onClick: () => void}) {
  return (
    <button aria-pressed={active} className={active ? styles.active : ''} onClick={onClick} type="button">
      {label}<span>{count}</span>
    </button>
  );
}


function replaceSearchUrl(query: string, filter: SiteSearchResultFilter) {
  window.history.replaceState(null, '', buildCollectionSearchHref({
    defaultFilter: 'all',
    filter,
    filterParam: 'type',
    hash: window.location.hash,
    pathname: window.location.pathname,
    query,
  }));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}

function kindLabel(kind: SiteSearchResultKind): string {
  return {issue: '상황별 안내', knowledge: '연결 지식', change: '법령 변화'}[kind];
}

function freshnessLabel(state: 'current' | 'review_due'): string {
  return state === 'current' ? '현재 공개 기준' : '재검토 시점 경과';
}
