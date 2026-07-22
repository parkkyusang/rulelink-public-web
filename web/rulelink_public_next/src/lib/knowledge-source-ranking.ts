import type {PublicKnowledgeSourceDocument} from './knowledge-search';

export type KnowledgeSourceFilter = 'all' | 'statute' | 'precedent' | 'official_document';

type KnowledgeSourceSearchOptions = {
  filter: KnowledgeSourceFilter;
  query: string;
};

export function filterAndRankKnowledgeSourceDocuments(
  documents: PublicKnowledgeSourceDocument[],
  {filter, query}: KnowledgeSourceSearchOptions,
): PublicKnowledgeSourceDocument[] {
  const normalizedQuery = normalizeKnowledgeSourceSearchText(query);
  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return documents
    .map(document => ({document, score: scoreSourceDocument(document, normalizedQuery, tokens)}))
    .filter(({document, score}) => (
      (filter === 'all' || knowledgeSourceKind(document) === filter)
      && score !== null
    ))
    .sort((left, right) => {
      if (tokens.length && left.score !== right.score) return (right.score ?? 0) - (left.score ?? 0);
      const leftKind = knowledgeSourceKind(left.document);
      const rightKind = knowledgeSourceKind(right.document);
      if (leftKind !== rightKind) {
        const order = {precedent: 0, official_document: 1, statute: 2};
        return order[leftKind] - order[rightKind];
      }
      const leftLinks = left.document.entries.length + left.document.concepts.length;
      const rightLinks = right.document.entries.length + right.document.concepts.length;
      return rightLinks - leftLinks || left.document.label_ko.localeCompare(right.document.label_ko, 'ko');
    })
    .map(({document}) => document);
}

export function knowledgeSourceKind(
  document: PublicKnowledgeSourceDocument,
): Exclude<KnowledgeSourceFilter, 'all'> {
  const kind = document.source.source_kind;
  return kind === 'precedent' || kind === 'official_document' ? kind : 'statute';
}

export function normalizeKnowledgeSourceSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function scoreSourceDocument(
  document: PublicKnowledgeSourceDocument,
  normalizedQuery: string,
  tokens: string[],
): number | null {
  if (!tokens.length) return 0;
  const source = document.source;
  const direct = normalizeKnowledgeSourceSearchText([
    document.label_ko,
    source.source_id,
    source.source_kind === 'precedent'
      ? `${source.title_ko} ${source.case_number} ${source.decision_date}`
      : source.source_kind === 'official_document'
        ? `${source.title_ko} ${source.document_kind} ${source.promulgation_number} ${source.effective_date}`
        : `${source.law_name_ko} ${source.article_no}`,
  ].join(' '));
  const related = normalizeKnowledgeSourceSearchText(document.search_terms_ko.join(' '));
  const searchable = `${direct} ${related}`;
  if (tokens.some(token => !searchable.includes(token))) return null;

  const normalizedLabel = normalizeKnowledgeSourceSearchText(document.label_ko);
  let score = normalizedLabel === normalizedQuery ? 120 : direct.includes(normalizedQuery) ? 40 : 0;
  for (const token of tokens) {
    if (direct.includes(token)) score += 24;
    if (related.includes(token)) score += 3;
  }
  return score;
}
