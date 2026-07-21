export type StructuredBreadcrumb = {
  name: string;
  url: string;
};

export type StructuredOfficialSource = {
  name: string;
  url: string;
};

export type KnowledgePageStructuredDataInput = {
  audience: string;
  breadcrumbs: StructuredBreadcrumb[];
  description: string;
  expiresAt: string;
  officialSources: StructuredOfficialSource[];
  pageUrl: string;
  reviewedAt: string;
  rules: Array<{description: string; name: string}>;
  scenarios: Array<{
    decisionFact: string;
    falseOutcome: string;
    question: string;
    trueOutcome: string;
  }>;
  searchIntents: string[];
  siteName: string;
  siteUrl: string;
  title: string;
};

export type KnowledgeHubStructuredDataInput = {
  breadcrumbs: StructuredBreadcrumb[];
  description: string;
  entries: Array<{
    dateModified: string;
    description: string;
    name: string;
    url: string;
  }>;
  pageUrl: string;
  siteName: string;
  siteUrl: string;
  title: string;
};

export function buildKnowledgePageStructuredData(input: KnowledgePageStructuredDataInput) {
  const pageId = input.pageUrl + '#webpage';
  const breadcrumbId = input.pageUrl + '#breadcrumb';
  const officialSources = uniqueOfficialSources(input.officialSources);
  const page: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': pageId,
    url: input.pageUrl,
    name: input.title,
    description: input.description,
    keywords: input.searchIntents,
    inLanguage: 'ko-KR',
    dateModified: input.reviewedAt,
    lastReviewed: input.reviewedAt,
    expires: input.expiresAt,
    audience: {
      '@type': 'PeopleAudience',
      audienceType: input.audience,
    },
    isPartOf: {
      '@id': websiteId(input.siteUrl),
      '@type': 'WebSite',
      name: input.siteName,
      url: input.siteUrl,
    },
    breadcrumb: {'@id': breadcrumbId},
  };
  if (officialSources.length) {
    page.isBasedOn = officialSources.map(source => ({
      '@type': 'CreativeWork',
      '@id': source.url,
      name: source.name,
      url: source.url,
    }));
    page.significantLink = officialSources.map(source => source.url);
  }
  if (input.rules.length) {
    page.about = input.rules.map(rule => ({
      '@type': 'DefinedTerm',
      name: rule.name,
      description: rule.description,
    }));
  }
  if (input.scenarios.length) {
    page.hasPart = input.scenarios.map(scenario => ({
      '@type': 'WebPageElement',
      name: scenario.question,
      description: scenario.decisionFact,
      text: `해당하면: ${scenario.trueOutcome} 해당하지 않으면: ${scenario.falseOutcome}`,
    }));
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      page,
      buildBreadcrumbList(breadcrumbId, input.breadcrumbs),
    ],
  };
}

export function buildKnowledgeHubStructuredData(input: KnowledgeHubStructuredDataInput) {
  const pageId = input.pageUrl + '#webpage';
  const itemsId = input.pageUrl + '#items';
  const breadcrumbId = input.pageUrl + '#breadcrumb';
  const latestModified = input.entries.reduce(
    (latest, entry) => entry.dateModified > latest ? entry.dateModified : latest,
    '',
  );
  const page: Record<string, unknown> = {
    '@type': 'CollectionPage',
    '@id': pageId,
    url: input.pageUrl,
    name: input.title,
    description: input.description,
    inLanguage: 'ko-KR',
    isPartOf: {
      '@id': websiteId(input.siteUrl),
      '@type': 'WebSite',
      name: input.siteName,
      url: input.siteUrl,
    },
    breadcrumb: {'@id': breadcrumbId},
    mainEntity: {'@id': itemsId},
    numberOfItems: input.entries.length,
    hasPart: input.entries.map(entry => ({'@id': entry.url + '#webpage'})),
  };
  if (latestModified) page.dateModified = latestModified;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      page,
      {
        '@type': 'ItemList',
        '@id': itemsId,
        numberOfItems: input.entries.length,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement: input.entries.map((entry, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'WebPage',
            '@id': entry.url + '#webpage',
            url: entry.url,
            name: entry.name,
            description: entry.description,
            dateModified: entry.dateModified,
          },
        })),
      },
      buildBreadcrumbList(breadcrumbId, input.breadcrumbs),
    ],
  };
}

function buildBreadcrumbList(id: string, breadcrumbs: StructuredBreadcrumb[]) {
  return {
    '@type': 'BreadcrumbList',
    '@id': id,
    itemListElement: breadcrumbs.map((breadcrumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: breadcrumb.name,
      item: breadcrumb.url,
    })),
  };
}

function uniqueOfficialSources(sources: StructuredOfficialSource[]): StructuredOfficialSource[] {
  const byUrl = new Map<string, StructuredOfficialSource>();
  for (const source of sources) {
    if (source.url && !byUrl.has(source.url)) byUrl.set(source.url, source);
  }
  return [...byUrl.values()];
}

function websiteId(siteUrl: string): string {
  return siteUrl.replace(/\/$/, '') + '/#website';
}
