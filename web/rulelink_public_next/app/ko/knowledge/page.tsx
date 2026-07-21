import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {KnowledgeExplorer} from '@/components/knowledge-explorer';
import {listKnowledgeHubs, listKnowledgeSearchDocuments} from '@/lib/publication';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '생활법률 지식',
  description: '승인된 RuleLink 법률지식을 상황과 주제별로 찾아봅니다.',
  alternates: {canonical: '/ko/knowledge'},
  openGraph: {
    type: 'website',
    title: '생활법률 지식',
    description: '승인된 RuleLink 법률지식을 상황과 주제별로 찾아봅니다.',
    url: '/ko/knowledge',
  },
};

export default async function KnowledgeLibraryPage() {
  const [documents, hubs] = await Promise.all([listKnowledgeSearchDocuments(), listKnowledgeHubs()]);
  const entries = documents.map(document => document.entry);
  if (!entries.length) notFound();
  const canonicalUrl = `${site.url}/ko/knowledge`;
  return (
    <main className="topicPage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': canonicalUrl,
          url: canonicalUrl,
          name: '생활법률 지식',
          description: metadata.description,
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
      <nav className="breadcrumb"><a href="/">홈</a><span>/</span><span>생활법률 지식</span></nav>
      <header className="topicHero">
        <p className="eyebrow">연결된 지식 보관함</p>
        <h1 id="knowledge-library-heading">내 상황에서 법리와 사실분기를 찾습니다.</h1>
        <p>승인된 지식만 모아 보여줍니다. 법률용어를 몰라도 겪고 있는 상황이나 궁금한 내용을 검색할 수 있습니다.</p>
      </header>
      <KnowledgeExplorer documents={documents} hubs={hubs} />
    </main>
  );
}
