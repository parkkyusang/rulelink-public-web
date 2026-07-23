import type {
  PublicConceptCard,
  PublicKnowledgeEntry,
  PublicKnowledgeProductRole,
  PublicKnowledgeRelation,
  PublicKnowledgeRelationType,
  PublicScenarioBranch,
} from '@/types/publication';

export const KNOWLEDGE_RELATION_TYPES = [
  'prerequisite',
  'comparison',
  'deadline',
  'procedure',
  'remedy',
  'law_change',
  'concept',
  'concierge_boundary',
] as const satisfies readonly PublicKnowledgeRelationType[];

export const KNOWLEDGE_PRODUCT_ROLES = [
  'public_proof',
  'user_orientation',
  'concierge_entry',
  'knowledge_reuse',
  'freshness_capture',
] as const satisfies readonly PublicKnowledgeProductRole[];

export const KNOWLEDGE_RELATION_LABELS_KO: Record<PublicKnowledgeRelationType, string> = {
  prerequisite: '먼저 이해할 내용',
  comparison: '비교해서 볼 내용',
  deadline: '기한과 시점',
  procedure: '이어지는 절차',
  remedy: '구제·대응 경로',
  law_change: '법령 변화',
  concept: '관련 법률개념',
  concierge_boundary: '개별 검토의 경계',
};

export type KnowledgeReadingPathSectionKey =
  | 'foundation'
  | 'comparison'
  | 'deadline'
  | 'procedure'
  | 'remedy'
  | 'law_change'
  | 'concierge_boundary'
  | 'same_topic';

export type KnowledgeReadingPathItem = {
  target_kind: PublicKnowledgeRelation['target_kind'] | 'content';
  target_id: string;
  href: string;
  title_ko: string;
  summary_ko: string;
  relation_label_ko: string;
  reason_ko: string;
  action_ko: string;
};

export type KnowledgeReadingPathSection = {
  key: KnowledgeReadingPathSectionKey;
  label_ko: string;
  description_ko: string;
  typed: boolean;
  items: KnowledgeReadingPathItem[];
};

const READING_PATH_SECTION_ORDER: KnowledgeReadingPathSectionKey[] = [
  'foundation',
  'comparison',
  'deadline',
  'procedure',
  'remedy',
  'law_change',
  'concierge_boundary',
  'same_topic',
];

const READING_PATH_SECTION_META: Record<KnowledgeReadingPathSectionKey, Pick<KnowledgeReadingPathSection, 'label_ko' | 'description_ko'>> = {
  foundation: {
    label_ko: '먼저 이해할 개념',
    description_ko: '현재 글의 기준을 읽기 전에 뜻이나 전제가 되는 내용을 확인합니다.',
  },
  comparison: {
    label_ko: '비교',
    description_ko: '비슷해 보이는 제도의 적용 범위와 결과 차이를 나란히 확인합니다.',
  },
  deadline: {
    label_ko: '기한',
    description_ko: '권리 행사 가능 여부를 가를 수 있는 날짜와 진행 단계를 확인합니다.',
  },
  procedure: {
    label_ko: '절차',
    description_ko: '기준을 이해한 뒤 실제로 밟을 신청·제출·진행 순서를 이어서 봅니다.',
  },
  remedy: {
    label_ko: '구제',
    description_ko: '현재 방법이 어렵거나 충분하지 않을 때 선택할 수 있는 다음 구제 경로입니다.',
  },
  law_change: {
    label_ko: '법령변화',
    description_ko: '시행일에 따라 달라질 수 있는 적용 기준과 변경 내용을 확인합니다.',
  },
  concierge_boundary: {
    label_ko: '전문가 경계',
    description_ko: '공개 법률정보는 누구나 이용할 수 있습니다. 사건별 컨시어지는 자격이 확인된 변호사만 이용하며, 그 이유와 경계를 확인합니다.',
  },
  same_topic: {
    label_ko: '같은 주제 더 보기',
    description_ko: '같은 주제에 묶인 참고 글입니다. 구체적인 연결 의미는 아직 분류되지 않았습니다.',
  },
};

