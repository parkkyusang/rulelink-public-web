import type {ResolvedPublicEditorialAttribution} from '@/lib/public-trust';

import styles from './editorial-attribution.module.css';

export function EditorialAttribution({
  attribution,
  trustHref,
}: {
  attribution: ResolvedPublicEditorialAttribution;
  trustHref?: '/ko/trust';
}) {
  return (
    <section
      aria-labelledby="editorial-attribution-heading"
      className={styles.root}
      data-editorial-attribution
    >
      <div className={styles.heading}>
        <p className="eyebrow">작성·검토 표지</p>
        <h2 id="editorial-attribution-heading">누가 만들고 검토했는지 공개합니다</h2>
      </div>
      <dl className={styles.details}>
        <div>
          <dt>작성 주체</dt>
          <dd>
            {attribution.author.url ? (
              <a href={attribution.author.url}>{attribution.author.name_ko}</a>
            ) : attribution.author.name_ko}
            <span>{attribution.author.role_ko}</span>
          </dd>
        </div>
        <div>
          <dt>법률 검토자</dt>
          <dd>
            {attribution.legal_reviewer.name_ko}
            <span>{attribution.legal_reviewer.qualification_ko}</span>
            <a href={attribution.legal_reviewer.evidence_url}>승인 근거 확인</a>
          </dd>
        </div>
        <div>
          <dt>검토일</dt>
          <dd>{formatDate(attribution.legal_reviewer.reviewed_at)}</dd>
        </div>
        <div>
          <dt>검토분야</dt>
          <dd className={styles.areas}>
            {attribution.legal_reviewer.review_areas_ko.map(area => (
              <span key={area}>{area}</span>
            ))}
          </dd>
        </div>
      </dl>
      {trustHref ? (
        <a className={styles.policyLink} href={trustHref}>
          콘텐츠 제작·검토 원칙 보기 <span aria-hidden="true">→</span>
        </a>
      ) : null}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(
    new Date(value),
  );
}
