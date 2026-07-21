export type HomepageKnowledgeLike = {
  content_id: string;
  title_ko: string;
  reviewed_at: string;
  hub_ids: string[];
};

export function selectHomepageKnowledge<T extends HomepageKnowledgeLike>(
  entries: readonly T[],
  limit = 6,
): T[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];

  const sorted = [...entries].sort((left, right) => (
    right.reviewed_at.localeCompare(left.reviewed_at)
      || left.title_ko.localeCompare(right.title_ko, 'ko')
      || left.content_id.localeCompare(right.content_id)
  ));
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const coveredHubs = new Set<string>();

  for (const entry of sorted) {
    if (selected.length >= limit) break;
    if (!entry.hub_ids.some(hubId => !coveredHubs.has(hubId))) continue;
    selected.push(entry);
    selectedIds.add(entry.content_id);
    for (const hubId of entry.hub_ids) coveredHubs.add(hubId);
  }

  for (const entry of sorted) {
    if (selected.length >= limit) break;
    if (selectedIds.has(entry.content_id)) continue;
    selected.push(entry);
    selectedIds.add(entry.content_id);
  }

  return selected;
}
