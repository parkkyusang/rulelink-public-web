import type {ChangeBriefProjection} from '@/lib/change-brief-projection';

type Props = {
  effectiveDateLabel: string;
  projection: ChangeBriefProjection;
};

export function ChangeBriefContext({effectiveDateLabel, projection}: Props) {
  return (
    <>
      <section aria-labelledby="change-timeline-title" className="changeTimeline">
        <p className="eyebrow">시행 시점 읽기</p>
        <h2 id="change-timeline-title">언제부터 어떤 규정을 봐야 하나요?</h2>
        <div className="changeTimelineGrid">
          <div>
            <strong>{projection.status_label_ko}</strong>
            <span>시행일 {effectiveDateLabel}</span>
          </div>
          <p>{projection.status_context_ko}</p>
        </div>
      </section>

      {projection.related_readings.length ? (
        <section aria-labelledby="change-related-reading-title" className="relatedSection changeRelatedReading">
          <p className="eyebrow">관련 생활질문</p>
          <h2 id="change-related-reading-title">내 상황에 적용하려면 다음 설명을 이어서 보세요.</h2>
          <div className="relatedGrid">
            {projection.related_readings.map(reading => (
              <a href={`/ko/knowledge/${reading.slug}`} key={reading.content_id}>
                <strong>{reading.title_ko}</strong>
                <span>{reading.one_line_answer_ko}</span>
                <small>생활질문 상세 보기 →</small>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
