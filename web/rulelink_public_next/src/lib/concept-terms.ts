import type {
  PublicConceptCard,
  PublicConceptTermRelation,
  PublicKnowledgeSource,
} from '@/types/publication';

const wordCharacterPattern = /[\p{L}\p{N}_]/u;
const koreanTermBoundarySuffixes = [
  // 체언 뒤에 붙는 조사뿐 아니라 법률 설명에서 자주 쓰는 서술격·인용·관형형 어미도 경계로 본다.
  '이었다는', '였다는', '이었다고', '였다고', '이었는지', '였는지',
  '이라는', '라는', '이라고', '라고', '이란', '란', '인지', '인가', '인', '이다', '다',
  '에게서는', '한테서는', '으로서는', '으로써는',
  '에게서', '한테서', '으로서', '으로써',
  '에게는', '한테는', '에서는', '께서는',
  '에게', '한테', '에서', '부터', '까지', '처럼', '보다', '조차', '마저',
  '이라도', '이라고', '이라며', '이며', '이나', '이랑', '께서', '께',
  '으로', '로서', '로써',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로', '나', '랑', '며', '하고',
  '들',
].sort((left, right) => right.length - left.length);

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
    .sort((left, right) => right.length - left.length || left.localeCompare(right, 'ko'));
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
    const end = start + term.length;
    const prefix = start > 0 ? text.slice(0, start).at(-1) ?? '' : '';

    // 짧은 용어가 더 긴 복합어 내부에서 잘못 잡히는 것을 막는다.
    // 오른쪽은 한국어 조사와 복수 표지에 한해 붙여 쓸 수 있다.
    if (prefix && wordCharacterPattern.test(prefix)) continue;
    if (!hasConceptTermSuffixBoundary(text, end)) continue;

    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(term);
    cursor = end;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : [text];
}

export function validateConceptTermRelations(
  concepts: readonly PublicConceptCard[],
  sources: readonly PublicKnowledgeSource[],
): void {
  const sourceIds = new Set(sources.map(source => source.coordinate_id));
  const ownerByTerm = new Map<string, {conceptId: string; term: string}>();

  for (const concept of concepts) {
    const preferred = concept.preferred_term_ko.trim();
    if (!preferred) throw new Error(`${concept.concept_id}의 대표 용어가 비어 있습니다.`);
    claimConceptTerm(ownerByTerm, preferred, concept.concept_id);

    const declaredAliases = concept.aliases_ko ?? [];
    const preferredKey = normalizeConceptTermKey(preferred);
    const aliasKeys = new Set<string>();
    for (const aliasValue of declaredAliases) {
      const alias = aliasValue.trim();
      if (!alias) throw new Error(`${concept.concept_id}의 검색 별칭이 비어 있습니다.`);
      const aliasKey = normalizeConceptTermKey(alias);
      if (aliasKey === preferredKey) {
        throw new Error(`${concept.concept_id}의 대표 용어가 검색 별칭과 중복되어 있습니다: ${preferred}`);
      }
      if (aliasKeys.has(aliasKey)) {
        throw new Error(`${concept.concept_id}의 검색 별칭이 중복되어 있습니다: ${alias}`);
      }
      aliasKeys.add(aliasKey);
      claimConceptTerm(ownerByTerm, alias, concept.concept_id);
    }

    if (concept.term_relations === undefined) continue;
    const relatedTermKeys = new Set<string>();

    for (const relation of concept.term_relations) {
      const term = relation.term_ko.trim();
      if (!term) throw new Error(`${concept.concept_id}의 용어 관계에 빈 표현이 있습니다.`);
      const termKey = normalizeConceptTermKey(term);
      if (!aliasKeys.has(termKey)) {
        throw new Error(`${concept.concept_id}의 용어 관계가 aliases_ko에 없는 표현을 사용합니다: ${term}`);
      }
      if (relatedTermKeys.has(termKey)) {
        throw new Error(`${concept.concept_id}의 용어 관계가 중복되었습니다: ${term}`);
      }
      relatedTermKeys.add(termKey);
      if (!relation.source_coordinate_ids.length) {
        throw new Error(`${concept.concept_id}의 용어 관계에 공식 근거가 없습니다: ${term}`);
      }
      for (const sourceId of relation.source_coordinate_ids) {
        if (!sourceIds.has(sourceId)) {
          throw new Error(`${concept.concept_id}의 용어 관계 근거가 존재하지 않습니다: ${term} -> ${sourceId}`);
        }
      }
    }

    for (const aliasKey of aliasKeys) {
      if (!relatedTermKeys.has(aliasKey)) {
        const alias = declaredAliases.find(value => normalizeConceptTermKey(value) === aliasKey) ?? aliasKey;
        throw new Error(`${concept.concept_id}의 검색 별칭에 관계 분류가 없습니다: ${alias}`);
      }
    }
  }
}

export function normalizeConceptTermKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/gu, ' ').trim();
}

function claimConceptTerm(
  owners: Map<string, {conceptId: string; term: string}>,
  term: string,
  conceptId: string,
) {
  const key = normalizeConceptTermKey(term);
  const owner = owners.get(key);
  if (owner && owner.conceptId !== conceptId) {
    throw new Error(`법률개념 대표 용어·별칭이 여러 개념에 중복되었습니다: ${term} -> ${owner.conceptId}, ${conceptId}`);
  }
  if (!owner) owners.set(key, {conceptId, term});
}

function hasConceptTermSuffixBoundary(text: string, end: number): boolean {
  const suffix = text.slice(end);
  if (!suffix || !wordCharacterPattern.test(suffix[0])) return true;

  let cursor = 0;
  let matchedPostposition = false;
  while (cursor < suffix.length && wordCharacterPattern.test(suffix[cursor])) {
    const postposition = koreanTermBoundarySuffixes.find(candidate => suffix.startsWith(candidate, cursor));
    if (!postposition) return false;
    matchedPostposition = true;
    cursor += postposition.length;
  }
  return matchedPostposition;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
