import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const AUTHORITY_COLLECTIONS = [
  'source_authority_units',
  'source_version_bridges',
  'authority_reading_units',
  'authority_bindings',
];
const FORBIDDEN_AUTHORITY_KEYS = ['authority_explainers', 'authority_id', 'explainer_id'];
const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const LOCATOR_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const CANONICAL_ARTICLE_PATTERN = /^\d{4}(?:-\d{2})?$/u;
const UNIT_KINDS = ['article', 'paragraph', 'item', 'subitem'];
const PARENT_KIND = {
  paragraph: 'article',
  item: 'paragraph',
  subitem: 'item',
};
const TIME_STATES = new Set(['current_as_of_review', 'future_effective', 'historical']);
const LOGICAL_ROLES = new Set([
  'requirement',
  'effect',
  'exception',
  'prohibition',
  'procedure',
  'citation_map',
]);
const LOGICAL_OPERATORS = new Set(['all', 'any', 'sequence', 'none']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SOURCE_SNAPSHOT_PATTERN = /^[a-f0-9]{32}$/u;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function arrayField(value, key, errors, label = 'knowledge') {
  if (!own(value, key)) return [];
  if (!Array.isArray(value[key])) {
    errors.push(`${label}.${key}는 배열이어야 합니다.`);
    return [];
  }
  return value[key];
}

function uniqueMap(rows, idKey, label, errors) {
  const result = new Map();
  for (const [index, row] of rows.entries()) {
    if (!isRecord(row)) {
      errors.push(`${label}[${index}]는 객체여야 합니다.`);
      continue;
    }
    const id = row[idKey];
    if (!nonEmpty(id)) {
      errors.push(`${label}[${index}].${idKey}가 비어 있습니다.`);
      continue;
    }
    if (result.has(id)) errors.push(`${label} ${idKey} 중복: ${id}`);
    result.set(id, row);
  }
  return result;
}

function setEqual(left, right) {
  return left.size === right.size && [...left].every(value => right.has(value));
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function exactSha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isOfficialStatuteUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && (hostname === 'law.go.kr' || hostname === 'www.law.go.kr');
  } catch {
    return false;
  }
}

function locatorIdentity(locator) {
  return JSON.stringify({
    article_no: locator?.article_no ?? null,
    paragraph_no: locator?.paragraph_no ?? null,
    item_no: locator?.item_no ?? null,
    subitem_no: locator?.subitem_no ?? null,
  });
}

function routeIdentity(routeKey) {
  return `${routeKey?.law_key ?? ''}/${routeKey?.article_no ?? ''}`;
}

function canonicalSourceArticleNo(value) {
  if (!nonEmpty(value)) return null;
  const match = /^제([1-9]\d*)조(?:의([1-9]\d*))?$/u.exec(value.trim());
  if (!match) return null;
  const article = match[1].padStart(4, '0');
  const subArticle = match[2]?.padStart(2, '0');
  return subArticle ? `${article}-${subArticle}` : article;
}

function canonicalRouteArticleNo(value) {
  return CANONICAL_ARTICLE_PATTERN.test(value ?? '') ? value : null;
}

function bundleAsOf(bundle, errors) {
  let raw;
  if (bundle?.schema === 'rulelink_published_bundle_v1') raw = bundle.built_at;
  else if (bundle?.schema === 'rulelink_editorial_preview_bundle_v1') raw = bundle.generated_at;
  else {
    errors.push('authority 시간축은 PublishedBundle.built_at 또는 EditorialPreviewBundle.generated_at이 필요합니다.');
    return null;
  }
  const parsed = Date.parse(raw);
  if (!nonEmpty(raw) || Number.isNaN(parsed)) {
    errors.push('authority 시간축 기준시각이 유효한 ISO 시각이 아닙니다.');
    return null;
  }
  return parsed;
}

function computedTimeState(effectiveFrom, effectiveTo, asOf) {
  const from = Date.parse(effectiveFrom);
  const to = effectiveTo === undefined ? Number.POSITIVE_INFINITY : Date.parse(effectiveTo);
  if (Number.isNaN(from) || Number.isNaN(to) || from >= to || asOf === null) return null;
  if (asOf < from) return 'future_effective';
  if (asOf >= to) return 'historical';
  return 'current_as_of_review';
}