const RELATION_ITEM_META: Record<PublicKnowledgeRelationType, {section: KnowledgeReadingPathSectionKey; label: string; reason: string; action: string}> = {
  prerequisite: {
    section: 'foundation',
    label: '선행 내용',
    reason: '이 전제를 먼저 알면 현재 글의 판단 기준을 더 정확히 이해할 수 있습니다.',
    action: '전제부터 확인',
  },
  concept: {
    section: 'foundation',
    label: '법률개념',
    reason: '현재 글의 법리를 구성하는 핵심 용어의 정확한 뜻을 확인합니다.',
    action: '개념부터 확인',
  },
  comparison: {
    section: 'comparison',
    label: '비교',
    reason: '선택지의 적용 범위와 결과가 달라 현재 내용과 나란히 비교할 필요가 있습니다.',
    action: '차이 비교',
  },
  deadline: {
    section: 'deadline',
    label: '기한',
    reason: '언제까지 행동해야 하는지가 현재 권리의 행사 가능성을 바꿀 수 있습니다.',
    action: '기한 확인',
  },
  procedure: {
    section: 'procedure',
    label: '절차',
    reason: '현재 기준을 확인한 다음 실제로 밟아야 할 신청·제출 절차입니다.',
    action: '절차 이어가기',
  },
  remedy: {
    section: 'remedy',
    label: '구제 경로',
    reason: '현재 방법으로 해결되지 않을 때 이어서 검토할 수 있는 구제 수단입니다.',
    action: '구제 경로 확인',
  },
  law_change: {
    section: 'law_change',
    label: '법령변화',
    reason: '적용 시점에 따라 기준이 달라질 수 있어 변경 전후를 함께 확인합니다.',
    action: '변경 기준 확인',
  },
  concierge_boundary: {
    section: 'concierge_boundary',
    label: '전문가 경계',
    reason: '공개정보는 계속 이용할 수 있지만, 사건별 컨시어지는 자격이 확인된 변호사만 이용할 수 있습니다.',
    action: '왜 자격 확인이 필요한가',
  },
};

const relationTypeSet = new Set<string>(KNOWLEDGE_RELATION_TYPES);
const productRoleSet = new Set<string>(KNOWLEDGE_PRODUCT_ROLES);

type EntryLike = Partial<PublicKnowledgeEntry> & Record<string, unknown>;
type ScenarioLike = Pick<PublicScenarioBranch, 'scenario_id' | 'decision_fact_ko'>;

export function knowledgeRelationTypeLabelKo(type: PublicKnowledgeRelationType): string {
  return KNOWLEDGE_RELATION_LABELS_KO[type];
}

export function relatedContentRelations(entry: Pick<PublicKnowledgeEntry, 'related_content_ids' | 'related_edges'>): Array<{
  targetId: string;
  relationType?: PublicKnowledgeRelationType;
}> {
  if (Array.isArray(entry.related_edges)) {
    return entry.related_edges
      .filter(relation => relation.target_kind === 'content')
      .map(relation => ({targetId: relation.target_id, relationType: relation.relation_type}));
  }
  return (entry.related_content_ids ?? []).map(targetId => ({targetId}));
}

export type KnowledgeRelatedSection = {
  key: PublicKnowledgeRelationType | 'same_hub';
  label_ko: string;
  entries: PublicKnowledgeEntry[];
};

