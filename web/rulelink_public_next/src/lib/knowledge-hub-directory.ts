import type {KnowledgeHubDirectoryCategory} from './knowledge-hub-taxonomy';

export function filterKnowledgeHubDirectoryCategories(
  categories: readonly KnowledgeHubDirectoryCategory[],
  query: string,
): KnowledgeHubDirectoryCategory[] {
  const normalizedQuery = normalizeKnowledgeHubQuery(query);
  if (!normalizedQuery) {
    return categories.map(category => ({
      ...category,
      hubs: [...category.hubs],
    }));
  }
  return categories
    .map(category => ({
      ...category,
      hubs: category.hubs.filter(hub => (
        normalizeKnowledgeHubQuery([
          category.title_ko,
          hub.title_ko,
          hub.description_ko,
        ].join(' ')).includes(normalizedQuery)
      )),
    }))
    .filter(category => category.hubs.length > 0);
}

export function normalizeKnowledgeHubQuery(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
