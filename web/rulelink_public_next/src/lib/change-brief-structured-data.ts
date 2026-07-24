export type ChangeBriefStructuredDataInput = {
  articleNo: string;
  dateModified: string;
  description: string;
  lawNameKo: string;
  officialSourceUrls: string[];
  pageUrl: string;
  siteName: string;
  siteUrl: string;
  title: string;
};

export function buildChangeBriefStructuredData(input: ChangeBriefStructuredDataInput) {
  const pageUrl = input.pageUrl;
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  const officialSourceUrls = [...new Set(input.officialSourceUrls.filter(Boolean))];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${pageUrl}#article`,
        headline: input.title,
        description: input.description,
        dateModified: input.dateModified,
        mainEntityOfPage: pageUrl,
        inLanguage: 'ko-KR',
        about: `${input.lawNameKo} ${input.articleNo}`,
        isBasedOn: officialSourceUrls,
        breadcrumb: {'@id': breadcrumbId},
        isPartOf: {
          '@type': 'WebSite',
          '@id': `${input.siteUrl.replace(/\/$/u, '')}/#website`,
          name: input.siteName,
          url: input.siteUrl,
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement: [
          breadcrumbItem(1, '홈', input.siteUrl),
          breadcrumbItem(2, '법령 변화', new URL('/ko/changes', input.siteUrl).href),
          breadcrumbItem(3, input.title, pageUrl),
        ],
      },
    ],
  };
}

function breadcrumbItem(position: number, name: string, item: string) {
  return {
    '@type': 'ListItem',
    position,
    name,
    item,
  };
}
