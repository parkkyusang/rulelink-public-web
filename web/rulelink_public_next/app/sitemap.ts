import type {MetadataRoute} from 'next';

import {listChangeBriefs, listPublishedCards, listPublishedTopics} from '@/lib/publication';
import {site} from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!site.indexing) return [];
  const [cards, topics, changeBriefs] = await Promise.all([
    listPublishedCards(),
    listPublishedTopics(),
    listChangeBriefs(),
  ]);
  return [
    {url: site.url, changeFrequency: 'weekly', priority: 1},
    {url: `${site.url}/ko/method`, changeFrequency: 'monthly', priority: 0.5},
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
  ];
}
