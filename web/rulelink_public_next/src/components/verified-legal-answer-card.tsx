import type {CanonicalLegalAnswerProjection} from '@/types/legal-answer-packet';

export function VerifiedLegalAnswerCard({
  answer,
  hasAuthorityReading,
  hasScenarios,
}: {
  answer: CanonicalLegalAnswerProjection;
  hasAuthorityReading: boolean;
  hasScenarios: boolean;
}) {
  const [primaryAnswer, ...supportingAnswers] = answer.quickAnswer;
  if (!primaryAnswer) return null;
  return (
    <section
      aria-labelledby="verified-legal-answer-heading"
      className="knowledgeSection"
      data-verified-legal-answer
    >
      <article className="ruleCard">
        <p className="eyebrow">
          {answer.status === 'verified' ? '검증된 답변' : '검증된 조건부 답변'}
        </p>
        <h2 id="verified-legal-answer-heading">{primaryAnswer.text_ko}</h2>
        {supportingAnswers.map(unit => (
          <p key={unit.unit_id}>{unit.text_ko}</p>
        ))}
        <p>
          <b>답변 기준일</b>{' '}
          <time dateTime={answer.asOf}>{formatDate(answer.asOf)}</time>
        </p>
        <nav
          aria-label="검증된 답변의 질문, 근거, 행동으로 이동"
          className="knowledgeSectionNav"
        >
          {hasScenarios ? <a href="#scenarios">내 상황 질문</a> : null}
          <a href={hasAuthorityReading ? '#statute-reading' : '#sources'}>
            공식 근거
          </a>
          <a href="#actions">확인할 행동</a>
        </nav>
      </article>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(
    new Date(`${value}T00:00:00Z`),
  );
}
