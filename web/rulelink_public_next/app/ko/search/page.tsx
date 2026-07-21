import type {Metadata} from 'next';

import {SiteSearch} from '@/components/site-search';
import {listChangeBriefs, listKnowledgeSearchDocuments, listPublishedCards, listPublishedTopics} from '@/lib/publication';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '법률정보 찾기',
  description: '승인된 법률정보를 내 상황, 법 이름, 조문번호와 판례 사건번호로 한 번에 찾아봅니다.',
  alternates: {canonical: '/ko/search'},
  openGraph: {
    type: 'website',
    title: '법률정보 찾기',
    description: '승인된 법률정보를 내 상황, 법 이름, 조문번호와 판례 사건번호로 한 번에 찾아봅니다.',
    url: '/ko/search',
  },
};

export default async function SearchPage() {
  const [cards, changeBriefs, knowledgeDocuments, topics] = await Promise.all([
    listPublishedCards(),
    listChangeBriefs(),
    listKnowledgeSearchDocuments(),
    listPublishedTopics(),
  ]);
  const canonicalUrl = `${site.url}/ko/search`;
  const parts = [
    ...cards.map(card => ({
      name: card.title_ko,
      description: card.audience_situation_ko,
      url: `${site.url}/ko/issues/${card.slug}`,
      dateModified: card.reviewed_at,
    })),
    ...knowledgeDocuments.map(({entry}) => ({
      name: entry.title_ko,
      description: entry.one_line_answer_ko,
      url: `${site.url}/ko/knowledge/${entry.slug}`,
      dateModified: entry.reviewed_at,
    })),
    ...changeBriefs.map(brief => ({
      name: brief.title_ko,
      description: brief.summary_ko,
      url: `${site.url}/ko/changes/${brief.slug}`,
      dateModified: brief.reviewed_at,
    })),
  ];
  return (
    <main className="topicPage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': canonicalUrl,
          url: canonicalUrl,
          name: '법률정보 찾기',
          description: metadata.description,
          inLanguage: 'ko-KR',
          isPartOf: {
            '@type': 'WebSite',
            name: site.name,
            url: site.url,
          },
          numberOfItems: parts.length,
          hasPart: parts.map(part => ({'@type': 'WebPage', ...part})),
        })}}
        type="application/ld+json"
      />
      <nav aria-label="현재 위치" className="breadcrumb"><a href="/">홈</a><span aria-hidden="true">/</span><span>법률정보 찾기</span></nav>
      <header className="topicHero">
        <p className="eyebrow">승인된 공개 지식 전체</p>
        <h1 id="site-search-heading">글의 종류를 몰라도 내 상황에서 찾습니다.</h1>
        <p>상황, 법리, 결론을 가르는 사실, 조문번호와 판례 사건번호를 하나의 검색면에서 확인할 수 있습니다.</p>
      </header>
      <SiteSearch cards={cards} changeBriefs={changeBriefs} knowledgeDocuments={knowledgeDocuments} topics={topics} />
    </main>
  );
}
