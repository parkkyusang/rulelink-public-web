'use client';

import {useEffect, useMemo, useState} from 'react';

import {
  filterKnowledgeHubDirectoryCategories,
  normalizeKnowledgeHubQuery,
} from '@/lib/knowledge-hub-directory';
import {buildKnowledgeHubDirectoryCategories} from '@/lib/knowledge-hub-taxonomy';

import type {PublicKnowledgeHub} from '@/types/publication';

import styles from './knowledge-hub-directory.module.css';

type HubSummary = Pick<
  PublicKnowledgeHub,
  'content_ids' | 'hub_id' | 'slug' | 'title_ko' | 'description_ko'
>;

export function KnowledgeHubDirectory({hubs}: {hubs: HubSummary[]}) {
  const [enhanced, setEnhanced] = useState(false);
  const [query, setQuery] = useState('');
  const categories = useMemo(
    () => buildKnowledgeHubDirectoryCategories(hubs as PublicKnowledgeHub[]),
    [hubs],
  );
  const visibleCategories = useMemo(
    () => filterKnowledgeHubDirectoryCategories(categories, query),
    [categories, query],
  );
  const visibleHubIds = useMemo(
    () => new Set(visibleCategories.flatMap(category => (
      category.hubs.map(hub => hub.hub_id)
    ))),
    [visibleCategories],
  );
  const visibleCategoryIds = useMemo(
    () => new Set(visibleCategories.map(category => category.category_id)),
    [visibleCategories],
  );
  const normalizedQuery = normalizeKnowledgeHubQuery(query);
  const visibleCount = visibleHubIds.size;

  useEffect(() => setEnhanced(true), []);

  if (!hubs.length) return null;

  return (
    <section
      aria-labelledby="knowledge-hub-heading"
      className={styles.directory}
      data-enhanced={enhanced}
      data-knowledge-hub-directory
    >
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">보조 탐색</p>
          <h3 id="knowledge-hub-heading">생활영역에서 고르기</h3>
          <p>
            검색어가 떠오르지 않을 때 영역을 펼쳐 가까운 안내를 찾습니다.
          </p>
        </div>
        <span>7개 생활영역 · {hubs.length}개 주제</span>
      </div>

      {enhanced ? (
        <div className={styles.controls}>
          <label htmlFor="knowledge-hub-search">이 목록 안에서 좁혀 찾기</label>
          <div className={styles.searchRow}>
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="상황별 주제 검색"
              aria-describedby="knowledge-hub-search-hint"
              id="knowledge-hub-search"
              onChange={event => setQuery(event.target.value)}
              placeholder="예: 보증금, 직장, 교통사고"
              type="search"
              value={query}
            />
            {query ? (
              <button
              aria-label="상황별 주제 검색어 지우기"
                onClick={() => setQuery('')}
                type="button"
              >
                지우기
              </button>
            ) : null}
          </div>
          <p id="knowledge-hub-search-hint">
            생활영역·제목·설명에서 찾습니다.
          </p>
        </div>
      ) : null}

      {enhanced ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className={styles.resultCount}
        >
          {normalizedQuery
            ? `검색 결과 ${visibleCount}개 · 전체 ${hubs.length}개`
            : `전체 ${hubs.length}개 주제`}
        </p>
      ) : null}

      <nav
        aria-label="생활영역별 법률 안내"
        className={styles.categories}
        id="knowledge-hub-directory"
      >
        {categories.map(category => {
          const categoryHeadingId = `knowledge-hub-category-${category.category_id}`;
          return (
            <section
              aria-labelledby={categoryHeadingId}
              className={styles.category}
              data-hub-category={category.category_id}
              hidden={enhanced && !visibleCategoryIds.has(category.category_id)}
              key={category.category_id}
            >
              <header>
                <h4 id={categoryHeadingId}>{category.title_ko}</h4>
                <p>{category.description_ko}</p>
              </header>
              <div className={styles.links}>
                {category.hubs.map(hub => (
                  <a
                    data-hub-id={hub.hub_id}
                    hidden={enhanced && !visibleHubIds.has(hub.hub_id)}
                    href={`/ko/hubs/${hub.slug}`}
                    key={hub.hub_id}
                  >
                    <span>
                      <strong>{hub.title_ko}</strong>
                      <small>관련 안내 {hub.content_ids.length}개</small>
                    </span>
                    <p>{hub.description_ko}</p>
                    <b aria-hidden="true">→</b>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </nav>

      {enhanced && normalizedQuery && !visibleCount ? (
        <div className={styles.empty}>
          <strong>맞는 주제를 찾지 못했습니다.</strong>
          <p>검색어를 더 짧게 입력하거나 지우고 전체 영역을 확인해 주세요.</p>
        </div>
      ) : null}

      <noscript>
        <p className={styles.noScript}>
          자바스크립트 없이 전체 주제 링크를 모두 표시합니다.
        </p>
      </noscript>
    </section>
  );
}
