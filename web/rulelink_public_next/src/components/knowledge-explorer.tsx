'use client';

import {useMemo, useState} from 'react';

import type {PublicKnowledgeEntry, PublicKnowledgeHub} from '@/types/publication';

import styles from './knowledge-explorer.module.css';

type Props = {
  entries: PublicKnowledgeEntry[];
  hubs: PublicKnowledgeHub[];
};

export function KnowledgeExplorer({entries, hubs}: Props) {
  const [query, setQuery] = useState('');
  const [hubId, setHubId] = useState('all');
  const normalizedQuery = normalize(query);
  const visibleEntries = useMemo(() => {
    const hubById = new Map(hubs.map(hub => [hub.hub_id, hub]));
    return entries
      .filter(entry => {
        if (hubId !== 'all' && !entry.hub_ids.includes(hubId)) return false;
        if (!normalizedQuery) return true;
        const hubTerms = entry.hub_ids
          .map(entryHubId => hubById.get(entryHubId))
          .filter((hub): hub is PublicKnowledgeHub => Boolean(hub))
          .flatMap(hub => [hub.title_ko, hub.description_ko]);
        const searchText = normalize([
          entry.title_ko,
          entry.one_line_answer_ko,
          entry.audience_situation_ko,
          contentTypeLabel(entry.content_type),
          ...hubTerms,
        ].join(' '));
        return searchText.includes(normalizedQuery);
      })
      .sort((left, right) => right.reviewed_at.localeCompare(left.reviewed_at) || left.title_ko.localeCompare(right.title_ko, 'ko'));
  }, [entries, hubId, hubs, normalizedQuery]);

  return (
    <section aria-labelledby="knowledge-library-heading" className={styles.explorer}>
      <div className={styles.controls}>
        <label htmlFor="knowledge-search">내 상황이나 궁금한 내용을 적어보세요</label>
        <div className={styles.searchRow}>
          <span aria-hidden="true">⌕</span>
          <input
            id="knowledge-search"
            onChange={event => setQuery(event.target.value)}
            placeholder="예: 보증금 못 받고 이사, 처분 통지를 받음"
            type="search"
            value={query}
          />
        </div>
      </div>

      {hubs.length ? (
        <div aria-label="지식 주제" className={styles.filters} role="group">
          <button aria-pressed={hubId === 'all'} className={hubId === 'all' ? styles.active : ''} onClick={() => setHubId('all')} type="button">전체</button>
          {hubs.map(hub => (
            <button
              aria-pressed={hubId === hub.hub_id}
              className={hubId === hub.hub_id ? styles.active : ''}
              key={hub.hub_id}
              onClick={() => setHubId(hub.hub_id)}
              type="button"
            >
              {hub.title_ko}
            </button>
          ))}
        </div>
      ) : null}

      <p aria-live="polite" className={styles.resultCount}>확인할 수 있는 지식 {visibleEntries.length}개</p>

      {visibleEntries.length ? (
        <div className={styles.grid}>
          {visibleEntries.map(entry => (
            <a className={styles.card} href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>
              <div className={styles.meta}>
                <span>{contentTypeLabel(entry.content_type)}</span>
                <time dateTime={entry.reviewed_at}>기준 확인 {formatDate(entry.reviewed_at)}</time>
              </div>
              <h2>{entry.title_ko}</h2>
              <p>{entry.one_line_answer_ko}</p>
              <small>{entry.audience_situation_ko}</small>
              <strong>법리와 사실분기 보기 <span aria-hidden="true">→</span></strong>
            </a>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>맞는 지식을 찾지 못했습니다.</strong>
          <p>더 짧은 상황 표현으로 검색하거나 전체 주제에서 다시 확인해 주세요.</p>
        </div>
      )}
    </section>
  );
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}

function contentTypeLabel(type: PublicKnowledgeEntry['content_type']): string {
  const labels: Record<PublicKnowledgeEntry['content_type'], string> = {
    law_change: '법령 변경',
    doctrine_explainer: '법리 해설',
    fact_branch: '사실 분기',
    precedent_doctrine: '판례 법리',
    similar_case_comparison: '유사사례 비교',
    misconception_correction: '오해 바로잡기',
    procedure_evidence: '절차와 증거',
    recurring_issue_generalization: '반복 쟁점',
  };
  return labels[type];
}
