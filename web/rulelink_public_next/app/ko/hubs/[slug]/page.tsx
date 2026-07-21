import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {knowledgeContentTypeLabel} from '@/lib/content-labels';
import {decisionPathsForKnowledgeHub, entriesForKnowledgeHub, findKnowledgeHub, listKnowledgeHubs} from '@/lib/publication';
import {site} from '@/lib/site';
import {buildKnowledgeHubStructuredData} from '@/lib/public-structured-data';
import {serializeStructuredData} from '@/lib/structured-data';

export const dynamic = 'force-static';

type Props = {params: Promise<{slug: string}>};

export async function generateStaticParams() {
  return (await listKnowledgeHubs()).map(hub => ({slug: hub.slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const hub = await findKnowledgeHub((await params).slug);
  if (!hub) return {};
  const canonical = `/ko/hubs/${hub.slug}`;
  return {
    title: hub.title_ko,
    description: hub.description_ko,
    alternates: {canonical},
    openGraph: {
      type: 'website',
      title: hub.title_ko,
      description: hub.description_ko,
      url: canonical,
    },
  };
}

export default async function KnowledgeHubPage({params}: Props) {
  const {slug} = await params;
  const hub = await findKnowledgeHub(slug);
  if (!hub) notFound();
  const [entries, decisionPaths] = await Promise.all([
    entriesForKnowledgeHub(hub),
    decisionPathsForKnowledgeHub(hub),
  ]);
  if (!entries.length) notFound();
  const canonicalUrl = `${site.url}/ko/hubs/${hub.slug}`;
  return (
    <main className="topicPage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData(buildKnowledgeHubStructuredData({
          breadcrumbs: [
            {name: '홈', url: site.url},
            {name: '생활법률 지식', url: `${site.url}/ko/knowledge`},
            {name: hub.title_ko, url: canonicalUrl},
          ],
          description: hub.description_ko,
          entries: entries.map(entry => ({
            dateModified: entry.reviewed_at,
            description: entry.one_line_answer_ko,
            name: entry.title_ko,
            url: `${site.url}/ko/knowledge/${entry.slug}`,
          })),
          pageUrl: canonicalUrl,
          siteName: site.name,
          siteUrl: site.url,
          title: hub.title_ko,
        }))}}
        type="application/ld+json"
      />
      <nav className="breadcrumb"><a href="/">홈</a><span>/</span><a href="/ko/knowledge">생활법률 지식</a><span>/</span><span>{hub.title_ko}</span></nav>
      <header className="topicHero">
        <p className="eyebrow">주제 허브</p>
        <h1>{hub.title_ko}</h1>
        <p>{hub.description_ko}</p>
        <span className="audienceBadge">연결된 지식 {entries.length}개</span>
      </header>
      {decisionPaths.length ? (
        <section aria-labelledby="hub-decision-heading" className="hubDecisionSection">
          <div className="hubDecisionIntro">
            <div>
              <p className="eyebrow">결론을 가르는 질문</p>
              <h2 id="hub-decision-heading">어떤 사실부터 확인해야 하나요?</h2>
            </div>
            <p>같은 주제라도 사실 하나가 적용 법리와 다음 행동을 바꿉니다. 내 상황과 가까운 질문에서 연결된 안내를 확인하세요.</p>
          </div>
          <div className="hubDecisionGrid">
            {decisionPaths.map((path, index) => (
              <article className="hubDecisionCard" key={path.scenario.scenario_id}>
                <span className="hubDecisionNumber">판단 질문 {String(index + 1).padStart(2, '0')}</span>
                <h3>{path.scenario.question_ko}</h3>
                <p><b>확인할 사실</b>{path.scenario.decision_fact_ko}</p>
                <div className="hubDecisionLinks">
                  {path.entries.map(entry => (
                    <a href={`/ko/knowledge/${entry.slug}#scenarios`} key={entry.content_id}>
                      <span>{entry.title_ko}</span><b aria-hidden="true">→</b>
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section aria-labelledby="hub-all-entries-heading" className="hubAllEntries">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow">전체 안내</p>
            <h2 id="hub-all-entries-heading">이 주제의 검토된 글</h2>
          </div>
          <span className="snapshot">{entries.length}개</span>
        </div>
        <div className="knowledgeGrid">
        {entries.map(entry => (
          <a className="knowledgeCard" href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>
            <span className="knowledgeMeta">{knowledgeContentTypeLabel(entry.content_type)} · 기준 확인 {formatDate(entry.reviewed_at)}</span>
            <h2>{entry.title_ko}</h2>
            <p>{entry.one_line_answer_ko}</p>
            <strong>법리와 사실분기 보기 →</strong>
          </a>
        ))}
        </div>
      </section>
    </main>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}

