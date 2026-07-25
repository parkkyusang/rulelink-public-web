import {knowledgeContentTypeLabel} from '@/lib/content-labels';
import {
  buildKnowledgeHubJourneys,
  type KnowledgeHubJourneyStage,
} from '@/lib/knowledge-hub-journey';

import type {PublicKnowledgeEntry} from '@/types/publication';

import styles from './knowledge-hub-journey.module.css';

export function KnowledgeHubJourney({
  entries,
}: {
  entries: readonly PublicKnowledgeEntry[];
}) {
  const journeys = buildKnowledgeHubJourneys(entries);
  if (!journeys.length) return null;

  return (
    <section
      aria-labelledby="hub-journey-heading"
      className={styles.root}
      data-hub-journey
    >
      <header className={styles.intro}>
        <div>
          <p className="eyebrow">문제에서 행동까지</p>
          <h2 id="hub-journey-heading">
            내 상황과 가까운 경로에서 상세 안내로 들어가세요.
          </h2>
        </div>
        <p>
          각 글에 실제로 기록된 대상 상황, 핵심 답, 확인할 사실·자료와
          다음 행동만 순서대로 연결합니다.
        </p>
      </header>

      <ol className={styles.journeys}>
        {journeys.map((journey, journeyIndex) => {
          const headingId = `hub-journey-${journey.content_id}`;
          return (
            <li
              data-content-id={journey.content_id}
              data-journey-index={journeyIndex}
              key={journey.content_id}
            >
              <article
                aria-labelledby={headingId}
                className={styles.journey}
              >
                <header className={styles.journeyHeader}>
                  <span>{String(journeyIndex + 1).padStart(2, '0')}</span>
                  <div>
                    <p>
                      {knowledgeContentTypeLabel(journey.content_type)}
                      {' · '}
                      기준 확인 {formatDate(journey.reviewed_at)}
                      {' · '}
                      공식근거 {journey.source_count}건
                    </p>
                    <h3 id={headingId}>{journey.title_ko}</h3>
                  </div>
                </header>

                <ol
                  aria-label={`${journey.title_ko} 읽기 경로`}
                  className={styles.stages}
                >
                  {journey.stages.map((stage, stageIndex) => (
                    <li
                      data-hub-stage={stage.key}
                      key={stage.key}
                    >
                      <span
                        aria-hidden="true"
                        className={styles.stageMarker}
                      >
                        {stageIndex + 1}
                      </span>
                      <div>
                        <strong>{stage.label_ko}</strong>
                        <StageContent stage={stage} />
                      </div>
                    </li>
                  ))}
                </ol>

                <a
                  className={styles.detailLink}
                  href={`/ko/knowledge/${journey.slug}`}
                >
                  법리·사실분기·공식근거까지 보기
                  <span aria-hidden="true">→</span>
                </a>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StageContent({stage}: {stage: KnowledgeHubJourneyStage}) {
  if (stage.items_ko.length === 1) return <p>{stage.items_ko[0]}</p>;
  const Tag = stage.key === 'action' ? 'ol' : 'ul';
  return (
    <Tag>
      {stage.items_ko.map(item => <li key={item}>{item}</li>)}
    </Tag>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(
    new Date(value),
  );
}
