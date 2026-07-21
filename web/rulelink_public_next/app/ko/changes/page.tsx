import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {ChangeExplorer} from '@/components/change-explorer';
import {listChangeBriefs} from '@/lib/publication';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '법령 변화',
  description: '시행 예정·최근 시행 법령을 구법과 현행법의 차이, 적용 경계, 준비사항 중심으로 찾아봅니다.',
  alternates: {canonical: '/ko/changes'},
  openGraph: {
    type: 'website',
    title: '법령 변화',
    description: '시행 예정·최근 시행 법령을 구법과 현행법의 차이, 적용 경계, 준비사항 중심으로 찾아봅니다.',
    url: '/ko/changes',
  },
};

export default async function ChangeLibraryPage() {
  const briefs = await listChangeBriefs();
  if (!briefs.length) notFound();
  const canonicalUrl = `${site.url}/ko/changes`;
  const futureCount = briefs.filter(brief => brief.lifecycle === 'future_effective').length;
  const recentCount = briefs.filter(brief => brief.lifecycle === 'recently_effective').length;
  const currentCount = briefs.filter(brief => brief.lifecycle === 'currently_effective').length;
  return (
    <main className="topicPage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': canonicalUrl,
          url: canonicalUrl,
          name: '법령 변화',
          description: metadata.description,
          inLanguage: 'ko-KR',
          isPartOf: {
            '@type': 'WebSite',
            name: site.name,
            url: site.url,
          },
          numberOfItems: briefs.length,
          hasPart: briefs.map(brief => ({
            '@type': 'WebPage',
            name: brief.title_ko,
            description: brief.summary_ko,
            url: `${site.url}/ko/changes/${brief.slug}`,
            dateModified: brief.reviewed_at,
          })),
        })}}
        type="application/ld+json"
      />
      <nav className="breadcrumb"><a href="/">홈</a><span>/</span><span>법령 변화</span></nav>
      <header className="topicHero">
        <p className="eyebrow">현행법과 구법 사이</p>
        <h1 id="change-library-heading">언제부터 무엇이 달라지는지 찾습니다.</h1>
        <p>공식 원문과 시행 시점을 확인한 승인 출판본만 모았습니다. 법 이름뿐 아니라 영향을 받는 사람과 준비사항으로도 검색할 수 있습니다.</p>
      </header>
      <div className="trustRail" aria-label="법령 변화 현황">
        <span><b>{String(briefs.length).padStart(2, '0')}</b> 전체 변화</span>
        <span><b>{String(futureCount).padStart(2, '0')}</b> 시행 예정</span>
        <span><b>{String(recentCount).padStart(2, '0')}</b> 최근 시행</span>
        <span><b>{String(currentCount).padStart(2, '0')}</b> 현행 제도</span>
      </div>
      <ChangeExplorer briefs={briefs} />
    </main>
  );
}
