import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {KnowledgeSourceLibrary} from '@/components/knowledge-source-library';
import {browserOfficialSourceUrl} from '@/lib/official-source-url';
import {listKnowledgeSourceDocuments} from '@/lib/publication';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '공식 근거 보관함',
  description: 'RuleLink 생활법률 콘텐츠가 사용하는 법령 조문과 판례를 관련 안내와 함께 확인합니다.',
  alternates: {canonical: '/ko/sources'},
  openGraph: {
    type: 'website',
    title: '공식 근거 보관함',
    description: 'RuleLink 생활법률 콘텐츠가 사용하는 법령 조문과 판례를 관련 안내와 함께 확인합니다.',
    url: '/ko/sources',
  },
};

export default async function KnowledgeSourcesPage() {
  const documents = await listKnowledgeSourceDocuments();
  if (!documents.length) notFound();
  const canonicalUrl = `${site.url}/ko/sources`;
  return (
    <main className="topicPage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': canonicalUrl,
          url: canonicalUrl,
          name: '공식 근거 보관함',
          description: metadata.description,
          inLanguage: 'ko-KR',
          isPartOf: {
            '@type': 'WebSite',
            name: site.name,
            url: site.url,
          },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: documents.length,
            itemListElement: documents.map((document, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: document.label_ko,
              url: browserOfficialSourceUrl(document.source) ?? document.source.official_url,
            })),
          },
        })}}
        type="application/ld+json"
      />
      <nav aria-label="현재 위치" className="breadcrumb"><a href="/">홈</a><span aria-hidden="true">/</span><span>공식 근거</span></nav>
      <header className="topicHero">
        <p className="eyebrow">출처에서 관련 안내로</p>
        <h1 id="knowledge-source-library-heading">법령과 판례가 어떤 생활법률 안내에 쓰였는지 확인합니다.</h1>
        <p>승인된 콘텐츠에서 실제 참조하는 공식 근거만 모았습니다. 조문번호나 판례 사건번호로 찾고, 원문과 연결된 안내를 함께 확인할 수 있습니다.</p>
      </header>
      <KnowledgeSourceLibrary documents={documents} />
    </main>
  );
}
