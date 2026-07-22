import type {PublicKnowledgeEntry, PublicKnowledgeHub, PublicKnowledgeRelationType} from '@/types/publication';

const relationTypeOrder: PublicKnowledgeRelationType[] = [
  'prerequisite',
  'comparison',
  'deadline',
  'procedure',
  'remedy',
  'law_change',
  'concept',
  'concierge_boundary',
];

function relatedContentRelations(entry: PublicKnowledgeEntry): Array<{targetId: string; relationType?: PublicKnowledgeRelationType}> {
  if (Array.isArray(entry.related_edges)) {
    return entry.related_edges
      .filter(relation => relation.target_kind === 'content')
      .map(relation => ({targetId: relation.target_id, relationType: relation.relation_type}));
  }
  return entry.related_content_ids.map(targetId => ({targetId}));
}

export type KnowledgeHubConnection = {
  hub: PublicKnowledgeHub;
  bridgeEntries: PublicKnowledgeEntry[];
  connectionStrength: number;
  relationTypes: PublicKnowledgeRelationType[];
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

  const connections = new Map<string, {bridgeEntryIds: Set<string>; edgeKeys: Set<string>; relationTypes: Set<PublicKnowledgeRelationType>}>();
  const addConnection = (targetHubId: string, bridgeEntryId: string, edgeKey: string, relationType?: PublicKnowledgeRelationType) => {
    if (targetHubId === currentHub.hub_id || !hubById.has(targetHubId)) return;
    const connection = connections.get(targetHubId) ?? {bridgeEntryIds: new Set(), edgeKeys: new Set(), relationTypes: new Set()};
    connection.bridgeEntryIds.add(bridgeEntryId);
    connection.edgeKeys.add(edgeKey);
    if (relationType) connection.relationTypes.add(relationType);
    connections.set(targetHubId, connection);
  };

  for (const sourceEntry of entries) {
    const sourceHubIds = hubIdsByContentId.get(sourceEntry.content_id) ?? [];
    for (const relation of relatedContentRelations(sourceEntry)) {
      const relatedContentId = relation.targetId;
      const targetEntry = entryById.get(relatedContentId);
      if (!targetEntry) continue;
      const targetHubIds = hubIdsByContentId.get(targetEntry.content_id) ?? [];
      const edgeKey = [sourceEntry.content_id, targetEntry.content_id].sort().join('|');

      if (sourceHubIds.includes(currentHub.hub_id)) {
        for (const targetHubId of targetHubIds) addConnection(targetHubId, targetEntry.content_id, edgeKey, relation.relationType);
      }
      if (targetHubIds.includes(currentHub.hub_id)) {
        for (const sourceHubId of sourceHubIds) addConnection(sourceHubId, sourceEntry.content_id, edgeKey, relation.relationType);
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
      relationTypes: relationTypeOrder.filter(type => connection.relationTypes.has(type)),
    }))
    .sort((left, right) => (
      right.connectionStrength - left.connectionStrength
      || left.hub.title_ko.localeCompare(right.hub.title_ko, 'ko')
    ))
    .slice(0, limit);
}