export function buildKnowledgeRelatedPresentation(
  entry: PublicKnowledgeEntry,
  entries: PublicKnowledgeEntry[],
  sameHubContentIds: string[],
  limit = 6,
): {related: PublicKnowledgeEntry[]; sections: KnowledgeRelatedSection[]} {
  const entryById = new Map(entries.map(candidate => [candidate.content_id, candidate]));
  const explicitRelations = relatedContentRelations(entry);
  const orderedIds = [...explicitRelations.map(relation => relation.targetId), ...sameHubContentIds];
  const seen = new Set<string>();
  const related = orderedIds
    .filter(contentId => {
      if (contentId === entry.content_id || seen.has(contentId)) return false;
      seen.add(contentId);
      return true;
    })
    .map(contentId => entryById.get(contentId))
    .filter((candidate): candidate is PublicKnowledgeEntry => Boolean(candidate))
    .slice(0, limit);

  if (!Array.isArray(entry.related_edges)) return {related, sections: []};

  const firstRelationTypeByTarget = new Map<string, PublicKnowledgeRelationType>();
  for (const relation of explicitRelations) {
    if (relation.relationType && !firstRelationTypeByTarget.has(relation.targetId)) {
      firstRelationTypeByTarget.set(relation.targetId, relation.relationType);
    }
  }
  const sections = new Map<KnowledgeRelatedSection['key'], KnowledgeRelatedSection>();
  for (const candidate of related) {
    const relationType = firstRelationTypeByTarget.get(candidate.content_id);
    const key = relationType ?? 'same_hub';
    const section = sections.get(key) ?? {
      key,
      label_ko: relationType ? knowledgeRelationTypeLabelKo(relationType) : '같은 주제에서 더 보기',
      entries: [],
    };
    section.entries.push(candidate);
    sections.set(key, section);
  }
  return {related, sections: [...sections.values()]};
}

export function buildKnowledgeReadingPath(
  entry: Pick<PublicKnowledgeEntry, 'content_id' | 'related_content_ids' | 'related_edges'>,
  entries: PublicKnowledgeEntry[],
  concepts: PublicConceptCard[],
  sameHubContentIds: string[],
  fallbackLimit = 6,
): KnowledgeReadingPathSection[] {
  const entryById = new Map(entries.map(candidate => [candidate.content_id, candidate]));
  const conceptById = new Map(concepts.map(concept => [concept.concept_id, concept]));
  const sections = new Map<KnowledgeReadingPathSectionKey, KnowledgeReadingPathSection>();
  const typedTargetIds = new Set<string>();
  const typedEdges = Array.isArray(entry.related_edges) ? entry.related_edges : [];
  const hasTypedEdges = typedEdges.length > 0;

  if (hasTypedEdges) {
    for (const relation of typedEdges) {
      const item = readingPathItem(relation, entryById, conceptById);
      if (!item) continue;
      typedTargetIds.add(`${relation.target_kind}:${relation.target_id}`);
      const meta = RELATION_ITEM_META[relation.relation_type];
      const section = sections.get(meta.section) ?? readingPathSection(meta.section, true);
      section.items.push(item);
      sections.set(meta.section, section);
    }
  }

  const fallbackIds = hasTypedEdges
    ? sameHubContentIds
    : [...entry.related_content_ids, ...sameHubContentIds];
  const seenFallback = new Set<string>();
  const fallbackItems = fallbackIds
    .filter(contentId => {
      if (contentId === entry.content_id || seenFallback.has(contentId) || typedTargetIds.has(`content:${contentId}`)) return false;
      seenFallback.add(contentId);
      return true;
    })
    .map(contentId => entryById.get(contentId))
    .filter((candidate): candidate is PublicKnowledgeEntry => Boolean(candidate))
    .slice(0, fallbackLimit)
    .map(candidate => ({
      target_kind: 'content' as const,
      target_id: candidate.content_id,
      href: `/ko/knowledge/${candidate.slug}`,
      title_ko: candidate.title_ko,
      summary_ko: candidate.one_line_answer_ko,
      relation_label_ko: '같은 주제',
      reason_ko: '현재 글과 같은 주제 묶음에 있는 참고 글이며, 구체적인 연결 유형은 아직 분류되지 않았습니다.',
      action_ko: '같은 주제에서 보기',
    }));
  if (fallbackItems.length) {
    const fallback = readingPathSection('same_topic', false);
    fallback.items.push(...fallbackItems);
    sections.set('same_topic', fallback);
  }

  return READING_PATH_SECTION_ORDER.flatMap(key => {
    const section = sections.get(key);
    return section?.items.length ? [section] : [];
  });
}

function readingPathSection(key: KnowledgeReadingPathSectionKey, typed: boolean): KnowledgeReadingPathSection {
  return {...READING_PATH_SECTION_META[key], key, typed, items: []};
}

