import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {knowledgeContentTypeLabel} from '@/lib/content-labels';
import {entriesForKnowledgeHub, findKnowledgeHub, listKnowledgeHubs} from '@/lib/publication';
import {site} from '@/lib/site';
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
  const entries = await entriesForKnowledgeHub(hub);
  if (!entries.length) notFound();
  const canonicalUrl = `${site.url}/ko/hubs/${hub.slug}`;
  return (
    <main className="topicPage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': canonicalUrl,
          url: canonicalUrl,
          name: hub.title_ko,
          description: hub.description_ko,
          inLanguage: 'ko-KR',
          isPartOf: {
            '@type': 'WebSite',
            name: site.name,
            url: site.url,
          },
          numberOfItems: entries.length,
          hasPart: entries.map(entry => ({
            '@type': 'WebPage',
            name: entry.title_ko,
            description: entry.one_line_answer_ko,
            url: `${site.url}/ko/knowledge/${entry.slug}`,
            dateModified: entry.reviewed_at,
          })),
        })}}
        type="application/ld+json"
      />
      <nav className="breadcrumb"><a href="/">홈</a><span>/</span><a href="/ko/knowledge">생활법률 지식</a><span>/</span><span>{hub.title_ko}</span></nav>
      <header className="topicHero">
        <p className="eyebrow">주제 허브</p>
        <h1>{hub.title_ko}</h1>
        <p>{hub.description_ko}</p>
        <span className="audienceBadge">연결된 지식 {entries.length}개</span>
      </header>
      <div className="knowledgeGrid">
        {entries.map(entry => (
          <a className="knowledgeCard" href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>
            <span>{knowledgeContentTypeLabel(entry.content_type)} · 기준 확인 {formatDate(entry.reviewed_at)}</span>
            <h2>{entry.title_ko}</h2>
            <p>{entry.one_line_answer_ko}</p>
            <strong>법리와 사실분기 보기 →</strong>
          </a>
        ))}
      </div>
    </main>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}

