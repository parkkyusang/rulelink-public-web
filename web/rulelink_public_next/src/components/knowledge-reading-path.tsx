import type {KnowledgeReadingPathSection} from '@/lib/knowledge-relations';

import styles from './knowledge-reading-path.module.css';

type Props = {
  currentTitle: string;
  sections: KnowledgeReadingPathSection[];
};

export function KnowledgeReadingPath({currentTitle, sections}: Props) {
  if (!sections.length) return null;

  return (
    <section aria-labelledby="knowledge-reading-path-title" className={styles.root} data-testid="knowledge-reading-path" id="reading-path">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>연결 독해</p>
          <h2 id="knowledge-reading-path-title">지금 확인한 기준에서 어디로 이어질까요?</h2>
          <p className={styles.intro}>연결 의미가 확인된 내용은 이유와 다음 행동을 함께 표시합니다.</p>
        </div>
        <p aria-label={`현재 읽는 글: ${currentTitle}`} className={styles.current}>
          <span>현재 읽는 글</span>
          <strong>{currentTitle}</strong>
        </p>
      </header>

      <div className={styles.sections}>
        {sections.map((section, sectionIndex) => {
          const headingId = `reading-path-${section.key}`;
          return (
            <section
              aria-labelledby={headingId}
              className={styles.section}
              data-reading-section={section.key}
              data-typed={section.typed ? 'true' : 'false'}
              key={section.key}
            >
              <header className={styles.sectionHeader}>
                <span aria-hidden="true" className={styles.step}>{String(sectionIndex + 1).padStart(2, '0')}</span>
                <div>
                  <h3 id={headingId}>{section.label_ko}</h3>
                  <p>{section.description_ko}</p>
                </div>
              </header>
              {section.key === 'concierge_boundary' ? (
                <div aria-label="공개정보와 사건별 컨시어지 이용 경계" className={styles.boundaryGuide}>
                  <p className={styles.boundaryIntro}><strong>공개 법률정보는 누구나 이용할 수 있습니다.</strong> 사건별 컨시어지는 자격이 확인된 변호사만 이용할 수 있습니다. 연결된 설명에서 자격 확인이 필요한 이유를 먼저 확인하세요.</p>
                </div>
              ) : null}
              <ul className={styles.grid}>
                {section.items.map(item => (
                  <li
                    data-reading-kind={item.target_kind}
                    key={`${item.target_kind}:${item.target_id}`}
                  >
                    <a className={styles.card} href={item.href}>
                      <span className={styles.relation}>{item.relation_label_ko}</span>
                      <strong>{item.title_ko}</strong>
                      <p className={styles.summary}>{item.summary_ko}</p>
                      <div className={styles.reason}>
                        <span>왜 연결되나요?</span>
                        <p>{item.reason_ko}</p>
                      </div>
                      <span className={styles.action}>{item.action_ko} <span aria-hidden="true">→</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}