function readingPathItem(
  relation: PublicKnowledgeRelation,
  entryById: ReadonlyMap<string, PublicKnowledgeEntry>,
  conceptById: ReadonlyMap<string, PublicConceptCard>,
): KnowledgeReadingPathItem | null {
  const meta = RELATION_ITEM_META[relation.relation_type];
  if (relation.target_kind === 'concept') {
    const concept = conceptById.get(relation.target_id);
    if (!concept) return null;
    return {
      target_kind: 'concept',
      target_id: concept.concept_id,
      href: `/ko/concepts/${concept.slug}`,
      title_ko: concept.preferred_term_ko,
      summary_ko: concept.plain_definition_ko,
      relation_label_ko: meta.label,
      reason_ko: relation.label_ko?.trim() || meta.reason,
      action_ko: meta.action,
    };
  }
  const target = entryById.get(relation.target_id);
  if (!target) return null;
  return {
    target_kind: 'content',
    target_id: target.content_id,
    href: `/ko/knowledge/${target.slug}`,
    title_ko: target.title_ko,
    summary_ko: target.one_line_answer_ko,
    relation_label_ko: meta.label,
    reason_ko: relation.label_ko?.trim() || meta.reason,
    action_ko: meta.action,
  };
}

export function projectKnowledgeEntryCompatibility(
  entry: EntryLike,
  scenarioById: ReadonlyMap<string, ScenarioLike>,
): PublicKnowledgeEntry {
  let projected: EntryLike = entry;
  const relatedEdges = validateRelatedEdges(entry.related_edges);

  if (relatedEdges) {
    const projectedContentIds = uniqueTargets(relatedEdges, 'content');
    const projectedConceptIds = uniqueTargets(relatedEdges, 'concept');
    assertSameOptionalSet(entry.related_content_ids, projectedContentIds, 'related_content_ids');
    assertSameOptionalSet(entry.concept_ids, projectedConceptIds, 'concept_ids');
    projected = {
      ...projected,
      related_content_ids: projectedContentIds,
      ...(projectedConceptIds.length || entry.concept_ids !== undefined ? {concept_ids: projectedConceptIds} : {}),
    };
  }

  const productRoles = validateProductRoles(entry.product_roles);
  const workspace = entry.lawyer_workspace_entry;
  if (productRoles) {
    const isConciergeEntry = productRoles.includes('concierge_entry');
    if (isConciergeEntry !== (workspace !== undefined)) {
      throw new Error('product_roles의 concierge_entry와 lawyer_workspace_entry 존재 여부가 일치해야 합니다.');
    }
  }

  if (workspace !== undefined) {
    const typedConcierge = productRoles?.includes('concierge_entry') ?? false;
    const projectedWorkspace = projectLawyerWorkspaceEntry(entry, workspace, scenarioById, typedConcierge);
    if (projectedWorkspace !== workspace) projected = {...projected, lawyer_workspace_entry: projectedWorkspace};
  }

  return projected as PublicKnowledgeEntry;
}

function validateRelatedEdges(value: unknown): PublicKnowledgeRelation[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) throw new Error('related_edges는 배열이어야 합니다.');
  const seen = new Set<string>();
  for (const [index, relation] of value.entries()) {
    if (!isRecord(relation)) throw new Error(`related_edges[${index}]는 객체여야 합니다.`);
    if (!['content', 'concept'].includes(String(relation.target_kind))) {
      throw new Error(`related_edges[${index}].target_kind가 허용되지 않습니다.`);
    }
    if (typeof relation.target_id !== 'string' || !relation.target_id.trim()) {
      throw new Error(`related_edges[${index}].target_id가 비어 있습니다.`);
    }
    if (typeof relation.relation_type !== 'string' || !relationTypeSet.has(relation.relation_type)) {
      throw new Error(`related_edges[${index}].relation_type이 허용된 8개 유형이 아닙니다.`);
    }
    if ((relation.relation_type === 'concept') !== (relation.target_kind === 'concept')) {
      throw new Error(`related_edges[${index}]의 concept 유형과 target_kind가 일치하지 않습니다.`);
    }
    if (relation.label_ko !== undefined && (typeof relation.label_ko !== 'string' || !relation.label_ko.trim())) {
      throw new Error(`related_edges[${index}].label_ko는 비어 있지 않은 문자열이어야 합니다.`);
    }
    const key = `${relation.target_kind}:${relation.target_id}:${relation.relation_type}`;
    if (seen.has(key)) throw new Error(`related_edges[${index}]에 중복 관계가 있습니다: ${key}`);
    seen.add(key);
  }
  return value as PublicKnowledgeRelation[];
}

