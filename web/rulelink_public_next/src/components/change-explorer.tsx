'use client';

import {useMemo, useState} from 'react';

import type {LegalChangeBrief} from '@/types/publication';

import styles from './change-explorer.module.css';

type Props = {
  briefs: LegalChangeBrief[];
};

type LifecycleFilter = 'all' | LegalChangeBrief['lifecycle'];

export function ChangeExplorer({briefs}: Props) {
  const [query, setQuery] = useState('');
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>('all');
  const normalizedQuery = normalize(query);
  const counts = useMemo(() => ({
    all: briefs.length,
    future_effective: briefs.filter(brief => brief.lifecycle === 'future_effective').length,
    recently_effective: briefs.filter(brief => brief.lifecycle === 'recently_effective').length,
  }), [briefs]);
  const visibleBriefs = useMemo(() => {
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    return briefs.filter(brief => {
      if (lifecycle !== 'all' && brief.lifecycle !== lifecycle) return false;
      if (!queryTokens.length) return true;
      const searchText = normalize([
        brief.title_ko,
        brief.summary_ko,
        brief.law_name_ko,
        brief.article_no,
        ...brief.affected_audiences,
        ...brief.changed_points,
        ...brief.action_checklist,
      ].join(' '));
      return queryTokens.every(token => searchText.includes(token));
    });
  }, [briefs, lifecycle, normalizedQuery]);

  return (
    <section aria-labelledby="change-library-heading" className={styles.explorer}>
      <div className={styles.controls}>
        <label htmlFor="change-search">법 이름이나 내 상황으로 찾아보세요</label>
        <div className={styles.searchRow}>
          <span aria-hidden="true">⌕</span>
          <input
            id="change-search"
            onChange={event => setQuery(event.target.value)}
            placeholder="예: 행정심판, 시행일, 처분 통지"
            type="search"
            value={query}
          />
        </div>
      </div>

      <div aria-label="시행 상태" className={styles.filters} role="group">
        <FilterButton active={lifecycle === 'all'} count={counts.all} label="전체" onClick={() => setLifecycle('all')} />
        <FilterButton active={lifecycle === 'future_effective'} count={counts.future_effective} label="시행 예정" onClick={() => setLifecycle('future_effective')} />
        <FilterButton active={lifecycle === 'recently_effective'} count={counts.recently_effective} label="최근 시행" onClick={() => setLifecycle('recently_effective')} />
      </div>

      <p aria-live="polite" className={styles.resultCount}>확인할 수 있는 법령 변화 {visibleBriefs.length}개</p>

      {visibleBriefs.length ? (
        <div className={styles.timeline}>
          {visibleBriefs.map(brief => (
            <article className={styles.item} key={brief.change_brief_id}>
              <div className={styles.dateRail}>
                <time dateTime={brief.effective_date}>{formatDate(brief.effective_date)}</time>
                <span>{brief.lifecycle === 'future_effective' ? '시행 예정' : '최근 시행'}</span>
              </div>
              <a className={styles.card} href={`/ko/changes/${brief.slug}`}>
                <div className={styles.meta}>
                  <span>{brief.law_name_ko} {brief.article_no}</span>
                  <time dateTime={brief.reviewed_at}>기준 확인 {formatDate(brief.reviewed_at)}</time>
                </div>
                <h2>{brief.title_ko}</h2>
                <p>{brief.summary_ko}</p>
                <ul aria-label="핵심 변경점">
                  {brief.changed_points.slice(0, 3).map(point => <li key={point}>{point}</li>)}
                </ul>
                <strong>구법·신법과 적용 경계 보기 <span aria-hidden="true">→</span></strong>
              </a>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>조건에 맞는 법령 변화를 찾지 못했습니다.</strong>
          <p>검색어를 짧게 바꾸거나 전체 시행 상태에서 다시 확인해 주세요.</p>
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

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string): string {
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value;
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(timestamp));
}
