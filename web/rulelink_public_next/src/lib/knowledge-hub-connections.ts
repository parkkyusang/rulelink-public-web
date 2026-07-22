import type {PublicKnowledgeEntry, PublicKnowledgeHub} from '@/types/publication';

export type KnowledgeHubConnection = {
  hub: PublicKnowledgeHub;
  bridgeEntries: PublicKnowledgeEntry[];
  connectionStrength: number;
};

export function buildKnowledgeHubConnections(
  entries: PublicKnowledgeEntry[],
  hubs: PublicKnowledgeHub[],
  currentHub: PublicKnowledgeHub,
  limit = 4,
): KnowledgeHubConnection[] {
  if (limit <= 0) return [];
  const entryById = new Map(entries.map(entry => [entry.content_id, entry]));
  const hubById = new Map(hubs.map(hub => [hub.hub_id, hub]));
  const hubIdsByContentId = new Map<string, string[]>();
  for (const hub of hubs) {
    for (const contentId of hub.content_ids) {
      if (!entryById.has(contentId)) continue;
      const linked = hubIdsByContentId.get(contentId) ?? [];
      if (!linked.includes(hub.hub_id)) linked.push(hub.hub_id);
      hubIdsByContentId.set(contentId, linked);
    }
  }

  const connections = new Map<string, {bridgeEntryIds: Set<string>; edgeKeys: Set<string>}>();
  const addConnection = (targetHubId: string, bridgeEntryId: string, edgeKey: string) => {
    if (targetHubId === currentHub.hub_id || !hubById.has(targetHubId)) return;
    const connection = connections.get(targetHubId) ?? {bridgeEntryIds: new Set(), edgeKeys: new Set()};
    connection.bridgeEntryIds.add(bridgeEntryId);
    connection.edgeKeys.add(edgeKey);
    connections.set(targetHubId, connection);
  };

  for (const sourceEntry of entries) {
    const sourceHubIds = hubIdsByContentId.get(sourceEntry.content_id) ?? [];
    for (const relatedContentId of sourceEntry.related_content_ids) {
      const targetEntry = entryById.get(relatedContentId);
      if (!targetEntry) continue;
      const targetHubIds = hubIdsByContentId.get(targetEntry.content_id) ?? [];
      const edgeKey = [sourceEntry.content_id, targetEntry.content_id].sort().join('|');

      if (sourceHubIds.includes(currentHub.hub_id)) {
        for (const targetHubId of targetHubIds) addConnection(targetHubId, targetEntry.content_id, edgeKey);
      }
      if (targetHubIds.includes(currentHub.hub_id)) {
        for (const sourceHubId of sourceHubIds) addConnection(sourceHubId, sourceEntry.content_id, edgeKey);
      }
    }
  }

  return [...connections.entries()]
    .map(([hubId, connection]) => ({
      hub: hubById.get(hubId)!,
      bridgeEntries: [...connection.bridgeEntryIds]
        .map(contentId => entryById.get(contentId))
        .filter((entry): entry is PublicKnowledgeEntry => Boolean(entry))
        .slice(0, 2),
      connectionStrength: connection.edgeKeys.size,
    }))
    .sort((left, right) => (
      right.connectionStrength - left.connectionStrength
      || left.hub.title_ko.localeCompare(right.hub.title_ko, 'ko')
    ))
    .slice(0, limit);
}
