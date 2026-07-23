import {browserOfficialSourceUrl} from './official-source-url.ts';
import {
  authorityAnchorDetailsId,
  authorityAnchorDomId,
  authorityCardDetailsId,
  authorityCardDomId,
  authorityRouteSegment,
} from './authority-fragment.ts';

import type {
  PublicAuthorityAnchor,
  PublicAuthorityCitationEdge,
  PublicAuthorityLogicalGroup,
  PublicAuthorityReadingUnit,
  PublicAuthorityRouteKey,
  PublicAuthorityTimeState,
  PublicKnowledgeEntry,
  PublicKnowledgeIndex,
  PublicKnowledgeSource,
  PublicSourceAuthorityUnit,
} from '@/types/publication';

export type AuthorityAnchorView = {
  anchorId: string;
  detailsId: string;
  domId: string;
  explanationKo: string;
  isBound: boolean;
  locatorKey: string;
  officialTextKo: string;
  parentAnchorId?: string;
  plainHeadingKo: string;
  unitKind: PublicSourceAuthorityUnit['unit_kind'];
};

export type AuthorityLogicalGroupView = {
  anchorIds: string[];
  anchors: AuthorityAnchorView[];
  logicalGroupId: string;
  operator: PublicAuthorityLogicalGroup['operator'];
  operatorLabelKo: string;
  ordinal: number;
  paragraphs: Array<{
    explanationParagraphId: string;
    textKo: string;
    anchorIds: string[];
  }>;
  role: PublicAuthorityLogicalGroup['role'];
  roleLabelKo: string;
  titleKo: string;
};

export type AuthorityReadingView = {
  anchors: AuthorityAnchorView[];
  authorityReadingUnitId: string;
  boundAnchorIds: string[];
  cardDetailsId: string;
  cardDomId: string;
  citationEdges: PublicAuthorityCitationEdge[];
  effectiveFrom: string;
  effectiveTo?: string;
  logicalGroups: AuthorityLogicalGroupView[];
  officialUrl?: string;
  routeHref: string;
  routeKey: PublicAuthorityRouteKey;
  routeSegment: string;
  source: PublicKnowledgeSource;
  sourceVersionKey: string;
  summaryKo: string;
  timeLabelKo: string;
  timeState: PublicAuthorityTimeState;
  titleKo: string;
};

const EMPTY_AUTHORITY_READING = Object.freeze([]) as readonly AuthorityReadingView[];

export function resolveAuthorityReadingForEntry(
  knowledge: PublicKnowledgeIndex,
  entry: PublicKnowledgeEntry,
): readonly AuthorityReadingView[] {
  const bindingIds = entry.authority_binding_ids ?? [];
  if (!bindingIds.length) return EMPTY_AUTHORITY_READING;
  const bindingById = new Map(
    (knowledge.authority_bindings ?? []).map(binding => [binding.binding_id, binding]),
  );
  const readingById = new Map(
    (knowledge.authority_reading_units ?? [])
      .map(unit => [unit.authority_reading_unit_id, unit]),
  );
  const ordered: Array<{
    reading: PublicAuthorityReadingUnit;
    boundAnchorIds: string[];
  }> = [];
  const byReadingId = new Map<string, number>();

  for (const bindingId of bindingIds) {
    const binding = bindingById.get(bindingId);
    if (!binding || binding.from_id !== entry.content_id) continue;
    const reading = readingById.get(binding.to_authority_reading_unit_id);
    if (!reading) continue;
    const existingIndex = byReadingId.get(reading.authority_reading_unit_id);
    if (existingIndex === undefined) {
      byReadingId.set(reading.authority_reading_unit_id, ordered.length);
      ordered.push({reading, boundAnchorIds: [...binding.anchor_ids]});
      continue;
    }
    const existing = ordered[existingIndex];
    existing.boundAnchorIds = uniqueStrings([
      ...existing.boundAnchorIds,
      ...binding.anchor_ids,
    ]);
  }

  return disambiguateAuthorityViewIds(ordered
    .map(({reading, boundAnchorIds}) => projectAuthorityReadingUnit(
      knowledge,
      reading,
      boundAnchorIds,
    ))
    .filter((view): view is AuthorityReadingView => Boolean(view)));
}

export function projectAuthorityReadingUnits(
  knowledge: PublicKnowledgeIndex,
): AuthorityReadingView[] {
  return (knowledge.authority_reading_units ?? [])
    .filter(unit => unit.editorial_status === 'approved')
    .map(unit => projectAuthorityReadingUnit(knowledge, unit))
    .filter((view): view is AuthorityReadingView => Boolean(view))
    .sort(compareAuthorityViews);
}

