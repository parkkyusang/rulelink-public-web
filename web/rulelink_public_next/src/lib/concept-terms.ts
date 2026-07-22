import type {
  PublicConceptCard,
  PublicConceptTermRelation,
  PublicKnowledgeSource,
} from '@/types/publication';

const wordPrefixPattern = /[\p{L}\p{N}_]/u;

const inlineRelationKinds = new Set<PublicConceptTermRelation['relation']>([
  'exact_synonym',
  'abbreviation',
  'spelling_variant',
]);

export function inlineTermsForConcept(
  concept: Pick<PublicConceptCard, 'preferred_term_ko' | 'term_relations'>,
): string[] {
  const candidates = [
    concept.preferred_term_ko,
    ...(concept.term_relations ?? [])
      .filter(relation => (
        inlineRelationKinds.has(relation.relation)
        && relation.source_coordinate_ids.length > 0
      ))
      .map(relation => relation.term_ko),
  ];
  const seen = new Set<string>();
  return candidates
    .map(term => term.trim())
    .filter(term => term.length > 0 && !seen.has(term) && Boolean(seen.add(term)));
}

export function splitTextByConceptTerms(text: string, terms: readonly string[]): string[] {
  const normalizedTerms = [...new Set(terms.map(term => term.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  if (!normalizedTerms.length) return [text];

  const candidatePattern = new RegExp(
    `(?:${normalizedTerms.map(escapeRegExp).join('|')})`,
    'gu',
  );
  const parts: string[] = [];
  let cursor = 0;

  for (const match of text.matchAll(candidatePattern)) {
    const start = match.index;
    const term = match[0];
    const prefix = start > 0 ? text.slice(0, start).at(-1) ?? '' : '';

    // 상속인이 법정상속인·공동상속인·피상속인의 뒷부분으로 잡히는 것을 막는다.
    // 뒤쪽 조사는 허용해야 하므로 앞쪽 문자 경계만 제한한다.
    if (prefix && wordPrefixPattern.test(prefix)) continue;

    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(term);
    cursor = start + term.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : [text];
}

export function validateConceptTermRelations(
  concepts: readonly PublicConceptCard[],
  sources: readonly PublicKnowledgeSource[],
): void {
  const sourceIds = new Set(sources.map(source => source.coordinate_id));
  const inlineOwnerByTerm = new Map<string, string>();

  for (const concept of concepts) {
    const preferred = concept.preferred_term_ko.trim();
    if (!preferred) throw new Error(`${concept.concept_id}의 대표 용어가 비어 있습니다.`);
    claimInlineTerm(inlineOwnerByTerm, preferred, concept.concept_id);

    const declaredAliases = concept.aliases_ko ?? [];
    if (declaredAliases.some(alias => alias.trim() === preferred)) {
      throw new Error(`${concept.concept_id}의 대표 용어가 검색 별칭에 중복되어 있습니다: ${preferred}`);
    }

    if (concept.term_relations === undefined) continue;
    const aliases = new Set(declaredAliases.map(alias => alias.trim()).filter(Boolean));
    const relatedTerms = new Set<string>();

    for (const relation of concept.term_relations) {
      const term = relation.term_ko.trim();
      if (!term) throw new Error(`${concept.concept_id}의 용어 관계에 빈 표현이 있습니다.`);
      if (!aliases.has(term)) {
        throw new Error(`${concept.concept_id}의 용어 관계가 aliases_ko에 없는 표현을 사용합니다: ${term}`);
      }
      if (relatedTerms.has(term)) {
        throw new Error(`${concept.concept_id}의 용어 관계가 중복되었습니다: ${term}`);
      }
      relatedTerms.add(term);
      if (!relation.source_coordinate_ids.length) {
        throw new Error(`${concept.concept_id}의 용어 관계에 공식 근거가 없습니다: ${term}`);
      }
      for (const sourceId of relation.source_coordinate_ids) {
        if (!sourceIds.has(sourceId)) {
          throw new Error(`${concept.concept_id}의 용어 관계 근거가 존재하지 않습니다: ${term} -> ${sourceId}`);
        }
      }
      if (inlineRelationKinds.has(relation.relation)) {
        claimInlineTerm(inlineOwnerByTerm, term, concept.concept_id);
      }
    }

    for (const alias of aliases) {
      if (!relatedTerms.has(alias)) {
        throw new Error(`${concept.concept_id}의 검색 별칭에 관계 분류가 없습니다: ${alias}`);
      }
    }
  }
}

function claimInlineTerm(owners: Map<string, string>, term: string, conceptId: string) {
  const owner = owners.get(term);
  if (owner && owner !== conceptId) {
    throw new Error(`본문 자동 해설 용어가 여러 개념에 중복되었습니다: ${term} -> ${owner}, ${conceptId}`);
  }
  owners.set(term, conceptId);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
