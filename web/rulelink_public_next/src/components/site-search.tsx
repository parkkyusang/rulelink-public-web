'use client';

import {useEffect, useMemo, useState} from 'react';

import {buildCollectionSearchHref, parseCollectionSearchState, sanitizeCollectionQuery} from '@/lib/collection-search-state';
import {knowledgeContentTypeLabel} from '@/lib/content-labels';

import type {PublicKnowledgeSearchDocument} from '@/lib/knowledge-search';

import type {LegalChangeBrief, LegalIssueCard, PublicTopic} from '@/types/publication';

import styles from './site-search.module.css';

type Props = {
  cards: LegalIssueCard[];
  changeBriefs: LegalChangeBrief[];
  knowledgeDocuments: PublicKnowledgeSearchDocument[];
  topics: PublicTopic[];
};

type ResultKind = 'issue' | 'knowledge' | 'change';
type ResultFilter = 'all' | ResultKind;

const RESULT_FILTERS = ['all', 'issue', 'knowledge', 'change'] as const satisfies readonly ResultFilter[];

type SearchResult = {
  id: string;
  kind: ResultKind;
  title: string;
  summary: string;
  context: string;
  href: string;
  reviewedAt: string;
  searchText: string;
  evidenceLabels?: string[];
};

export function SiteSearch({cards, changeBriefs, knowledgeDocuments, topics}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ResultFilter>('all');

  useEffect(() => {
    const initial = parseCollectionSearchState({
      allowedFilters: RESULT_FILTERS,
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
    replaceSearchUrl(nextQuery, filter);
  }

  function updateFilter(nextFilter: ResultFilter) {
    setFilter(nextFilter);
    replaceSearchUrl(query, nextFilter);
  }

  const results = useMemo(
    () => buildResults(cards, changeBriefs, knowledgeDocuments, topics),
    [cards, changeBriefs, knowledgeDocuments, topics],
  );
  const counts = useMemo(() => ({
    all: results.length,
    issue: results.filter(result => result.kind === 'issue').length,
    knowledge: results.filter(result => result.kind === 'knowledge').length,
    change: results.filter(result => result.kind === 'change').length,
  }), [results]);
  const normalizedQuery = normalize(query);
  const visibleResults = useMemo(() => {
    const tokens = normalizedQuery.split(' ').filter(Boolean);
    return results.filter(result => {
      if (filter !== 'all' && result.kind !== filter) return false;
      return !tokens.length || tokens.every(token => result.searchText.includes(token));
    });
  }, [filter, normalizedQuery, results]);

  return (
    <section aria-labelledby="site-search-heading" className={styles.search}>
      <div className={styles.searchBox}>
        <label htmlFor="site-search">상황, 법 이름, 조문이나 사건번호를 적어보세요</label>
        <div className={styles.searchInput}>
          <span aria-hidden="true">⌕</span>
          <input
            autoComplete="off"
            id="site-search"
            onChange={event => updateQuery(event.target.value)}
            placeholder="예: 보증금 반환, 민법 제1026조, 2013다73520"
            type="search"
            value={query}
          />
        </div>
        <p>공개 승인을 마친 법률정보 안에서만 찾습니다.</p>
      </div>

      <div aria-label="법률정보 종류" className={styles.filters} role="group">
        <FilterButton active={filter === 'all'} count={counts.all} label="전체" onClick={() => updateFilter('all')} />
        <FilterButton active={filter === 'issue'} count={counts.issue} label="상황별 안내" onClick={() => updateFilter('issue')} />
        <FilterButton active={filter === 'knowledge'} count={counts.knowledge} label="연결 지식" onClick={() => updateFilter('knowledge')} />
        <FilterButton active={filter === 'change'} count={counts.change} label="법령 변화" onClick={() => updateFilter('change')} />
      </div>

      <p aria-live="polite" className={styles.resultCount}>찾은 법률정보 {visibleResults.length}개</p>

      {visibleResults.length ? (
        <div className={styles.results}>
          {visibleResults.map(result => (
            <a className={styles.result} href={result.href} key={`${result.kind}-${result.id}`}>
              <div className={styles.resultMeta}>
                <span className={styles[result.kind]}>{kindLabel(result.kind)}</span>
                <time dateTime={result.reviewedAt}>기준 확인 {formatDate(result.reviewedAt)}</time>
              </div>
              <h2>{result.title}</h2>
              <p>{result.summary}</p>
              <small>{result.context}</small>
              {result.evidenceLabels?.length ? (
                <div aria-label="연결된 공식 근거" className={styles.evidence}>
                  <b>연결 근거</b>
                  {evidenceLabelsForResult(result.evidenceLabels, normalizedQuery).map(label => <span key={label}>{label}</span>)}
                </div>
              ) : null}
              <strong>내용 확인하기 <span aria-hidden="true">→</span></strong>
            </a>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>조건에 맞는 법률정보를 찾지 못했습니다.</strong>
          <p>검색어를 더 짧게 바꾸거나 전체 유형에서 다시 확인해 주세요.</p>
        </div>
      )}
    </section>
  );
}

function buildResults(
  cards: LegalIssueCard[],
  changeBriefs: LegalChangeBrief[],
  knowledgeDocuments: PublicKnowledgeSearchDocument[],
  topics: PublicTopic[],
): SearchResult[] {
  const topicByCardId = new Map<string, PublicTopic[]>();
  for (const topic of topics) {
    for (const cardId of topic.issue_card_ids) {
      topicByCardId.set(cardId, [...(topicByCardId.get(cardId) ?? []), topic]);
    }
  }
  return [
    ...changeBriefs.map(brief => makeResult({
      id: brief.change_brief_id,
      kind: 'change',
      title: brief.title_ko,
      summary: brief.summary_ko,
      context: `${brief.lifecycle === 'future_effective' ? '시행 예정' : '최근 시행'} · ${brief.law_name_ko} ${brief.article_no}`,
      href: `/ko/changes/${brief.slug}`,
      reviewedAt: brief.reviewed_at,
      terms: [
        brief.law_name_ko,
        brief.article_no,
        ...brief.affected_audiences,
        ...brief.changed_points,
        ...brief.action_checklist,
      ],
    })),
    ...knowledgeDocuments.map(document => {
      const entry = document.entry;
      return makeResult({
      id: entry.content_id,
      kind: 'knowledge',
      title: entry.title_ko,
      summary: entry.one_line_answer_ko,
      context: `${knowledgeContentTypeLabel(entry.content_type)} · ${entry.audience_situation_ko}`,
      href: `/ko/knowledge/${entry.slug}`,
      reviewedAt: entry.reviewed_at,
      terms: [
        entry.audience_situation_ko,
        knowledgeContentTypeLabel(entry.content_type),
        ...entry.search_intents_ko,
        ...entry.key_points_ko,
        ...entry.facts_to_check_ko,
        ...document.search_terms_ko,
      ],
      evidenceLabels: document.evidence_labels_ko,
    });
    }),
    ...cards.map(card => {
      const cardTopics = topicByCardId.get(card.issue_card_id) ?? [];
      return makeResult({
        id: card.issue_card_id,
        kind: 'issue',
        title: card.title_ko,
        summary: card.audience_situation_ko,
        context: cardTopics.map(topic => topic.title_ko).join(' · ') || '생활법률',
        href: `/ko/issues/${card.slug}`,
        reviewedAt: card.reviewed_at,
        terms: [
          ...card.entry_signals,
          ...card.urgency_signals,
          ...card.branch_questions,
          ...cardTopics.flatMap(topic => [topic.title_ko, ...topic.search_terms_ko]),
        ],
      });
    }),
  ];
}

function makeResult(value: Omit<SearchResult, 'searchText'> & {terms: string[]}): SearchResult {
  const {terms, ...result} = value;
  return {
    ...result,
    searchText: normalize([result.title, result.summary, result.context, ...terms].join(' ')),
  };
}

function evidenceLabelsForResult(labels: string[], normalizedQuery: string): string[] {
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const matched = labels.filter(label => tokens.some(token => normalize(label).includes(token)));
  return [...new Set([...matched, ...labels])].slice(0, 3);
}

function FilterButton({active, count, label, onClick}: {active: boolean; count: number; label: string; onClick: () => void}) {
  return (
    <button aria-pressed={active} className={active ? styles.active : ''} onClick={onClick} type="button">
      {label}<span>{count}</span>
    </button>
  );
}


function replaceSearchUrl(query: string, filter: ResultFilter) {
  window.history.replaceState(null, '', buildCollectionSearchHref({
    defaultFilter: 'all',
    filter,
    filterParam: 'type',
    hash: window.location.hash,
    pathname: window.location.pathname,
    query,
  }));
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}

function kindLabel(kind: ResultKind): string {
  return {issue: '상황별 안내', knowledge: '연결 지식', change: '법령 변화'}[kind];
}

