import type {Metadata} from 'next';
import type {ReactNode} from 'react';

import {SiteHeader} from '@/components/site-header';
import {site} from '@/lib/site';
import {editorialPreviewEnabled, listConceptCards} from '@/lib/publication';
import {serializeStructuredData} from '@/lib/structured-data';

import './globals.css';

export const revalidate = 3600;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {default: site.name, template: `%s | ${site.name}`},
  description: site.description,
  robots: {index: site.indexing, follow: site.indexing},
  alternates: {
    canonical: '/',
    types: {'application/rss+xml': `${site.url}/feed.xml`},
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: site.name,
    title: site.name,
    description: site.description,
    url: site.url,
  },
};

export default async function RootLayout({children}: {children: ReactNode}) {
  const preview = editorialPreviewEnabled();
  const hasConcepts = (await listConceptCards()).length > 0;
  return (
    <html lang="ko">
      <head>
        <link href={`${site.url}/feed.xml`} rel="alternate" title={`${site.name} 새로 바뀌는 법`} type="application/rss+xml" />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{__html: serializeStructuredData({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': `${site.url}/#website`,
            name: site.name,
            url: site.url,
            description: site.description,
            inLanguage: 'ko-KR',
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${site.url}/ko/search?q={search_term_string}`,
              },
              'query-input': 'required name=search_term_string',
            },
          })}}
          type="application/ld+json"
        />
        {preview ? <div className="previewBanner">내부 편집 미리보기 · 외부 공개 및 법률정보 이용 금지</div> : null}
        <SiteHeader hasConcepts={hasConcepts} preview={preview} siteName={site.name} />
        {children}
        <footer className="siteFooter">
          <strong>{site.name}</strong>
          <span>일반 법률정보만 제공합니다. 구체 사건의 결론·승소 가능성·대응전략·서면 방향은 변호사와 직접 상담해야 합니다.</span>
        </footer>
      </body>
    </html>
  );
}
