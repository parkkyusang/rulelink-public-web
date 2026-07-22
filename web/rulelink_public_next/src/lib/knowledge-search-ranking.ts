import type {PublicKnowledgeSearchDocument, PublicKnowledgeSearchEntry} from './knowledge-search';

type KnowledgeSearchOptions = {
  contentTypeLabel?: (type: PublicKnowledgeSearchEntry['content_type']) => string;
  hubId: string;
  query: string;
};

export function filterAndRankKnowledgeDocuments(
  documents: PublicKnowledgeSearchDocument[],
  {contentTypeLabel, hubId, query}: KnowledgeSearchOptions,
): PublicKnowledgeSearchDocument[] {
  const normalizedQuery = normalizeKnowledgeSearchText(query);
  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return documents
    .map(document => ({document, score: scoreKnowledgeDocument(document, normalizedQuery, tokens, contentTypeLabel)}))
    .filter(({document, score}) => (
      (hubId === 'all' || document.entry.hub_ids.includes(hubId))
      && score !== null
    ))
    .sort((left, right) => (
      (right.score ?? 0) - (left.score ?? 0)
      || right.document.entry.reviewed_at.localeCompare(left.document.entry.reviewed_at)
      || left.document.entry.title_ko.localeCompare(right.document.entry.title_ko, 'ko')
    ))
    .map(({document}) => document);
}

export function normalizeKnowledgeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function scoreKnowledgeDocument(
  document: PublicKnowledgeSearchDocument,
  normalizedQuery: string,
  tokens: string[],
  contentTypeLabel?: KnowledgeSearchOptions['contentTypeLabel'],
): number | null {
  if (!tokens.length) return 0;

  const entry = document.entry;
  const title = normalizeKnowledgeSearchText(entry.title_ko);
  const answer = normalizeKnowledgeSearchText(entry.one_line_answer_ko);
  const situation = normalizeKnowledgeSearchText(entry.audience_situation_ko);
  const contentType = normalizeKnowledgeSearchText(contentTypeLabel?.(entry.content_type) || entry.content_type || '법률정보');
  const evidence = normalizeKnowledgeSearchText(document.evidence_labels_ko.join(' '));
  const details = normalizeKnowledgeSearchText(document.search_terms_ko.join(' '));
  const searchable = [title, answer, situation, contentType, evidence, details].join(' ');
  if (tokens.some(token => !searchable.includes(token))) return null;

  let score = title === normalizedQuery ? 120 : title.includes(normalizedQuery) ? 40 : 0;
  if (answer.includes(normalizedQuery)) score += 20;
  if (situation.includes(normalizedQuery)) score += 16;
  for (const token of tokens) {
    if (title.includes(token)) score += 24;
    if (answer.includes(token)) score += 12;
    if (situation.includes(token)) score += 10;
    if (contentType.includes(token)) score += 8;
    if (evidence.includes(token)) score += 7;
    if (details.includes(token)) score += 3;
  }
  return score;
}
