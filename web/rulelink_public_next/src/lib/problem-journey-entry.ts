import {problemJourneyDefinitions} from './problem-journey-definitions.ts';
import type {PublicKnowledgeEntry, PublicKnowledgeHub} from '../types/publication.ts';

export function problemJourneyForEntry(entry: PublicKnowledgeEntry, hubs: readonly PublicKnowledgeHub[]): string | null {
  const definition = problemJourneyDefinitions.find(item => item.routes.some(route => route.contentIds.includes(entry.content_id)));
  const hub = definition && hubs.find(item => item.hub_id === definition.hubId);
  return hub ? `/ko/hubs/${hub.slug}#my-situation` : null;
}
