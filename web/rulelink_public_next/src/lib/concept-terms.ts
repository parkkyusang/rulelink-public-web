import type {
  PublicConceptCard,
  PublicConceptTermRelation,
  PublicKnowledgeSource,
} from '@/types/publication';
import conceptIdentityPolicyRegistryJson from './concept-identity-policy.v1.json' with {type: 'json'};

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

const aliasRelationKinds = new Set<PublicConceptTermRelation['relation']>([
  ...inlineRelationKinds,
  'plain_language',
]);

const semanticRelationKinds = new Set<PublicConceptTermRelation['relation']>([
  'narrower',
  'broader',
  'related',
]);

export type ConceptIdentityPolicyKind =
  | 'protected_canonical_identity'
  | 'ambiguous_global_alias';

export type ConceptIdentityPolicyTerm = {
  term_ko: string;
  policy_kind: ConceptIdentityPolicyKind;
  meaning_domain: string;
  reason_ko: string;
};

export type ConceptIdentityPolicyRegistry = {
  schema: 'rulelink_public_concept_identity_policy_v1';
  policy_version: string;
  policy_receipt: string;
  terms: ConceptIdentityPolicyTerm[];
};

export const conceptIdentityPolicyRegistry = (
  conceptIdentityPolicyRegistryJson as unknown as ConceptIdentityPolicyRegistry
);

const policyRegistryErrors = auditConceptIdentityPolicyRegistry(conceptIdentityPolicyRegistry);
if (policyRegistryErrors.length) {
  throw new Error(policyRegistryErrors.join('\n'));
}

const protectedCanonicalIdentityTerms = policyTerms('protected_canonical_identity');
const ambiguousGlobalAliasTerms = policyTerms('ambiguous_global_alias');

export type ConceptTermValidationIssueCode =
  | 'empty-preferred-term'
  | 'empty-alias'
  | 'preferred-alias-duplicate'
  | 'duplicate-alias'
  | 'global-term-conflict'
  | 'protected-canonical-term-as-alias'
  | 'ambiguous-global-alias'
  | 'empty-relation-term'
  | 'duplicate-term-relation'
  | 'missing-relation-source'
  | 'missing-relation-source-target'
  | 'alias-relation-without-alias'
  | 'alias-without-relation'
  | 'semantic-relation-missing-target'
  | 'semantic-relation-target-not-found'
  | 'semantic-relation-self-reference'
  | 'semantic-relation-term-mismatch'
  | 'semantic-relation-missing-inverse'
  | 'semantic-relation-cycle';

export type ConceptTermValidationIssue = {
  code: ConceptTermValidationIssueCode;
  conceptIds: string[];
  message: string;
  term?: string;
};

export type ConceptTermValidationOptions = {
  legacyDebt?: ReadonlyMap<string, ReadonlySet<ConceptTermValidationIssueCode>>;
};

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
  options: ConceptTermValidationOptions = {},
): void {
  const issues = auditConceptTermRelations(concepts, sources)
    .filter(issue => !isAllowedLegacyIssue(issue, options.legacyDebt));
  if (issues.length) throw new Error(issues.map(issue => issue.message).join('\n'));
}

