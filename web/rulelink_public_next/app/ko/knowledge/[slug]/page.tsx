import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {knowledgeContentTypeLabel} from '@/lib/content-labels';
import {browserOfficialSourceUrl} from '@/lib/official-source-url';
import {findKnowledgeEntry, knowledgeDetail, listKnowledgeEntries} from '@/lib/publication';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';

import styles from './knowledge-trust.module.css';

export const dynamic = 'force-static';

type Props = {params: Promise<{slug: string}>};

export async function generateStaticParams() {
  return (await listKnowledgeEntries()).map(entry => ({slug: entry.slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const entry = await findKnowledgeEntry((await params).slug);
  if (!entry) return {};
  const canonical = `/ko/knowledge/${entry.slug}`;
  return {
    title: entry.title_ko,
    description: entry.one_line_answer_ko,
    keywords: entry.search_intents_ko,
    alternates: {canonical},
    openGraph: {
      type: 'article',
      title: entry.title_ko,
      description: entry.one_line_answer_ko,
      url: canonical,
      modifiedTime: entry.reviewed_at,
    },
  };
}

export default async function KnowledgePage({params}: Props) {
  const {slug} = await params;
  const entry = await findKnowledgeEntry(slug);
  if (!entry) notFound();
  const {rules, scenarios, sources, hubs, related} = await knowledgeDetail(entry);
  const canonicalUrl = `${site.url}/ko/knowledge/${entry.slug}`;
  const officialSourceUrls = sources
    .map(source => browserOfficialSourceUrl(source))
    .filter((url): url is string => Boolean(url));
  return (
    <main className="knowledgePage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': canonicalUrl,
          url: canonicalUrl,
          name: entry.title_ko,
          description: entry.one_line_answer_ko,
          keywords: entry.search_intents_ko,
          inLanguage: 'ko-KR',
          dateModified: entry.reviewed_at,
          isBasedOn: officialSourceUrls,
          isPartOf: {
            '@type': 'WebSite',
            name: site.name,
            url: site.url,
          },
          about: rules.map(rule => ({
            '@type': 'DefinedTerm',
            name: rule.title_ko,
            description: rule.proposition_ko,
          })),
        })}}
        type="application/ld+json"
      />
      <nav className="breadcrumb">
        <a href="/">홈</a><span>/</span><a href="/ko/knowledge">생활법률 지식</a>
        {hubs[0] ? <><span>/</span><a href={`/ko/hubs/${hubs[0].slug}`}>{hubs[0].title_ko}</a></> : null}
      </nav>
      <header className="knowledgeHero">
        <p className="eyebrow">{knowledgeContentTypeLabel(entry.content_type)}</p>
        <h1>{entry.title_ko}</h1>
        <p>{entry.one_line_answer_ko}</p>
        <span className="audienceBadge">{entry.audience_situation_ko}</span>
        <div aria-label="콘텐츠 기준일" className={styles.trust}>
          <span><b>기준 확인</b>{formatDate(entry.reviewed_at)}</span>
          <span><b>다음 점검</b>{formatDate(entry.expires_at)}</span>
          <span><b>공식 근거</b>{sources.length}건 연결</span>
        </div>
        {hubs.length ? (
          <nav aria-label="소속 주제" className={styles.hubTrail}>
            <span>이 글이 속한 주제</span>
            {hubs.map(hub => <a href={`/ko/hubs/${hub.slug}`} key={hub.hub_id}>{hub.title_ko} →</a>)}
          </nav>
        ) : null}
      </header>

      <section className="knowledgeLayout">
        <div>
          <section className="knowledgeSection">
            <p className="eyebrow">핵심 정리</p>
            <h2>무엇부터 확인해야 하나요?</h2>
            <ul>
              {entry.key_points_ko.map(point => <li key={point}>{point}</li>)}
            </ul>
            <div className="ruleStack">
              {entry.body_sections.map(section => (
                <article className="ruleCard" key={section.heading_ko}>
                  <h3>{section.heading_ko}</h3>
                  {section.paragraphs_ko.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                </article>
              ))}
            </div>
          </section>

          <section className="knowledgeSection">
            <p className="eyebrow">적용 법리</p>
            <h2>먼저 기준을 확인합니다.</h2>
            <div className="ruleStack">
              {rules.map(rule => (
                <article className="ruleCard" key={rule.rule_id}>
                  <h3>{rule.title_ko}</h3>
                  <p>{rule.proposition_ko}</p>
                  <dl className="normSlots">
                    <div><dt>누가</dt><dd>{rule.norm.actor_ko}</dd></div>
                    <div><dt>어떤 때</dt><dd>{rule.norm.conditions_ko}</dd></div>
                    <div><dt>결과</dt><dd>{rule.norm.legal_effect_ko}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          {scenarios.length ? (
            <section className="knowledgeSection">
              <p className="eyebrow">결론을 가르는 사실</p>
              <h2>내 상황은 어느 쪽입니까?</h2>
              <div className="branchStack">
                {scenarios.map(branch => (
                  <article className="branchCard" key={branch.scenario_id}>
                    <h3>{branch.question_ko}</h3>
                    <p className="decisionFact">확인할 사실 · {branch.decision_fact_ko}</p>
                    <div className="branchOutcomes">
                      <p><b>해당하면</b>{branch.when_true_ko}</p>
                      <p><b>해당하지 않으면</b>{branch.when_false_ko}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="knowledgeSection">
            <p className="eyebrow">지금 할 일과 자료</p>
            <h2>다음 순서로 준비합니다.</h2>
            <div className="ruleStack">
              <article className="ruleCard">
                <h3>행동 순서</h3>
                <ol>{entry.action_steps_ko.map(step => <li key={step}>{step}</li>)}</ol>
              </article>
              <article className="ruleCard">
                <h3>확인하고 보관할 사실</h3>
                <ul>{entry.facts_to_check_ko.map(fact => <li key={fact}>{fact}</li>)}</ul>
              </article>
            </div>
            <p><b>주의할 점</b> · {entry.caution_ko}</p>
          </section>
        </div>

        <aside className="knowledgeAside">
          {entry.concierge_entry ? (
            <section className="conciergePanel">
              <p className="eyebrow">개별 사실 검토</p>
              <h2>{entry.concierge_entry.question_ko}</h2>
              <ul>{entry.concierge_entry.decision_facts_ko.map(fact => <li key={fact}>{fact}</li>)}</ul>
              <a href={entry.concierge_entry.href}>룰링크 컨시어지에서 이어서 검토 <span aria-hidden="true">→</span></a>
            </section>
          ) : null}
          <section className="knowledgeSources">
            <h2>공식 근거</h2>
            <p className={styles.sourcesIntro}>원문 주소와 마지막 확인일을 함께 표시합니다.</p>
            {sources.map(source => (
              <a className={styles.sourceLink} href={browserOfficialSourceUrl(source) ?? source.official_url} key={source.coordinate_id} rel="noreferrer" target="_blank">
                <span>{source.law_name_ko} {source.article_no} 원문 <span aria-hidden="true">↗</span></span>
                <small>원문 확인 {formatDate(source.last_verified_at)}</small>
              </a>
            ))}
          </section>
        </aside>
      </section>

      {related.length ? (
        <section className="relatedSection">
          <h2>같이 확인할 내용</h2>
          <div className="relatedGrid">
            {related.map(item => <a href={`/ko/knowledge/${item.slug}`} key={item.content_id}><strong>{item.title_ko}</strong><span>내용 보기 →</span></a>)}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
