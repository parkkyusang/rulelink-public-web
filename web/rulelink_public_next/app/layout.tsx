import type {Metadata} from 'next';
import type {ReactNode} from 'react';

import {SiteHeader} from '@/components/site-header';
import {site} from '@/lib/site';
import {editorialPreviewEnabled, listConceptCards} from '@/lib/publication';
import {resolvePublicTrustConfig} from '@/lib/public-trust';
import {serializeStructuredData} from '@/lib/structured-data';

import './globals.css';

export const revalidate = 3600;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {default: site.name, template: `%s | ${site.name}`},
  description: site.description,
  manifest: '/manifest.webmanifest',
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
  const trustConfig = resolvePublicTrustConfig();
  return (
    <html lang="ko">
      <head>
        <link href={`${site.url}/feed.xml`} rel="alternate" title={`${site.name} 새로 바뀌는 법`} type="application/rss+xml" />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: serializeStructuredData(buildSiteStructuredData(trustConfig)),
          }}
          type="application/ld+json"
        />
        {preview ? <div className="previewBanner">내부 편집 미리보기 · 외부 공개 및 법률정보 이용 금지</div> : null}
        <SiteHeader
          hasConcepts={hasConcepts}
          hasTrustPage={Boolean(trustConfig)}
          preview={preview}
          siteName={site.name}
        />
        {children}
        <footer className="siteFooter">
          <strong>{site.name}</strong>
          <span>일반 법률정보만 제공합니다. 구체 사건의 결론·승소 가능성·대응전략·서면 방향은 변호사와 직접 상담해야 합니다.</span>
          {trustConfig ? <a href="/ko/trust">운영·신뢰 원칙</a> : null}
        </footer>
      </body>
    </html>
  );
}

function buildSiteStructuredData(
  trustConfig: ReturnType<typeof resolvePublicTrustConfig>,
) {
  const website = {
    '@type': 'WebSite',
    '@id': `${site.url}/#website`,
    name: site.name,
    ...(site.englishName !== site.name
      ? {alternateName: site.englishName}
      : {}),
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
  };
  if (!trustConfig) {
    return {'@context': 'https://schema.org', ...website};
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        ...website,
        publisher: {'@id': `${site.url}/#organization`},
      },
      {
        '@type': 'Organization',
        '@id': `${site.url}/#organization`,
        name: trustConfig.operatorLegalName,
        url: site.url,
      },
    ],
  };
}
