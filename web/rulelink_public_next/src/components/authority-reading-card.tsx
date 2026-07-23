import {AuthorityClauseTree} from '@/components/authority-clause-tree';
import {AuthorityTimeBadge} from '@/components/authority-time-badge';
import {LegalConceptText} from '@/components/legal-concept-text';

import type {AuthorityReadingView} from '@/lib/authority-reading';
import type {PublicConceptCard} from '@/types/publication';

import styles from './authority-reading-section.module.css';

export function AuthorityReadingCard({
  concepts,
  primary = false,
  view,
}: {
  concepts: PublicConceptCard[];
  primary?: boolean;
  view: AuthorityReadingView;
}) {
  return (
    <article
      className={styles.card}
      data-authority-id={view.authorityReadingUnitId}
      data-primary={primary ? 'true' : undefined}
      data-source-kind="statute"
    >
      <details
        className={styles.cardDisclosure}
        id={view.cardDetailsId}
        open={primary}
      >
        <summary id={view.cardDomId}>
          <span className={styles.cardHeading}>
            <span className={styles.sourceLabel}>{sourceLabel(view)}</span>
            <h3>{view.titleKo}</h3>
            <span className={styles.cardSummary}>{view.summaryKo}</span>
          </span>
          <AuthorityTimeBadge label={view.timeLabelKo} state={view.timeState} />
        </summary>
        <div className={styles.cardBody}>
          <section aria-label={`${view.titleKo} 쉬운 조문 지도`} className={styles.plainMap}>
            <h4>쉬운 조문 지도</h4>
            <ol>
              {view.logicalGroups.map(group => (
                <li key={group.logicalGroupId}>
                  <header>
                    <span data-operator={group.operator}>
                      {group.roleLabelKo} · {group.operatorLabelKo}
                    </span>
                    <strong>{group.titleKo}</strong>
                  </header>
                  {group.paragraphs.map(paragraph => (
                    <p key={paragraph.explanationParagraphId}>
                      <LegalConceptText concepts={concepts} text={paragraph.textKo} />
                    </p>
                  ))}
                  <ul>
                    {group.anchors.map(anchor => (
                      <li key={anchor.anchorId}>
                        <a href={`#${anchor.domId}`}>
                          {anchor.plainHeadingKo}
                          {anchor.isBound ? <span>이 글의 근거</span> : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          <section aria-label={`${view.titleKo} 법령 원문 구조`} className={styles.rawClauses}>
            <h4>항·호별 법령 원문</h4>
            <p>필요한 항목을 펼치면 쉬운 설명과 검증된 원문을 나란히 확인할 수 있습니다.</p>
            <AuthorityClauseTree anchors={view.anchors} concepts={concepts} />
          </section>

          {view.officialUrl ? (
            <a
              className={styles.officialAction}
              data-authority-official-link
              data-authority-return-fragment={view.cardDomId}
              href={view.officialUrl}
              rel="noreferrer"
              target="_blank"
            >
              국가법령정보센터에서 원문 전체 보기
              <span className={styles.newTabNote}>(새 탭)</span>
            </a>
          ) : null}
        </div>
      </details>
    </article>
  );
}

function sourceLabel(view: AuthorityReadingView): string {
  if (view.source.source_kind === 'statute' || view.source.source_kind === undefined) {
    return `${view.source.law_name_ko} ${view.source.article_no}`;
  }
  return view.titleKo;
}
