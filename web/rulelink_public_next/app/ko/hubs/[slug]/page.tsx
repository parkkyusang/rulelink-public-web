import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {entriesForKnowledgeHub, findKnowledgeHub, listKnowledgeHubs} from '@/lib/publication';

export const dynamic = 'force-static';

type Props = {params: Promise<{slug: string}>};

export async function generateStaticParams() {
  return (await listKnowledgeHubs()).map(hub => ({slug: hub.slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const hub = await findKnowledgeHub((await params).slug);
  return hub ? {title: hub.title_ko, description: hub.description_ko} : {};
}

export default async function KnowledgeHubPage({params}: Props) {
  const {slug} = await params;
  const hub = await findKnowledgeHub(slug);
  if (!hub) notFound();
  const entries = await entriesForKnowledgeHub(hub);
  return (
    <main className="topicPage">
      <nav className="breadcrumb"><a href="/">홈</a><span>/</span><span>주제별 안내</span></nav>
      <header className="topicHero">
        <p className="eyebrow">주제 허브</p>
        <h1>{hub.title_ko}</h1>
        <p>{hub.description_ko}</p>
      </header>
      <div className="knowledgeGrid">
        {entries.map(entry => (
          <a className="knowledgeCard" href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>
            <span>{entry.audience_situation_ko}</span>
            <h2>{entry.title_ko}</h2>
            <p>{entry.one_line_answer_ko}</p>
            <strong>법리와 사실분기 보기 →</strong>
          </a>
        ))}
      </div>
    </main>
  );
}
