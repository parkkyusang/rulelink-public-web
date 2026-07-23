import {AuthorityFragmentController} from '@/components/authority-fragment-controller';
import {AuthorityReadingCard} from '@/components/authority-reading-card';

import type {AuthorityReadingView} from '@/lib/authority-reading';
import type {PublicConceptCard} from '@/types/publication';

import styles from './authority-reading-section.module.css';

export function AuthorityReadingSection({
  asOf,
  concepts,
  views,
}: {
  asOf: string | null;
  concepts: PublicConceptCard[];
  views: readonly AuthorityReadingView[];
}) {
  if (!views.length) return null;
  return (
    <section
      aria-labelledby="authority-reading-title"
      className={styles.root}
      data-authority-reading-root
      id="statute-reading"
    >
      <AuthorityFragmentController />
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>이 답의 법적 근거</p>
          <h2 id="authority-reading-title">조문을 쉬운 지도에서 원문까지 읽습니다.</h2>
          <p>관련 글이 아니라, 이 답을 뒷받침하는 법령의 조·항·호를 순서대로 확인합니다.</p>
        </div>
        {asOf ? (
          <p className={styles.asOf}>
            <span>전체 기준일</span>
            <time dateTime={asOf}>{formatDate(asOf)}</time>
          </p>
        ) : null}
      </header>
      <div className={styles.grid}>
        {views.map((view, index) => (
          <AuthorityReadingCard
            concepts={concepts}
            key={view.authorityReadingUnitId}
            primary={index === 0}
            view={view}
          />
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
