'use client';

import {useEffect, useMemo, useState} from 'react';

import {
  DEFAULT_CORE_KNOWLEDGE_HUB_COUNT,
  normalizeKnowledgeHubQuery,
  selectVisibleKnowledgeHubs,
} from '@/lib/knowledge-hub-directory';

import type {PublicKnowledgeHub} from '@/types/publication';

import styles from './knowledge-hub-directory.module.css';

type HubSummary = Pick<PublicKnowledgeHub, 'content_ids' | 'hub_id' | 'slug' | 'title_ko' | 'description_ko'>;

export function KnowledgeHubDirectory({hubs}: {hubs: HubSummary[]}) {
  const [enhanced, setEnhanced] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = normalizeKnowledgeHubQuery(query);
  const visibleHubs = useMemo(() => selectVisibleKnowledgeHubs(hubs, {
    expanded,
    query,
  }), [expanded, hubs, query]);
  const visibleHubIds = useMemo(() => new Set(visibleHubs.map(hub => hub.hub_id)), [visibleHubs]);
  const coreCount = Math.min(DEFAULT_CORE_KNOWLEDGE_HUB_COUNT, hubs.length);
  const hiddenCoreCount = hubs.length - coreCount;

  useEffect(() => setEnhanced(true), []);

  if (!hubs.length) return null;

  return (
    <section
      aria-labelledby="knowledge-hub-heading"
      className={styles.directory}
      data-enhanced={enhanced}
    >
      <div className={styles.heading}>
        <div>
          <h3 id="knowledge-hub-heading">주제별로 찾아보기</h3>
          <p>자주 찾는 생활법률 주제를 먼저 보고, 필요하면 전체에서 바로 검색하세요.</p>
        </div>
        <span>{hubs.length}개 주제</span>
      </div>

      {enhanced ? (
        <div className={styles.controls}>
          <label htmlFor="knowledge-hub-search">주제 검색·필터</label>
          <div className={styles.searchRow}>
            <span aria-hidden="true">⌕</span>
            <input
              aria-describedby="knowledge-hub-search-hint"
              id="knowledge-hub-search"
              onChange={event => setQuery(event.target.value)}
              placeholder="예: 상속, 보증금, 손해배상"
              type="search"
              value={query}
            />
            {query ? (
              <button aria-label="주제 검색어 지우기" onClick={() => setQuery('')} type="button">지우기</button>
            ) : null}
          </div>
          <p id="knowledge-hub-search-hint">제목과 설명에서 찾으며, 접힌 주제도 검색에 포함됩니다.</p>
        </div>
      ) : null}

      {enhanced ? (
        <p aria-atomic="true" aria-live="polite" className={styles.resultCount}>
          {normalizedQuery
            ? `검색 결과 ${visibleHubs.length}개 · 전체 ${hubs.length}개`
            : expanded
              ? `전체 주제 ${hubs.length}개 표시`
              : `핵심 주제 ${coreCount}개 표시 · 전체 ${hubs.length}개`}
        </p>
      ) : null}

      <nav aria-label="주제별 생활법률 지식" className={styles.grid} id="knowledge-hub-grid">
        {hubs.map((hub, index) => (
          <a
            className={styles.card}
            data-core-topic={index < coreCount}
            hidden={enhanced && !visibleHubIds.has(hub.hub_id)}
            href={`/ko/hubs/${hub.slug}`}
            key={hub.hub_id}
          >
            <span className={styles.meta}>
              <b>주제 허브</b>
              <small>{hub.content_ids.length}개 안내</small>
            </span>
            <strong className={styles.title}>{hub.title_ko}</strong>
            <p className={styles.description}>{hub.description_ko}</p>
          </a>
        ))}
      </nav>

      {enhanced && normalizedQuery && !visibleHubs.length ? (
        <div className={styles.empty}>
          <strong>맞는 주제를 찾지 못했습니다.</strong>
          <p>검색어를 더 짧게 입력하거나 지운 뒤 전체 주제를 확인해 주세요.</p>
        </div>
      ) : null}

      {enhanced && !normalizedQuery && hiddenCoreCount > 0 ? (
        <div className={styles.actions}>
          <button
            aria-controls="knowledge-hub-grid"
            aria-expanded={expanded}
            onClick={() => setExpanded(current => !current)}
            type="button"
          >
            {expanded ? '핵심 주제만 보기' : `전체 주제 보기 (${hiddenCoreCount}개 더)`}
          </button>
          <p>{expanded ? '핵심 주제로 접어도 모든 링크는 검색할 수 있습니다.' : '비교·절차·기한 등 확장 주제까지 펼칩니다.'}</p>
        </div>
      ) : null}

      <noscript><p className={styles.noScript}>자바스크립트 없이 전체 주제를 모두 표시합니다.</p></noscript>
    </section>
  );
}
