export const DEFAULT_CORE_KNOWLEDGE_HUB_COUNT = 8;

export type KnowledgeHubDirectoryItem = {
  hub_id: string;
  title_ko: string;
  description_ko: string;
};

type KnowledgeHubDirectoryOptions = {
  coreLimit?: number;
  expanded: boolean;
  query: string;
};

export function selectVisibleKnowledgeHubs<T extends KnowledgeHubDirectoryItem>(
  hubs: readonly T[],
  {
    coreLimit = DEFAULT_CORE_KNOWLEDGE_HUB_COUNT,
    expanded,
    query,
  }: KnowledgeHubDirectoryOptions,
): T[] {
  const normalizedQuery = normalizeKnowledgeHubQuery(query);
  if (normalizedQuery) {
    return hubs.filter(hub => normalizeKnowledgeHubQuery([
      hub.title_ko,
      hub.description_ko,
    ].join(' ')).includes(normalizedQuery));
  }
  if (expanded) return [...hubs];
  return hubs.slice(0, normalizeCoreLimit(coreLimit, hubs.length));
}

export function normalizeKnowledgeHubQuery(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function normalizeCoreLimit(limit: number, total: number): number {
  if (!Number.isInteger(limit) || limit <= 0) return 0;
  return Math.min(limit, total);
}