function detectParentCycle(rowsById, parentKey, label, errors) {
  for (const start of rowsById.keys()) {
    const visited = new Set();
    let current = start;
    while (current) {
      if (visited.has(current)) {
        errors.push(`${label} 부모 순환: ${start}`);
        break;
      }
      visited.add(current);
      current = rowsById.get(current)?.[parentKey] ?? '';
    }
  }
}

function validLocatorForKind(unit) {
  const locator = unit.locator;
  if (
    !isRecord(locator) ||
    canonicalRouteArticleNo(locator.article_no) === null
  ) return false;
  const present = {
    paragraph: nonEmpty(locator.paragraph_no),
    item: nonEmpty(locator.item_no),
    subitem: nonEmpty(locator.subitem_no),
  };
  if (unit.unit_kind === 'article') return !present.paragraph && !present.item && !present.subitem;
  if (unit.unit_kind === 'paragraph') return present.paragraph && !present.item && !present.subitem;
  if (unit.unit_kind === 'item') return present.paragraph && present.item && !present.subitem;
  if (unit.unit_kind === 'subitem') return present.paragraph && present.item && present.subitem;
  return false;
}

function parentLocatorMatches(parent, unit) {
  const parentLocator = parent?.locator;
  const locator = unit?.locator;
  if (!isRecord(parentLocator) || !isRecord(locator)) return false;
  if (parentLocator.article_no !== locator.article_no) return false;
  if (unit.unit_kind === 'item' || unit.unit_kind === 'subitem') {
    if (parentLocator.paragraph_no !== locator.paragraph_no) return false;
  }
  if (unit.unit_kind === 'subitem') {
    if (parentLocator.item_no !== locator.item_no) return false;
  }
  return true;
}

function authorityArrays(bundle, errors) {
  if (!isRecord(bundle?.knowledge)) return null;
  const knowledge = bundle.knowledge;
  for (const key of FORBIDDEN_AUTHORITY_KEYS) {
    if (own(knowledge, key)) errors.push(`금지된 authority 호환 별칭입니다: knowledge.${key}`);
  }
  return Object.fromEntries(
    AUTHORITY_COLLECTIONS.map(key => [key, arrayField(knowledge, key, errors)]),
  );
}