export function projectAuthorityReadingUnit(
  knowledge: PublicKnowledgeIndex,
  reading: PublicAuthorityReadingUnit,
  boundAnchorIds: string[] = [],
): AuthorityReadingView | null {
  const source = knowledge.sources.find(
    candidate => candidate.coordinate_id === reading.source_coordinate_id,
  );
  if (!source) return null;
  const sourceUnitById = new Map(
    (knowledge.source_authority_units ?? [])
      .map(unit => [unit.source_authority_unit_id, unit]),
  );
  const bound = new Set(boundAnchorIds);
  const anchors = reading.anchors
    .map(anchor => projectAnchor(reading.route_key, anchor, sourceUnitById, bound))
    .filter((anchor): anchor is AuthorityAnchorView => Boolean(anchor));
  const anchorById = new Map(anchors.map(anchor => [anchor.anchorId, anchor]));
  const paragraphsByGroup = new Map<string, AuthorityLogicalGroupView['paragraphs']>();
  for (const paragraph of reading.explanation_paragraphs) {
    const paragraphs = paragraphsByGroup.get(paragraph.logical_group_id) ?? [];
    paragraphs.push({
      explanationParagraphId: paragraph.explanation_paragraph_id,
      textKo: paragraph.text_ko,
      anchorIds: [...paragraph.anchor_ids],
    });
    paragraphsByGroup.set(paragraph.logical_group_id, paragraphs);
  }
  const logicalGroups = reading.logical_groups
    .map(group => ({
      anchorIds: [...group.anchor_ids],
      anchors: group.anchor_ids
        .map(anchorId => anchorById.get(anchorId))
        .filter((anchor): anchor is AuthorityAnchorView => Boolean(anchor)),
      logicalGroupId: group.logical_group_id,
      operator: group.operator,
      operatorLabelKo: authorityOperatorLabel(group.operator),
      ordinal: group.ordinal,
      paragraphs: paragraphsByGroup.get(group.logical_group_id) ?? [],
      role: group.role,
      roleLabelKo: authorityRoleLabel(group.role),
      titleKo: group.title_ko,
    }))
    .sort((left, right) => left.ordinal - right.ordinal);
  const routeSegment = authorityRouteSegment(reading.route_key);
  return {
    anchors,
    authorityReadingUnitId: reading.authority_reading_unit_id,
    boundAnchorIds: uniqueStrings(boundAnchorIds),
    cardDetailsId: authorityCardDetailsId(reading.route_key),
    cardDomId: authorityCardDomId(reading.route_key),
    citationEdges: reading.citation_edges,
    effectiveFrom: reading.effective_from,
    ...(reading.effective_to ? {effectiveTo: reading.effective_to} : {}),
    logicalGroups,
    officialUrl: browserOfficialSourceUrl(source) ?? source.official_url,
    routeHref: `/ko/authorities/${reading.route_key.law_key}/${reading.route_key.article_no}`,
    routeKey: reading.route_key,
    routeSegment,
    source,
    sourceVersionKey: reading.source_version_key,
    summaryKo: reading.summary_ko,
    timeLabelKo: authorityTimeLabel(reading.time_state, reading.effective_from),
    timeState: reading.time_state,
    titleKo: reading.title_ko,
  };
}

