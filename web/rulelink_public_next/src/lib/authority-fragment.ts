import type {PublicAuthorityRouteKey} from '@/types/publication';

export type AuthorityFragmentAnchor = {
  anchorId: string;
  domId: string;
  detailsId: string;
  parentAnchorId?: string;
};

export type AuthorityFragmentPlan = {
  targetId: string;
  ancestorDetailsIds: string[];
};

export function authorityRouteSegment(
  routeKey: PublicAuthorityRouteKey,
  sourceVersionKey?: string,
): string {
  const routeSegment = `${routeKey.law_key}-${routeKey.article_no}`;
  return sourceVersionKey
    ? `${routeSegment}-version-${authorityVersionSegment(sourceVersionKey)}`
    : routeSegment;
}

export function authorityCardDomId(
  routeKey: PublicAuthorityRouteKey,
  sourceVersionKey?: string,
): string {
  return `authority-${authorityRouteSegment(routeKey, sourceVersionKey)}`;
}

export function authorityCardDetailsId(
  routeKey: PublicAuthorityRouteKey,
  sourceVersionKey?: string,
): string {
  return `${authorityCardDomId(routeKey, sourceVersionKey)}-details`;
}

export function authorityAnchorDomId(
  routeKey: PublicAuthorityRouteKey,
  locatorKey: string,
  sourceVersionKey?: string,
): string {
  return `${authorityCardDomId(routeKey, sourceVersionKey)}-${locatorKey}`;
}

export function authorityAnchorDetailsId(
  routeKey: PublicAuthorityRouteKey,
  locatorKey: string,
  sourceVersionKey?: string,
): string {
  return `${authorityAnchorDomId(routeKey, locatorKey, sourceVersionKey)}-details`;
}

export function decodeAuthorityFragment(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith('authority-') ? decoded : null;
  } catch {
    return null;
  }
}

export function authorityFragmentPlan(
  routeKey: PublicAuthorityRouteKey,
  anchors: AuthorityFragmentAnchor[],
  hash: string,
  sourceVersionKey?: string,
): AuthorityFragmentPlan | null {
  const targetId = decodeAuthorityFragment(hash);
  if (!targetId) return null;
  const cardId = authorityCardDomId(routeKey, sourceVersionKey);
  const cardDetailsId = authorityCardDetailsId(routeKey, sourceVersionKey);
  if (targetId === cardId) {
    return {targetId, ancestorDetailsIds: [cardDetailsId]};
  }
  const byDomId = new Map(anchors.map(anchor => [anchor.domId, anchor]));
  const byAnchorId = new Map(anchors.map(anchor => [anchor.anchorId, anchor]));
  const target = byDomId.get(targetId);
  if (!target) return null;

  const nestedDetailsIds: string[] = [];
  const visited = new Set<string>();
  let current: AuthorityFragmentAnchor | undefined = target;
  while (current && !visited.has(current.anchorId)) {
    visited.add(current.anchorId);
    nestedDetailsIds.push(current.detailsId);
    current = current.parentAnchorId
      ? byAnchorId.get(current.parentAnchorId)
      : undefined;
  }
  return {
    targetId,
    ancestorDetailsIds: [cardDetailsId, ...nestedDetailsIds.reverse()],
  };
}

function authorityVersionSegment(value: string): string {
  return Array.from(value)
    .map(character => character.codePointAt(0)!.toString(16).padStart(6, '0'))
    .join('');
}
