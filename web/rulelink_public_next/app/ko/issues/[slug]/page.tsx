import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {assertionsForCard, findPublishedCard, listPublishedCards, relatedCardsForCard, relatedChangeBriefsForCard, topicsForCard} from '@/lib/publication';
import {changeLifecycleLabel} from '@/lib/change-lifecycle';
import {browserOfficialSourceUrl} from '@/lib/official-source-url';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';

type PageProps = {params: Promise<{slug: string}>};

export async function generateStaticParams() {
  return (await listPublishedCards()).map(card => ({slug: card.slug}));
}

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const card = await findPublishedCard((await params).slug);
  if (!card) return {};
  const path = `/ko/issues/${card.slug}`;
  return {
    title: card.title_ko,
    description: card.audience_situation_ko,
    alternates: {canonical: path},
    openGraph: {
      type: 'article',
      title: card.title_ko,
      description: card.audience_situation_ko,
      url: path,
      modifiedTime: card.reviewed_at,
    },
  };
}

export default async function IssuePage({params}: PageProps) {
  const card = await findPublishedCard((await params).slug);
  if (!card) notFound();
  const [assertions, topics, relatedCards, relatedChangeBriefs] = await Promise.all([
    assertionsForCard(card),
    topicsForCard(card),
    relatedCardsForCard(card),
    relatedChangeBriefsForCard(card),
  ]);
  const primaryTopic = topics[0];
  const canonicalUrl = `${site.url}/ko/issues/${card.slug}`;
  const officialSources = [...new Set(assertions.flatMap(assertion => assertion.source_coordinates
    .map(source => browserOfficialSourceUrl(source))
    .filter((url): url is string => Boolean(url))))];
  return (
    <main className="issuePage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: card.title_ko,
          description: card.audience_situation_ko,
          dateModified: card.reviewed_at,
          mainEntityOfPage: canonicalUrl,
          inLanguage: 'ko-KR',
          isBasedOn: officialSources,
        })}}
        type="application/ld+json"
      />
      <nav aria-label="현재 위치" className="breadcrumb">
        <a href="/">홈</a><span aria-hidden="true">/</span>
        {primaryTopic ? <><a href={`/ko/topics/${primaryTopic.slug}`}>{primaryTopic.title_ko}</a><span aria-hidden="true">/</span></> : null}
        <span aria-current="page">현재 문제</span>
      </nav>
      <header className="issueHero">
        <p className="eyebrow">{primaryTopic?.title_ko || '생활법률'} · {card.version}</p>
        <h1>{card.title_ko}</h1>
        <p>{card.audience_situation_ko}</p>
        <div className="reviewMeta">
          <span>검토일 {formatDate(card.reviewed_at)}</span>
          <span>재검토 기한 {formatDate(card.expires_at)}</span>
        </div>
      </header>

      <section className="warningPanel">
        <h2>먼저 확인할 긴급신호</h2>
        <List items={card.urgency_signals} />
      </section>

      <nav aria-label="문서 목차" className="sectionNav">
        <a href="#questions">확인사항</a>
        <a href="#evidence">준비자료</a>
        <a href="#actions">행동순서</a>
        <a href="#sources">공식근거</a>
      </nav>

      <div className="issueLayout">
        <div className="issueMain">
          <Section id="questions" title="결론을 바꾸는 확인사항" items={card.branch_questions} />
          <Section id="evidence" title="준비할 자료" items={card.evidence_checklist} />
          <Section id="actions" title="권장 행동순서" items={card.action_paths} ordered />
          <Section id="escalation" title="전문가 또는 기관 도움이 필요한 때" items={card.escalation_rules} />
        </div>
        <aside className="sourcePanel" id="sources">
          <h2>근거가 붙은 설명</h2>
          <p className="sourceIntro">설명마다 적용 조건과 공식 원문을 함께 확인할 수 있습니다.</p>
          {assertions.map(assertion => (
            <article className="assertion" key={assertion.assertion_id}>
              <p>{assertion.user_facing_text_ko}</p>
              <details className="conditionDetails">
                <summary>언제 적용되는지 확인</summary>
                <ConditionList label="적용" items={assertion.applies_when} />
                {assertion.does_not_apply_when.length ? <ConditionList label="예외·주의" items={assertion.does_not_apply_when} /> : null}
              </details>
              {assertion.source_coordinates.map((source, index) => (
                <div className="source" key={`${assertion.assertion_id}-${index}`}>
                  <span>{sourceLabel(source)}</span>
                  {source.article_no ? <span>{source.article_no}</span> : null}
                  {browserOfficialSourceUrl(source) ? <a href={browserOfficialSourceUrl(source)} rel="noreferrer" target="_blank">공식 근거</a> : null}
                </div>
              ))}
            </article>
          ))}
        </aside>
      </div>

      {relatedChangeBriefs.length ? (
        <section className="relatedSection">
          <p className="eyebrow">이 문제에 영향을 주는 법령 변화</p>
          <h2>시행 전후 달라지는 내용을 함께 확인하세요.</h2>
          <div className="relatedGrid">
            {relatedChangeBriefs.map(brief => (
              <a href={`/ko/changes/${brief.slug}`} key={brief.change_brief_id}>
                <strong>{brief.title_ko}</strong>
                <span>{changeLifecycleLabel(brief.lifecycle)} · {formatDate(brief.effective_date)}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {relatedCards.length ? (
        <section className="relatedSection">
          <p className="eyebrow">같이 확인하면 좋은 문제</p>
          <h2>다음 상황도 이어서 살펴보세요</h2>
          <div className="relatedGrid">
            {relatedCards.map(related => (
              <a href={`/ko/issues/${related.slug}`} key={related.issue_card_id}>
                <strong>{related.title_ko}</strong>
                <span>문제카드 보기 →</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Section({id, title, items, ordered = false}: {id: string; title: string; items: string[]; ordered?: boolean}) {
  return (
    <section className="issueSection" id={id}>
      <h2>{title}</h2>
      <List items={items} ordered={ordered} />
    </section>
  );
}

function ConditionList({label, items}: {label: string; items: string[]}) {
  return <div className="conditionList"><b>{label}</b><List items={items} /></div>;
}

function sourceLabel(source: {official_url?: string; law_key?: string; case_no?: string; source_id?: string}): string {
  if (source.official_url) {
    try {
      const parts = new URL(source.official_url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const lawIndex = parts.indexOf('법령');
      if (lawIndex >= 0 && parts[lawIndex + 1]) return parts[lawIndex + 1];
    } catch {
      // 공식 주소가 예외 형식이면 검증된 좌표 식별자로 되돌아간다.
    }
  }
  return source.case_no || source.law_key || source.source_id || '공식 근거';
}

function List({items, ordered = false}: {items: string[]; ordered?: boolean}) {
  const Tag = ordered ? 'ol' : 'ul';
  return <Tag>{items.map(item => <li key={item}>{item}</li>)}</Tag>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'long'}).format(new Date(value));
}
