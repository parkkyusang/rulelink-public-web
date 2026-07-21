'use client';

import {useMemo, useState} from 'react';

import {knowledgeContentTypeLabel} from '@/lib/content-labels';

import type {PublicKnowledgeSearchDocument} from '@/lib/knowledge-search';

import type {PublicKnowledgeHub} from '@/types/publication';

import styles from './knowledge-explorer.module.css';

type Props = {
  documents: PublicKnowledgeSearchDocument[];
  hubs: PublicKnowledgeHub[];
};

export function KnowledgeExplorer({documents, hubs}: Props) {
  const [query, setQuery] = useState('');
  const [hubId, setHubId] = useState('all');
  const normalizedQuery = normalize(query);
  const visibleDocuments = useMemo(() => {
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    return documents
      .filter(document => {
        const entry = document.entry;
        if (hubId !== 'all' && !entry.hub_ids.includes(hubId)) return false;
        if (!queryTokens.length) return true;
        const searchText = normalize([
          knowledgeContentTypeLabel(entry.content_type),
          ...document.search_terms_ko,
        ].join(' '));
        return queryTokens.every(token => searchText.includes(token));
      })
      .sort((left, right) => right.entry.reviewed_at.localeCompare(left.entry.reviewed_at)
        || left.entry.title_ko.localeCompare(right.entry.title_ko, 'ko'));
  }, [documents, hubId, normalizedQuery]);

  return (
    <section aria-labelledby="knowledge-library-heading" className={styles.explorer}>
      <div className={styles.controls}>
        <label htmlFor="knowledge-search">내 상황이나 궁금한 내용을 적어보세요</label>
        <div className={styles.searchRow}>
          <span aria-hidden="true">⌕</span>
          <input
            id="knowledge-search"
            onChange={event => setQuery(event.target.value)}
            placeholder="예: 보증금 못 받고 이사, 민법 제1026조, 2013다73520"
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

      <p aria-live="polite" className={styles.resultCount}>확인할 수 있는 지식 {visibleDocuments.length}개</p>

      {visibleDocuments.length ? (
        <div className={styles.grid}>
          {visibleDocuments.map(document => {
            const entry = document.entry;
            return (
            <a className={styles.card} href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>
              <div className={styles.meta}>
                <span>{knowledgeContentTypeLabel(entry.content_type)}</span>
                <time dateTime={entry.reviewed_at}>기준 확인 {formatDate(entry.reviewed_at)}</time>
              </div>
              <h2>{entry.title_ko}</h2>
              <p>{entry.one_line_answer_ko}</p>
              <small>{entry.audience_situation_ko}</small>
              {document.evidence_labels_ko.length ? (
                <div aria-label="연결된 공식 근거" className={styles.evidence}>
                  <b>연결 근거</b>
                  {evidenceLabelsForDocument(document.evidence_labels_ko, normalizedQuery).map(label => <span key={label}>{label}</span>)}
                </div>
              ) : null}
              <strong>법리와 사실분기 보기 <span aria-hidden="true">→</span></strong>
            </a>
            );
          })}
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

function evidenceLabelsForDocument(labels: string[], normalizedQuery: string): string[] {
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const matched = labels.filter(label => tokens.some(token => normalize(label).includes(token)));
  return [...new Set([...matched, ...labels])].slice(0, 2);
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}