export function auditConceptTermRelations(
  concepts: readonly PublicConceptCard[],
  sources: readonly PublicKnowledgeSource[],
): ConceptTermValidationIssue[] {
  const issues: ConceptTermValidationIssue[] = [];
  const sourceIds = new Set(sources.map(source => source.coordinate_id));
  const ownerByTerm = new Map<string, {conceptId: string; term: string}>();
  const conceptById = new Map(concepts.map(concept => [concept.concept_id, concept]));
  const semanticRelations: Array<{
    conceptId: string;
    relation: PublicConceptTermRelation;
    targetConceptId: string;
  }> = [];

  for (const concept of concepts) {
    const preferred = concept.preferred_term_ko.trim();
    if (!preferred) {
      issues.push(issue('empty-preferred-term', [concept.concept_id], `${concept.concept_id}의 대표 용어가 비어 있습니다.`));
      continue;
    }
    claimConceptTerm(ownerByTerm, preferred, concept.concept_id, issues);

    const declaredAliases = concept.aliases_ko ?? [];
    const preferredKey = normalizeConceptTermKey(preferred);
    const aliasKeys = new Set<string>();
    for (const aliasValue of declaredAliases) {
      const alias = aliasValue.trim();
      if (!alias) {
        issues.push(issue('empty-alias', [concept.concept_id], `${concept.concept_id}의 검색 별칭이 비어 있습니다.`));
        continue;
      }
      const aliasKey = normalizeConceptTermKey(alias);
      if (aliasKey === preferredKey) {
        issues.push(issue(
          'preferred-alias-duplicate',
          [concept.concept_id],
          `${concept.concept_id}의 대표 용어가 검색 별칭과 중복되어 있습니다: ${preferred}`,
          alias,
        ));
      }
      if (aliasKeys.has(aliasKey)) {
        issues.push(issue(
          'duplicate-alias',
          [concept.concept_id],
          `${concept.concept_id}의 검색 별칭이 중복되어 있습니다: ${alias}`,
          alias,
        ));
      }
      aliasKeys.add(aliasKey);
      if (ambiguousGlobalAliasTerms.has(aliasKey)) {
        issues.push(issue(
          'ambiguous-global-alias',
          [concept.concept_id],
          `${concept.concept_id}의 검색 별칭은 법역에 따라 뜻이 달라 전역 별칭으로 사용할 수 없습니다: ${alias}`,
          alias,
        ));
      }
      if (protectedCanonicalIdentityTerms.has(aliasKey) && aliasKey !== preferredKey) {
        issues.push(issue(
          'protected-canonical-term-as-alias',
          [concept.concept_id],
          `${concept.concept_id}의 검색 별칭은 별도 canonical concept 정체성으로 관리해야 합니다: ${alias}`,
          alias,
        ));
      }
      claimConceptTerm(ownerByTerm, alias, concept.concept_id, issues);
    }

    if (concept.term_relations === undefined) continue;
    const relatedTermKeys = new Set<string>();

    for (const relation of concept.term_relations) {
      const term = relation.term_ko.trim();
      if (!term) {
        issues.push(issue('empty-relation-term', [concept.concept_id], `${concept.concept_id}의 용어 관계에 빈 표현이 있습니다.`));
        continue;
      }
      const termKey = normalizeConceptTermKey(term);
      const targetConceptId = 'target_concept_id' in relation ? relation.target_concept_id : undefined;
      const relationKey = `${relation.relation}:${targetConceptId ?? termKey}`;
      if (relatedTermKeys.has(relationKey)) {
        issues.push(issue(
          'duplicate-term-relation',
          [concept.concept_id],
          `${concept.concept_id}의 용어 관계가 중복되었습니다: ${relation.relation} ${term}`,
          term,
        ));
      }
      relatedTermKeys.add(relationKey);
      if (!relation.source_coordinate_ids.length) {
        issues.push(issue(
          'missing-relation-source',
          [concept.concept_id],
          `${concept.concept_id}의 용어 관계에 공식 근거가 없습니다: ${term}`,
          term,
        ));
      }
      for (const sourceId of relation.source_coordinate_ids) {
        if (!sourceIds.has(sourceId)) {
          issues.push(issue(
            'missing-relation-source-target',
            [concept.concept_id],
            `${concept.concept_id}의 용어 관계 근거가 존재하지 않습니다: ${term} -> ${sourceId}`,
            term,
          ));
        }
      }

      if (aliasRelationKinds.has(relation.relation)) {
        if (!aliasKeys.has(termKey)) {
          issues.push(issue(
            'alias-relation-without-alias',
            [concept.concept_id],
            `${concept.concept_id}의 동의·표기 관계가 aliases_ko에 없는 표현을 사용합니다: ${term}`,
            term,
          ));
        }
        continue;
      }
      if (!semanticRelationKinds.has(relation.relation)) continue;
      if (!targetConceptId) {
        issues.push(issue(
          'semantic-relation-missing-target',
          [concept.concept_id],
          `${concept.concept_id}의 ${relation.relation} 관계에 target_concept_id가 없습니다: ${term}`,
          term,
        ));
        continue;
      }
      const target = conceptById.get(targetConceptId);
      if (!target) {
        issues.push(issue(
          'semantic-relation-target-not-found',
          [concept.concept_id, targetConceptId],
          `${concept.concept_id}의 ${relation.relation} 관계 대상이 존재하지 않습니다: ${targetConceptId}`,
          term,
        ));
        continue;
      }
      if (targetConceptId === concept.concept_id) {
        issues.push(issue(
          'semantic-relation-self-reference',
          [concept.concept_id],
          `${concept.concept_id}의 ${relation.relation} 관계가 자기 자신을 가리킵니다.`,
          term,
        ));
        continue;
      }
      if (termKey !== normalizeConceptTermKey(target.preferred_term_ko)) {
        issues.push(issue(
          'semantic-relation-term-mismatch',
          [concept.concept_id, targetConceptId],
          `${concept.concept_id}의 ${relation.relation} 관계 용어가 대상 개념의 대표 용어와 다릅니다: ${term} != ${target.preferred_term_ko}`,
          term,
        ));
      }
      semanticRelations.push({conceptId: concept.concept_id, relation, targetConceptId});
    }

    for (const aliasKey of aliasKeys) {
      const classified = concept.term_relations.some(relation => (
        aliasRelationKinds.has(relation.relation)
        && normalizeConceptTermKey(relation.term_ko) === aliasKey
      ));
      if (!classified) {
        const alias = declaredAliases.find(value => normalizeConceptTermKey(value) === aliasKey) ?? aliasKey;
        issues.push(issue(
          'alias-without-relation',
          [concept.concept_id],
          `${concept.concept_id}의 검색 별칭에 동의·표기 관계 분류가 없습니다: ${alias}`,
          alias,
        ));
      }
    }
  }

  validateSemanticRelationGraph(semanticRelations, issues);
  return deduplicateIssues(issues);
}