function validateProductRoles(value: unknown): PublicKnowledgeProductRole[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) throw new Error('product_roles는 배열이어야 합니다.');
  const seen = new Set<string>();
  for (const [index, role] of value.entries()) {
    if (typeof role !== 'string' || !productRoleSet.has(role)) {
      throw new Error(`product_roles[${index}]가 허용된 제품 역할이 아닙니다.`);
    }
    if (seen.has(role)) throw new Error(`product_roles에 중복 역할이 있습니다: ${role}`);
    seen.add(role);
  }
  return value as PublicKnowledgeProductRole[];
}

function projectLawyerWorkspaceEntry(
  entry: EntryLike,
  workspace: unknown,
  scenarioById: ReadonlyMap<string, ScenarioLike>,
  typedConcierge: boolean,
): NonNullable<PublicKnowledgeEntry['lawyer_workspace_entry']> {
  if (!isRecord(workspace)
    || workspace.href !== '/ko/lawyer-workspace'
    || workspace.audience !== 'verified_attorney'
    || typeof workspace.question_ko !== 'string'
    || !workspace.question_ko.trim()) {
    throw new Error('lawyer_workspace_entry가 변호사 전용 게이트 계약과 다릅니다.');
  }

  if (!typedConcierge) {
    if (!isNonEmptyStringArray(workspace.decision_facts_ko)) {
      throw new Error('lawyer_workspace_entry가 변호사 전용 게이트 계약과 다릅니다.');
    }
    return workspace as NonNullable<PublicKnowledgeEntry['lawyer_workspace_entry']>;
  }

  if (workspace.gate_id !== 'verified_attorney_v1') {
    throw new Error('concierge_entry의 gate_id는 verified_attorney_v1이어야 합니다.');
  }
  if (!isNonEmptyStringArray(workspace.decision_scenario_ids)) {
    throw new Error('concierge_entry에는 decision_scenario_ids가 하나 이상 필요합니다.');
  }
  const entryScenarioIds = new Set(Array.isArray(entry.scenario_ids) ? entry.scenario_ids : []);
  const decisionFacts: string[] = [];
  for (const scenarioId of workspace.decision_scenario_ids) {
    if (!entryScenarioIds.has(scenarioId)) {
      throw new Error(`concierge_entry의 결정사실 시나리오가 콘텐츠 scenario_ids에 없습니다: ${scenarioId}`);
    }
    const scenario = scenarioById.get(scenarioId);
    if (!scenario) throw new Error(`concierge_entry가 존재하지 않는 시나리오를 참조합니다: ${scenarioId}`);
    if (!decisionFacts.includes(scenario.decision_fact_ko)) decisionFacts.push(scenario.decision_fact_ko);
  }
  assertSameOptionalSet(workspace.decision_facts_ko, decisionFacts, 'lawyer_workspace_entry.decision_facts_ko');
  return {...workspace, decision_facts_ko: decisionFacts} as NonNullable<PublicKnowledgeEntry['lawyer_workspace_entry']>;
}

function uniqueTargets(relations: PublicKnowledgeRelation[], kind: PublicKnowledgeRelation['target_kind']): string[] {
  const targets: string[] = [];
  for (const relation of relations) {
    if (relation.target_kind === kind && !targets.includes(relation.target_id)) targets.push(relation.target_id);
  }
  return targets;
}

function assertSameOptionalSet(value: unknown, projected: string[], field: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${field}는 문자열 배열이어야 합니다.`);
  }
  const actualSet = new Set(value);
  const projectedSet = new Set(projected);
  if (actualSet.size !== value.length) throw new Error(`${field}에 중복 식별자가 있습니다.`);
  if (actualSet.size !== projectedSet.size || [...actualSet].some(item => !projectedSet.has(item))) {
    throw new Error(`related_edges 투영 결과와 ${field} 집합이 일치하지 않습니다.`);
  }
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