export function authorityRouteParams(
  views: readonly AuthorityReadingView[],
): Array<{lawKey: string; articleNo: string}> {
  const seen = new Set<string>();
  const result: Array<{lawKey: string; articleNo: string}> = [];
  for (const view of views) {
    const key = `${view.routeKey.law_key}/${view.routeKey.article_no}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      lawKey: view.routeKey.law_key,
      articleNo: view.routeKey.article_no,
    });
  }
  return result;
}

export function selectCanonicalAuthorityReadings(
  views: readonly AuthorityReadingView[],
): AuthorityReadingView[] {
  return authorityRouteParams(views)
    .map(params => selectAuthorityReadingForRoute(
      views,
      params.lawKey,
      params.articleNo,
    ))
    .filter((view): view is AuthorityReadingView => Boolean(view));
}

export function selectAuthorityReadingForRoute(
  views: readonly AuthorityReadingView[],
  lawKey: string,
  articleNo: string,
): AuthorityReadingView | null {
  const candidates = views.filter(view => (
    view.routeKey.law_key === lawKey &&
    view.routeKey.article_no === articleNo
  ));
  return [...candidates].sort(compareAuthorityRouteCandidates)[0] ?? null;
}

function projectAnchor(
  routeKey: PublicAuthorityRouteKey,
  anchor: PublicAuthorityAnchor,
  sourceUnitById: Map<string, PublicSourceAuthorityUnit>,
  bound: Set<string>,
): AuthorityAnchorView | null {
  const unit = sourceUnitById.get(anchor.source_authority_unit_id);
  if (!unit) return null;
  return {
    anchorId: anchor.anchor_id,
    detailsId: authorityAnchorDetailsId(routeKey, anchor.locator_key),
    domId: authorityAnchorDomId(routeKey, anchor.locator_key),
    explanationKo: anchor.explanation_ko,
    isBound: bound.has(anchor.anchor_id),
    locatorKey: anchor.locator_key,
    officialTextKo: unit.official_text_ko,
    ...(anchor.parent_anchor_id ? {parentAnchorId: anchor.parent_anchor_id} : {}),
    plainHeadingKo: anchor.plain_heading_ko,
    unitKind: unit.unit_kind,
  };
}

function compareAuthorityViews(
  left: AuthorityReadingView,
  right: AuthorityReadingView,
): number {
  return left.routeKey.law_key.localeCompare(right.routeKey.law_key) ||
    left.routeKey.article_no.localeCompare(right.routeKey.article_no) ||
    compareAuthorityRouteCandidates(left, right);
}

function compareAuthorityRouteCandidates(
  left: AuthorityReadingView,
  right: AuthorityReadingView,
): number {
  const stateDifference = timeStateOrder(left.timeState) - timeStateOrder(right.timeState);
  if (stateDifference) return stateDifference;
  const effectiveTimeDifference = (
    Date.parse(left.effectiveFrom) - Date.parse(right.effectiveFrom)
  );
  if (left.timeState === 'future_effective') {
    return effectiveTimeDifference;
  }
  return -effectiveTimeDifference;
}

function disambiguateAuthorityViewIds(
  views: AuthorityReadingView[],
): AuthorityReadingView[] {
  const routeCounts = new Map<string, number>();
  for (const view of views) {
    routeCounts.set(view.routeSegment, (routeCounts.get(view.routeSegment) ?? 0) + 1);
  }
  return views.map(view => {
    if ((routeCounts.get(view.routeSegment) ?? 0) < 2) return view;
    const anchors = view.anchors.map(anchor => ({
      ...anchor,
      detailsId: authorityAnchorDetailsId(
        view.routeKey,
        anchor.locatorKey,
        view.sourceVersionKey,
      ),
      domId: authorityAnchorDomId(
        view.routeKey,
        anchor.locatorKey,
        view.sourceVersionKey,
      ),
    }));
    const anchorById = new Map(anchors.map(anchor => [anchor.anchorId, anchor]));
    return {
      ...view,
      anchors,
      cardDetailsId: authorityCardDetailsId(view.routeKey, view.sourceVersionKey),
      cardDomId: authorityCardDomId(view.routeKey, view.sourceVersionKey),
      logicalGroups: view.logicalGroups.map(group => ({
        ...group,
        anchors: group.anchorIds
          .map(anchorId => anchorById.get(anchorId))
          .filter((anchor): anchor is AuthorityAnchorView => Boolean(anchor)),
      })),
      routeSegment: authorityRouteSegment(view.routeKey, view.sourceVersionKey),
    };
  });
}

function timeStateOrder(value: PublicAuthorityTimeState): number {
  if (value === 'current_as_of_review') return 0;
  if (value === 'future_effective') return 1;
  return 2;
}

function authorityTimeLabel(
  state: PublicAuthorityTimeState,
  effectiveFrom: string,
): string {
  if (state === 'current_as_of_review') return '현행';
  if (state === 'historical') return '구법 적용 가능';
  return `시행예정 ${effectiveFrom.slice(0, 10)}`;
}

function authorityRoleLabel(role: PublicAuthorityLogicalGroup['role']): string {
  return {
    requirement: '요건',
    effect: '효과',
    exception: '예외',
    prohibition: '제외·금지',
    procedure: '절차',
    citation_map: '인용조문 지도',
  }[role];
}

function authorityOperatorLabel(
  operator: PublicAuthorityLogicalGroup['operator'],
): string {
  return {
    all: '모두 충족',
    any: '하나 이상',
    sequence: '순서대로',
    none: '별도 결합 없음',
  }[operator];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