export function normalizeConceptTermKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/gu, ' ').trim();
}

export function auditConceptIdentityPolicyRegistry(
  registry: ConceptIdentityPolicyRegistry,
): string[] {
  const errors: string[] = [];
  if (registry.schema !== 'rulelink_public_concept_identity_policy_v1') {
    errors.push('개념 정체성 정책 레지스트리 스키마가 올바르지 않습니다.');
  }
  if (!/^\d+\.\d+\.\d+$/u.test(registry.policy_version)) {
    errors.push('개념 정체성 정책 버전은 의미 버전 형식이어야 합니다.');
  }
  if (!/^[a-f0-9]{64}$/u.test(registry.policy_receipt)) {
    errors.push('개념 정체성 정책 영수증은 SHA-256 형식이어야 합니다.');
  }
  if (!Array.isArray(registry.terms) || !registry.terms.length) {
    errors.push('개념 정체성 정책 용어가 비어 있습니다.');
    return errors;
  }

  const allowedKinds = new Set<ConceptIdentityPolicyKind>([
    'protected_canonical_identity',
    'ambiguous_global_alias',
  ]);
  const seenTerms = new Map<string, string>();
  for (const [index, item] of registry.terms.entries()) {
    const term = item?.term_ko?.trim() ?? '';
    const termKey = normalizeConceptTermKey(term);
    if (!term) errors.push(`개념 정체성 정책 terms[${index}]의 term_ko가 비어 있습니다.`);
    if (!allowedKinds.has(item?.policy_kind)) {
      errors.push(`개념 정체성 정책 terms[${index}]의 policy_kind가 올바르지 않습니다.`);
    }
    if (!item?.meaning_domain?.trim()) {
      errors.push(`개념 정체성 정책 terms[${index}]의 meaning_domain이 비어 있습니다.`);
    }
    if (!item?.reason_ko?.trim()) {
      errors.push(`개념 정체성 정책 terms[${index}]의 reason_ko가 비어 있습니다.`);
    }
    const owner = seenTerms.get(termKey);
    if (termKey && owner) {
      errors.push(`개념 정체성 정책 용어가 정규화 기준으로 중복되었습니다: ${term} (${owner})`);
    } else if (termKey) {
      seenTerms.set(termKey, item.policy_kind);
    }
  }
  return errors;
}

export function conceptIdentityPolicyReceiptInput(
  registry: ConceptIdentityPolicyRegistry,
): string {
  return canonicalPolicyJson({
    schema: registry.schema,
    policy_version: registry.policy_version,
    terms: registry.terms,
  });
}