export function inspectPublicAuthorityReading(bundle) {
  const errors = [];
  const collections = authorityArrays(bundle, errors);
  if (!collections) {
    return {
      errors,
      activeAuthorityReadingUnitIds: [],
      authorityReadingUnitCount: 0,
    };
  }
  const {
    source_authority_units: units,
    source_version_bridges: bridges,
    authority_reading_units: readingUnits,
    authority_bindings: bindings,
  } = collections;
  const authorityCount = units.length + bridges.length + readingUnits.length + bindings.length;
  if (authorityCount === 0) {
    return {
      errors,
      activeAuthorityReadingUnitIds: [],
      authorityReadingUnitCount: 0,
    };
  }
  for (const key of AUTHORITY_COLLECTIONS) {
    if (collections[key].length === 0) {
      errors.push(`authority 데이터가 활성화됐지만 knowledge.${key}가 비어 있습니다.`);
    }
  }

  const knowledge = bundle.knowledge;
  const sources = Array.isArray(knowledge.sources) ? knowledge.sources : [];
  const contents = Array.isArray(knowledge.content_entries) ? knowledge.content_entries : [];
  const sourceById = uniqueMap(sources, 'coordinate_id', 'knowledge.sources', errors);
  const contentById = uniqueMap(contents, 'content_id', 'knowledge.content_entries', errors);
  const bridgeById = uniqueMap(bridges, 'bridge_id', 'source_version_bridges', errors);
  const unitById = uniqueMap(
    units,
    'source_authority_unit_id',
    'source_authority_units',
    errors,
  );
  const readingById = uniqueMap(
    readingUnits,
    'authority_reading_unit_id',
    'authority_reading_units',
    errors,
  );
  const bindingById = uniqueMap(bindings, 'binding_id', 'authority_bindings', errors);
  const asOf = bundleAsOf(bundle, errors);

  for (const row of readingUnits) {
    if (own(row, 'authority_id') || own(row, 'explainer_id')) {
      errors.push(`authority reading unit에 금지된 식별자 별칭이 있습니다: ${row.authority_reading_unit_id ?? 'unknown'}`);
    }
    if (own(row, 'version_scope')) {
      errors.push(`authority reading unit에 금지된 시간상태 별칭이 있습니다: ${row.authority_reading_unit_id ?? 'unknown'}`);
    }
  }

  const usedBridgeIds = new Set();
  const bridgeReceiptKeys = new Set();
  const unitLocatorByRoute = new Map();
  const unitByLocatorKey = new Map();
  const siblingOrdinals = new Set();
  for (const unit of units) {
    const id = unit.source_authority_unit_id;
    if (!UNIT_KINDS.includes(unit.unit_kind)) {
      errors.push(`source authority unit 종류 오류: ${id}`);
    }
    if (!validLocatorForKind(unit)) {
      errors.push(`source authority unit locator 깊이 오류: ${id}`);
    }
    if (!LOCATOR_PATTERN.test(unit.locator_key ?? '')) {
      errors.push(`source authority unit locator_key 오류: ${id}`);
    }
    if (
      !nonEmpty(unit.source_coordinate_id) ||
      !SOURCE_SNAPSHOT_PATTERN.test(unit.source_snapshot_id ?? '') ||
      !nonEmpty(unit.source_version_key) ||
      !nonEmpty(unit.version_bridge_id)
    ) {
      errors.push(`source authority unit source receipt 누락: ${id}`);
    }
    if (
      !nonEmpty(unit.official_text_ko) ||
      !SHA256_PATTERN.test(unit.official_text_hash ?? '') ||
      exactSha256(unit.official_text_ko ?? '') !== unit.official_text_hash
    ) {
      errors.push(`source authority unit 공식 원문 또는 해시 누락: ${id}`);
    }
    if (unit.validation_status !== 'verified') {
      errors.push(`source authority unit 미검증: ${id}`);
    }
    if (!Number.isInteger(unit.ordinal) || unit.ordinal < 0) {
      errors.push(`source authority unit ordinal 오류: ${id}`);
    }
    const parentId = unit.parent_source_authority_unit_id ?? '';
    const ordinalIdentity = `${unit.version_bridge_id}|${parentId || 'ROOT'}|${unit.ordinal}`;
    if (siblingOrdinals.has(ordinalIdentity)) {
      errors.push(`source authority unit sibling ordinal 중복: ${ordinalIdentity}`);
    }
    siblingOrdinals.add(ordinalIdentity);
    if (unit.unit_kind === 'article' && parentId) {
      errors.push(`article source authority unit은 부모를 가질 수 없습니다: ${id}`);
    }
    if (unit.unit_kind !== 'article') {
      const parent = unitById.get(parentId);
      if (!parent) {
        errors.push(`source authority unit 부모 누락: ${id} -> ${parentId}`);
      } else {
        if (parent.unit_kind !== PARENT_KIND[unit.unit_kind]) {
          errors.push(`source authority unit 부모 계층 오류: ${id}`);
        }
        if (!parentLocatorMatches(parent, unit)) {
          errors.push(`source authority unit 부모 locator 불일치: ${id}`);
        }
        for (const key of [
          'source_coordinate_id',
          'source_snapshot_id',
          'source_version_key',
          'version_bridge_id',
        ]) {
          if (parent[key] !== unit[key]) {
            errors.push(`source authority unit 부모 ${key} 불일치: ${id}`);
          }
        }
      }
    }
    const source = sourceById.get(unit.source_coordinate_id);
    if (!source) {
      errors.push(`source authority unit의 source 누락: ${id} -> ${unit.source_coordinate_id}`);
    } else {
      if (
        source.source_kind !== 'statute' ||
        !nonEmpty(source.law_key) ||
        canonicalSourceArticleNo(source.article_no) === null ||
        !nonEmpty(source.source_version_key) ||
        !SOURCE_SNAPSHOT_PATTERN.test(source.source_snapshot_id ?? '')
      ) {
        errors.push(`authority statute source 정본 필드 누락: ${unit.source_coordinate_id}`);
      }
      if (
        source.source_snapshot_id !== unit.source_snapshot_id ||
        source.source_version_key !== unit.source_version_key ||
        canonicalSourceArticleNo(source.article_no) !== unit.locator.article_no
      ) {
        errors.push(`source authority unit source receipt 불일치: ${id}`);
      }
      if (
        source.official_url_http_status !== 200 ||
        !isOfficialStatuteUrl(source.official_url)
      ) {
        errors.push(`authority 공식 URL 검증 실패: ${unit.source_coordinate_id}`);
      }
      const lastVerified = Date.parse(source.last_verified_at);
      if (
        Number.isNaN(lastVerified) ||
        (asOf !== null && lastVerified > asOf + 5 * 60 * 1000)
      ) {
        errors.push(`authority source last_verified_at 오류: ${unit.source_coordinate_id}`);
      }
    }
    const bridge = bridgeById.get(unit.version_bridge_id);
    if (!bridge) {
      errors.push(`source authority unit bridge 누락: ${id}`);
    } else {
      usedBridgeIds.add(bridge.bridge_id);
      if (
        bridge.validation_status !== 'verified' ||
        bridge.source_coordinate_id !== unit.source_coordinate_id ||
        bridge.source_snapshot_id !== unit.source_snapshot_id ||
        bridge.source_version_key !== unit.source_version_key
      ) {
        errors.push(`source authority unit bridge receipt 불일치: ${id}`);
      }
    }
    const locatorIdentityKey = `${unit.source_coordinate_id}|${unit.source_version_key}|${locatorIdentity(unit.locator)}`;
    const locatorKeyIdentity = `${unit.source_coordinate_id}|${unit.source_version_key}|${unit.locator_key}`;
    if (unitLocatorByRoute.has(locatorIdentityKey)
      && unitLocatorByRoute.get(locatorIdentityKey) !== unit.locator_key) {
      errors.push(`같은 locator 구조의 locator_key 불일치: ${id}`);
    }
    if (unitByLocatorKey.has(locatorKeyIdentity)
      && unitByLocatorKey.get(locatorKeyIdentity) !== locatorIdentity(unit.locator)) {
      errors.push(`서로 다른 locator의 locator_key 중복: ${id}`);
    }
    unitLocatorByRoute.set(locatorIdentityKey, unit.locator_key);
    unitByLocatorKey.set(locatorKeyIdentity, locatorIdentity(unit.locator));
  }
  detectParentCycle(unitById, 'parent_source_authority_unit_id', 'source authority unit', errors);
  for (const bridge of bridges) {
    if (
      bridge.validation_status !== 'verified' ||
      !nonEmpty(bridge.source_coordinate_id) ||
      !SOURCE_SNAPSHOT_PATTERN.test(bridge.source_snapshot_id ?? '') ||
      !nonEmpty(bridge.source_version_key)
    ) {
      errors.push(`source version bridge 정본 필드 오류: ${bridge.bridge_id}`);
    }
    const receiptKey = [
      bridge.source_coordinate_id,
      bridge.source_snapshot_id,
      bridge.source_version_key,
    ].join('|');
    if (bridgeReceiptKeys.has(receiptKey)) {
      errors.push(`source version bridge receipt 중복: ${receiptKey}`);
    }
    bridgeReceiptKeys.add(receiptKey);
    if (!usedBridgeIds.has(bridge.bridge_id)) {
      errors.push(`source authority unit이 사용하지 않는 고아 bridge: ${bridge.bridge_id}`);
    }
  }

  const globalAnchorById = new Map();
  const readingByAnchorId = new Map();
  const usedUnitIds = new Set();
  const readingIntervals = new Map();
  const activeAuthorityReadingUnitIds = [];
  for (const reading of readingUnits) {
    const id = reading.authority_reading_unit_id;
    const route = reading.route_key;
    const routeId = routeIdentity(route);
    if (
      !isRecord(route) ||
      !SEGMENT_PATTERN.test(route.law_key ?? '') ||
      canonicalRouteArticleNo(route.article_no) === null
    ) {
      errors.push(`authority route_key 오류: ${id}`);
    }
    if (
      !nonEmpty(reading.source_coordinate_id) ||
      !SOURCE_SNAPSHOT_PATTERN.test(reading.source_snapshot_id ?? '') ||
      !nonEmpty(reading.source_version_key)
    ) {
      errors.push(`authority reading unit source receipt 누락: ${id}`);
    }
    const source = sourceById.get(reading.source_coordinate_id);
    if (!source) {
      errors.push(`authority reading unit source 누락: ${id}`);
    } else if (
      source.law_key !== route?.law_key ||
      canonicalSourceArticleNo(source.article_no) !== route?.article_no ||
      source.source_snapshot_id !== reading.source_snapshot_id ||
      source.source_version_key !== reading.source_version_key
    ) {
      errors.push(`authority route/source receipt 불일치: ${id}`);
    }
    const effectiveFrom = Date.parse(reading.effective_from);
    const effectiveTo = reading.effective_to === undefined
      ? Number.POSITIVE_INFINITY
      : Date.parse(reading.effective_to);
    if (Number.isNaN(effectiveFrom) || Number.isNaN(effectiveTo) || effectiveFrom >= effectiveTo) {
      errors.push(`authority 유효기간 오류: ${id}`);
    }
    const expectedState = computedTimeState(
      reading.effective_from,
      reading.effective_to,
      asOf,
    );
    if (!TIME_STATES.has(reading.time_state) || expectedState !== reading.time_state) {
      errors.push(`authority time_state 오류: ${id}`);
    }
    const intervalKey = routeId;
    const intervals = readingIntervals.get(intervalKey) ?? [];
    for (const interval of intervals) {
      if (effectiveFrom < interval.to && interval.from < effectiveTo) {
        errors.push(`같은 authority route의 유효기간 중첩: ${intervalKey}`);
      }
    }
    intervals.push({from: effectiveFrom, to: effectiveTo, id, state: reading.time_state});
    readingIntervals.set(intervalKey, intervals);
    if (!nonEmpty(reading.title_ko)) errors.push(`authority title_ko 누락: ${id}`);
    if (!nonEmpty(reading.summary_ko)) errors.push(`authority summary_ko 누락: ${id}`);

    if (!Array.isArray(reading.anchors) || reading.anchors.length === 0) {
      errors.push(`authority anchor 누락: ${id}`);
      continue;
    }
    const localAnchorById = uniqueMap(reading.anchors, 'anchor_id', `${id}.anchors`, errors);
    let rootArticleCount = 0;
    for (const anchor of reading.anchors) {
      const anchorId = anchor.anchor_id;
      if (globalAnchorById.has(anchorId)) errors.push(`authority anchor 전역 중복: ${anchorId}`);
      globalAnchorById.set(anchorId, anchor);
      readingByAnchorId.set(anchorId, reading);
      const unit = unitById.get(anchor.source_authority_unit_id);
      if (!unit) {
        errors.push(`authority anchor source unit 누락: ${anchorId}`);
        continue;
      }
      usedUnitIds.add(unit.source_authority_unit_id);
      if (
        unit.source_coordinate_id !== reading.source_coordinate_id ||
        unit.source_snapshot_id !== reading.source_snapshot_id ||
        unit.source_version_key !== reading.source_version_key ||
        unit.locator_key !== anchor.locator_key ||
        unit.official_text_hash !== anchor.official_text_hash
      ) {
        errors.push(`authority anchor source unit receipt 불일치: ${anchorId}`);
      }
      if (!nonEmpty(anchor.plain_heading_ko) || !nonEmpty(anchor.explanation_ko)) {
        errors.push(`authority anchor 쉬운 설명 누락: ${anchorId}`);
      }
      const sourceParentId = unit.parent_source_authority_unit_id ?? '';
      const anchorParentId = anchor.parent_anchor_id ?? '';
      if (!sourceParentId && anchorParentId) {
        errors.push(`authority root anchor는 부모를 가질 수 없습니다: ${anchorId}`);
      } else if (sourceParentId) {
        const parentAnchor = localAnchorById.get(anchorParentId);
        if (!parentAnchor || parentAnchor.source_authority_unit_id !== sourceParentId) {
          errors.push(`authority anchor/source parent 불일치: ${anchorId}`);
        }
      }
      if (
        unit.unit_kind === 'article' &&
        (unit.locator.article_no !== route?.article_no || anchorParentId)
      ) {
        errors.push(`authority route의 root article 불일치: ${anchorId}`);
      }
      if (unit.unit_kind === 'article') rootArticleCount += 1;
    }
    if (rootArticleCount !== 1) {
      errors.push(`authority reading unit에는 root article anchor가 정확히 하나여야 합니다: ${id}`);
    }
    detectParentCycle(localAnchorById, 'parent_anchor_id', 'authority anchor', errors);

    if (!Array.isArray(reading.logical_groups)) {
      errors.push(`authority logical_groups는 배열이어야 합니다: ${id}`);
    }
    if (!Array.isArray(reading.explanation_paragraphs)) {
      errors.push(`authority explanation_paragraphs는 배열이어야 합니다: ${id}`);
    }
    if (!Array.isArray(reading.citation_edges)) {
      errors.push(`authority citation_edges는 배열이어야 합니다: ${id}`);
    }
    const groups = Array.isArray(reading.logical_groups) ? reading.logical_groups : [];
    const paragraphs = Array.isArray(reading.explanation_paragraphs)
      ? reading.explanation_paragraphs
      : [];
    if (groups.length === 0) errors.push(`authority logical_groups 누락: ${id}`);
    if (paragraphs.length === 0) errors.push(`authority explanation_paragraphs 누락: ${id}`);
    const groupById = uniqueMap(groups, 'logical_group_id', `${id}.logical_groups`, errors);
    const groupOrdinals = new Set();
    const groupedAnchorIds = new Set();
    for (const group of groups) {
      if (!LOGICAL_ROLES.has(group.role) || !LOGICAL_OPERATORS.has(group.operator)) {
        errors.push(`authority logical group role/operator 오류: ${group.logical_group_id}`);
      }
      if (!nonEmpty(group.title_ko)) {
        errors.push(`authority logical group 제목 누락: ${group.logical_group_id}`);
      }
      if (!Number.isInteger(group.ordinal) || group.ordinal < 0) {
        errors.push(`authority logical group ordinal 오류: ${group.logical_group_id}`);
      } else if (groupOrdinals.has(group.ordinal)) {
        errors.push(`authority logical group ordinal 중복: ${id}/${group.ordinal}`);
      }
      groupOrdinals.add(group.ordinal);
      if (!Array.isArray(group.anchor_ids) || group.anchor_ids.length === 0) {
        errors.push(`authority logical group anchor 누락: ${group.logical_group_id}`);
      }
      if (duplicateValues(group.anchor_ids ?? []).length > 0) {
        errors.push(`authority logical group anchor 중복: ${group.logical_group_id}`);
      }
      for (const anchorId of group.anchor_ids ?? []) {
        if (!localAnchorById.has(anchorId)) {
          errors.push(`authority logical group anchor 대상 누락: ${group.logical_group_id} -> ${anchorId}`);
        }
        groupedAnchorIds.add(anchorId);
      }
    }
    for (const anchorId of localAnchorById.keys()) {
      if (!groupedAnchorIds.has(anchorId)) {
        errors.push(`logical group이 사용하지 않는 고아 anchor: ${id} -> ${anchorId}`);
      }
    }
    uniqueMap(
      paragraphs,
      'explanation_paragraph_id',
      `${id}.explanation_paragraphs`,
      errors,
    );
    for (const paragraph of paragraphs) {
      if (!nonEmpty(paragraph.text_ko)) {
        errors.push(`authority 설명 단락 본문 누락: ${paragraph.explanation_paragraph_id}`);
      }
      const group = groupById.get(paragraph.logical_group_id);
      if (!group) {
        errors.push(`authority 설명 단락 logical_group 누락: ${paragraph.explanation_paragraph_id}`);
      }
      if (!Array.isArray(paragraph.anchor_ids) || paragraph.anchor_ids.length === 0) {
        errors.push(`authority 설명 단락 anchor 누락: ${paragraph.explanation_paragraph_id}`);
      }
      if (duplicateValues(paragraph.anchor_ids ?? []).length > 0) {
        errors.push(`authority 설명 단락 anchor 중복: ${paragraph.explanation_paragraph_id}`);
      }
      for (const anchorId of paragraph.anchor_ids ?? []) {
        if (!localAnchorById.has(anchorId)) {
          errors.push(`authority 설명 단락 anchor 대상 누락: ${paragraph.explanation_paragraph_id} -> ${anchorId}`);
        }
        if (group && !(group.anchor_ids ?? []).includes(anchorId)) {
          errors.push(`authority 설명 단락 anchor가 logical_group 범위를 벗어났습니다: ${paragraph.explanation_paragraph_id} -> ${anchorId}`);
        }
      }
    }
    const citations = Array.isArray(reading.citation_edges) ? reading.citation_edges : [];
    const citationById = uniqueMap(citations, 'citation_edge_id', `${id}.citation_edges`, errors);
    void citationById;
    for (const citation of citations) {
      if (!localAnchorById.has(citation.source_anchor_id)) {
        errors.push(`authority citation source anchor 누락: ${citation.citation_edge_id}`);
      }
      if (!nonEmpty(citation.quoted_law_key)) {
        errors.push(`authority citation quoted_law_key 누락: ${citation.citation_edge_id}`);
      }
      if (!['inactive', 'active'].includes(citation.publication_status)) {
        errors.push(`authority citation publication_status 오류: ${citation.citation_edge_id}`);
      }
      if (!['resolved', 'unresolved', 'target_missing'].includes(citation.resolution_status)) {
        errors.push(`authority citation resolution_status 오류: ${citation.citation_edge_id}`);
      }
      if (
        citation.publication_status === 'active' &&
        citation.resolution_status !== 'resolved'
      ) {
        errors.push(`미해결 authority citation 활성화: ${citation.citation_edge_id}`);
      }
    }
    if (
      reading.editorial_status === 'approved' &&
      reading.time_state === 'current_as_of_review'
    ) {
      activeAuthorityReadingUnitIds.push(id);
    }
    if (
      bundle.schema === 'rulelink_published_bundle_v1' &&
      reading.editorial_status !== 'approved'
    ) {
      errors.push(`공개 authority reading unit이 승인 상태가 아닙니다: ${id}`);
    }
  }
  for (const [route, intervals] of readingIntervals) {
    if (intervals.filter(interval => interval.state === 'current_as_of_review').length > 1) {
      errors.push(`기준시각 현재 authority가 둘 이상입니다: ${route}`);
    }
    const identities = intervals.map(interval => {
      const reading = readingById.get(interval.id);
      return `${route}|${reading?.source_version_key ?? ''}`;
    });
    for (const duplicate of duplicateValues(identities)) {
      errors.push(`authority route/source_version_key 중복: ${duplicate}`);
    }
  }
  const bindingsByContent = new Map();
  const bindingCountByReading = new Map();
  for (const binding of bindings) {
    const id = binding.binding_id;
    if (binding.from_kind !== 'content' || binding.to_kind !== 'authority_reading_unit') {
      errors.push(`authority binding kind 오류: ${id}`);
    }
    const content = contentById.get(binding.from_id);
    const reading = readingById.get(binding.to_authority_reading_unit_id);
    if (!content) errors.push(`authority binding content 누락: ${id}`);
    if (!reading) {
      errors.push(`authority binding reading unit 누락: ${id}`);
      continue;
    }
    if (!Array.isArray(binding.anchor_ids) || binding.anchor_ids.length === 0) {
      errors.push(`authority binding anchor 누락: ${id}`);
    }
    if (duplicateValues(binding.anchor_ids ?? []).length > 0) {
      errors.push(`authority binding anchor 중복: ${id}`);
    }
    const readingAnchorIds = new Set((reading.anchors ?? []).map(anchor => anchor.anchor_id));
    for (const anchorId of binding.anchor_ids ?? []) {
      if (!readingAnchorIds.has(anchorId)) {
        errors.push(`authority binding anchor 대상 누락: ${id} -> ${anchorId}`);
      }
    }
    const list = bindingsByContent.get(binding.from_id) ?? [];
    list.push(id);
    bindingsByContent.set(binding.from_id, list);
    bindingCountByReading.set(
      reading.authority_reading_unit_id,
      (bindingCountByReading.get(reading.authority_reading_unit_id) ?? 0) + 1,
    );
  }
  for (const content of contents) {
    const projected = bindingsByContent.get(content.content_id) ?? [];
    const explicit = content.authority_binding_ids;
    if (explicit !== undefined && !Array.isArray(explicit)) {
      errors.push(`ContentEntry.authority_binding_ids는 배열이어야 합니다: ${content.content_id}`);
      continue;
    }
    const explicitValues = explicit ?? [];
    if (duplicateValues(explicitValues).length > 0) {
      errors.push(`ContentEntry authority_binding_ids 중복: ${content.content_id}`);
    }
    if (!setEqual(new Set(projected), new Set(explicitValues))) {
      errors.push(`ContentEntry authority binding 역투영 불일치: ${content.content_id}`);
    }
    for (const bindingId of explicitValues) {
      if (!bindingById.has(bindingId)) {
        errors.push(`ContentEntry dangling authority binding: ${content.content_id} -> ${bindingId}`);
      }
    }
  }
  for (const readingId of readingById.keys()) {
    if ((bindingCountByReading.get(readingId) ?? 0) === 0) {
      errors.push(`content binding이 없는 고아 authority reading unit: ${readingId}`);
    }
  }

  for (const reading of readingUnits) {
    for (const citation of reading.citation_edges ?? []) {
      if (citation.target_kind === 'authority_reading_unit') {
        if (
          !nonEmpty(citation.target_authority_reading_unit_id) ||
          !nonEmpty(citation.target_anchor_id)
        ) {
          errors.push(`authority citation target reading 필드 누락: ${citation.citation_edge_id}`);
        }
        const target = readingById.get(citation.target_authority_reading_unit_id);
        if (!target) {
          errors.push(`authority citation target reading unit 누락: ${citation.citation_edge_id}`);
        } else if (!(target.anchors ?? []).some(anchor => anchor.anchor_id === citation.target_anchor_id)) {
          errors.push(`authority citation target anchor 누락: ${citation.citation_edge_id}`);
        } else {
          const targetSource = sourceById.get(target.source_coordinate_id);
          if (!targetSource || targetSource.law_key !== citation.quoted_law_key) {
            errors.push(`authority citation 법률 문맥 오귀속: ${citation.citation_edge_id}`);
          }
        }
        if (
          own(citation, 'target_source_authority_unit_id') ||
          own(citation, 'target_attachment_id') ||
          own(citation, 'attachment_status')
        ) {
          errors.push(`authority citation target 필드 혼용: ${citation.citation_edge_id}`);
        }
      } else if (citation.target_kind === 'source_authority_unit') {
        if (!nonEmpty(citation.target_source_authority_unit_id)) {
          errors.push(`authority citation target source unit 필드 누락: ${citation.citation_edge_id}`);
        }
        const targetUnit = unitById.get(citation.target_source_authority_unit_id);
        if (!targetUnit) {
          errors.push(`authority citation target source unit 누락: ${citation.citation_edge_id}`);
        } else {
          usedUnitIds.add(targetUnit.source_authority_unit_id);
          const targetSource = sourceById.get(targetUnit.source_coordinate_id);
          if (!targetSource || targetSource.law_key !== citation.quoted_law_key) {
            errors.push(`authority citation 법률 문맥 오귀속: ${citation.citation_edge_id}`);
          }
        }
        if (
          own(citation, 'target_authority_reading_unit_id') ||
          own(citation, 'target_anchor_id') ||
          own(citation, 'target_attachment_id') ||
          own(citation, 'attachment_status')
        ) {
          errors.push(`authority citation target 필드 혼용: ${citation.citation_edge_id}`);
        }
      } else if (citation.target_kind === 'precedent') {
        if (
          !nonEmpty(citation.target_attachment_id) ||
          citation.attachment_status !== 'verified'
        ) {
          errors.push(`판례 attachment 없는 authority citation 활성화: ${citation.citation_edge_id}`);
        }
        if (
          own(citation, 'target_authority_reading_unit_id') ||
          own(citation, 'target_anchor_id') ||
          own(citation, 'target_source_authority_unit_id')
        ) {
          errors.push(`authority citation target 필드 혼용: ${citation.citation_edge_id}`);
        }
      } else {
        errors.push(`authority citation target_kind 오류: ${citation.citation_edge_id}`);
      }
    }
  }
  for (const unitId of unitById.keys()) {
    if (!usedUnitIds.has(unitId)) {
      errors.push(`authority anchor 또는 citation이 사용하지 않는 고아 source unit: ${unitId}`);
    }
  }

  return {
    errors: [...new Set(errors)],
    activeAuthorityReadingUnitIds,
    authorityReadingUnitCount: readingUnits.length,
  };
}

export function validatePublicAuthorityReading(bundle) {
  const result = inspectPublicAuthorityReading(bundle);
  if (result.errors.length > 0) throw new Error(result.errors.join('\n'));
  return {
    activeAuthorityReadingUnitIds: result.activeAuthorityReadingUnitIds,
    authorityReadingUnitCount: result.authorityReadingUnitCount,
  };
}

export async function validatePublicAuthorityReadingFile({
  bundlePath = path.resolve(
    process.cwd(),
    '..',
    '..',
    'artifacts',
    'publication',
    'current',
    'bundle.json',
  ),
} = {}) {
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const result = validatePublicAuthorityReading(bundle);
  console.log(
    `공개 조문 읽기 정본 검증 통과: ${bundle.snapshot_id ?? 'unknown'}, 활성 ${result.activeAuthorityReadingUnitIds.length}건`,
  );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validatePublicAuthorityReadingFile({
    bundlePath: process.argv[2] ? path.resolve(process.argv[2]) : undefined,
  }).catch(error => {
    console.error(
      `공개 조문 읽기 정본 검증 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
