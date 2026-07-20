import type {Metadata} from 'next';
import type {ReactNode} from 'react';

import {site} from '@/lib/site';
import {editorialPreviewEnabled} from '@/lib/publication';
import {serializeStructuredData} from '@/lib/structured-data';

import './globals.css';

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

export default function RootLayout({children}: {children: ReactNode}) {
  const preview = editorialPreviewEnabled();
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
            name: site.name,
            url: site.url,
            description: site.description,
            inLanguage: 'ko-KR',
          })}}
          type="application/ld+json"
        />
        {preview ? <div className="previewBanner">내부 편집 미리보기 · 외부 공개 및 법률정보 이용 금지</div> : null}
        <header className="siteHeader">
          <a className="brand" href="/">{site.name}</a>
          <nav aria-label="주요 메뉴" className="siteNav">
            {preview ? <a href="/editorial">편집 운영</a> : null}
            <a href="/#issues">상황별 법률정보</a>
            <a href="/ko/method">콘텐츠 원칙</a>
          </nav>
        </header>
        {children}
        <footer className="siteFooter">
          <strong>{site.name}</strong>
          <span>일반적인 법률정보를 제공하며, 개별 사건에 대한 법률의견을 대신하지 않습니다.</span>
        </footer>
      </body>
    </html>
  );
}