function policyTerms(kind: ConceptIdentityPolicyKind): Set<string> {
  return new Set(
    conceptIdentityPolicyRegistry.terms
      .filter(item => item.policy_kind === kind)
      .map(item => normalizeConceptTermKey(item.term_ko)),
  );
}

function canonicalPolicyJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalPolicyJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalPolicyJson(record[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function claimConceptTerm(
  owners: Map<string, {conceptId: string; term: string}>,
  term: string,
  conceptId: string,
  issues: ConceptTermValidationIssue[],
) {
  const key = normalizeConceptTermKey(term);
  const owner = owners.get(key);
  if (owner && owner.conceptId !== conceptId) {
    issues.push(issue(
      'global-term-conflict',
      [owner.conceptId, conceptId],
      `법률개념 대표 용어·별칭이 여러 개념에 중복되었습니다: ${term} -> ${owner.conceptId}, ${conceptId}`,
      term,
    ));
  }
  if (!owner) owners.set(key, {conceptId, term});
}

function validateSemanticRelationGraph(
  semanticRelations: Array<{
    conceptId: string;
    relation: PublicConceptTermRelation;
    targetConceptId: string;
  }>,
  issues: ConceptTermValidationIssue[],
) {
  const relationKeys = new Set(semanticRelations.map(({conceptId, relation, targetConceptId}) => (
    `${conceptId}:${relation.relation}:${targetConceptId}`
  )));
  const narrowerGraph = new Map<string, Set<string>>();

  for (const {conceptId, relation, targetConceptId} of semanticRelations) {
    const inverse = relation.relation === 'narrower'
      ? 'broader'
      : relation.relation === 'broader'
        ? 'narrower'
        : 'related';
    if (!relationKeys.has(`${targetConceptId}:${inverse}:${conceptId}`)) {
      issues.push(issue(
        'semantic-relation-missing-inverse',
        [conceptId, targetConceptId],
        `${conceptId}의 ${relation.relation} 관계에 역방향 ${inverse} 관계가 없습니다: ${targetConceptId}`,
        relation.term_ko,
      ));
    }
    if (relation.relation === 'narrower') {
      addGraphEdge(narrowerGraph, conceptId, targetConceptId);
    } else if (relation.relation === 'broader') {
      addGraphEdge(narrowerGraph, targetConceptId, conceptId);
    }
  }

  for (const cycle of findDirectedCycles(narrowerGraph)) {
    issues.push(issue(
      'semantic-relation-cycle',
      cycle,
      `법률개념 narrower/broader 계층에 순환이 있습니다: ${cycle.join(' -> ')} -> ${cycle[0]}`,
    ));
  }
}

function addGraphEdge(graph: Map<string, Set<string>>, source: string, target: string) {
  const targets = graph.get(source) ?? new Set<string>();
  targets.add(target);
  graph.set(source, targets);
}

function findDirectedCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles = new Map<string, string[]>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const inStack = new Set<string>();

  const visit = (node: string) => {
    if (inStack.has(node)) {
      const start = stack.indexOf(node);
      const cycle = stack.slice(start);
      const rotations = cycle.map((_, index) => [...cycle.slice(index), ...cycle.slice(0, index)]);
      rotations.sort((left, right) => left.join('\u0000').localeCompare(right.join('\u0000')));
      cycles.set(rotations[0].join('\u0000'), rotations[0]);
      return;
    }
    if (visited.has(node)) return;
    inStack.add(node);
    stack.push(node);
    for (const target of graph.get(node) ?? []) visit(target);
    stack.pop();
    inStack.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) visit(node);
  return [...cycles.values()];
}

function isAllowedLegacyIssue(
  issueValue: ConceptTermValidationIssue,
  legacyDebt: ConceptTermValidationOptions['legacyDebt'],
) {
  if (!legacyDebt || issueValue.conceptIds.length !== 1) return false;
  return legacyDebt.get(issueValue.conceptIds[0])?.has(issueValue.code) ?? false;
}

function issue(
  code: ConceptTermValidationIssueCode,
  conceptIds: string[],
  message: string,
  term?: string,
): ConceptTermValidationIssue {
  return {code, conceptIds, message, ...(term ? {term} : {})};
}

function deduplicateIssues(issues: ConceptTermValidationIssue[]): ConceptTermValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter(item => {
    const key = `${item.code}:${item.conceptIds.join(',')}:${item.term ?? ''}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
