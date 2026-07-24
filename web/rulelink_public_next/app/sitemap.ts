import type {MetadataRoute} from 'next';

export const revalidate = 3600;

import {
  listAuthorityReadingUnits,
  listChangeBriefs,
  listConceptCards,
  listKnowledgeEntries,
  listKnowledgeHubs,
  listKnowledgeSourceDocuments,
  listPublishedCards,
  listPublishedTopics,
} from '@/lib/publication';
import {site} from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!site.indexing) return [];
  const [
    cards,
    topics,
    changeBriefs,
    concepts,
    knowledgeEntries,
    knowledgeHubs,
    knowledgeSources,
    authorityReadingUnits,
  ] = await Promise.all([
    listPublishedCards(),
    listPublishedTopics(),
    listChangeBriefs(),
    listConceptCards(),
    listKnowledgeEntries(),
    listKnowledgeHubs(),
    listKnowledgeSourceDocuments(),
    listAuthorityReadingUnits(),
  ]);
  return [
    {url: site.url, changeFrequency: 'weekly', priority: 1},
    {url: `${site.url}/ko/method`, changeFrequency: 'monthly', priority: 0.5},
    {url: `${site.url}/ko/search`, changeFrequency: 'weekly', priority: 0.95},
    ...(changeBriefs.length ? [{
      url: `${site.url}/ko/changes`,
      changeFrequency: 'weekly' as const,
      priority: 0.95,
    }] : []),
    ...changeBriefs.map(brief => ({
      url: `${site.url}/ko/changes/${brief.slug}`,
      lastModified: new Date(brief.reviewed_at),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...cards.map(card => ({
      url: `${site.url}/ko/issues/${card.slug}`,
      lastModified: new Date(card.reviewed_at),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...topics.map(topic => ({
      url: `${site.url}/ko/topics/${topic.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...(concepts.length ? [{
      url: `${site.url}/ko/concepts`,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    }] : []),
    ...concepts.map(concept => ({
      url: `${site.url}/ko/concepts/${concept.slug}`,
      lastModified: new Date(concept.reviewed_at),
      changeFrequency: 'monthly' as const,
      priority: 0.82,
    })),
    ...authorityReadingUnits.map(unit => ({
      url: `${site.url}${unit.routeHref}`,
      lastModified: new Date(unit.source.last_verified_at),
      changeFrequency: 'monthly' as const,
      priority: 0.82,
    })),
    ...(knowledgeEntries.length ? [{
      url: `${site.url}/ko/knowledge`,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }] : []),
    ...knowledgeEntries.map(entry => ({
      url: `${site.url}/ko/knowledge/${entry.slug}`,
      lastModified: new Date(entry.reviewed_at),
      changeFrequency: 'monthly' as const,
      priority: 0.85,
    })),
    ...(knowledgeSources.length ? [{
      url: `${site.url}/ko/sources`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }] : []),
    ...knowledgeHubs.map(hub => ({
      url: `${site.url}/ko/hubs/${hub.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    })),
  ];
}
