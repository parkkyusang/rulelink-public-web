import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {projectChangeBrief} from '../src/lib/change-brief-projection.ts';
import {buildKnowledgeHubConnections} from '../src/lib/knowledge-hub-connections.ts';
import {buildKnowledgeHubJourneys} from '../src/lib/knowledge-hub-journey.ts';
import {resolveKnowledgeEntryGraph} from '../src/lib/knowledge-search.ts';
import {
  buildKnowledgeReadingPath,
  buildKnowledgeRelatedPresentation,
  relatedContentRelations,
} from '../src/lib/knowledge-relations.ts';
import {browserOfficialSourceUrl} from '../src/lib/official-source-url.ts';
import {filterFreshPublications} from '../src/lib/publication-freshness.ts';
import {site} from '../src/lib/site.ts';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const defaultBundlePath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

const PAGE_TYPES = Object.freeze({
  knowledge: {
    prefix: '/ko/knowledge/',
    collection: bundle => bundle?.knowledge?.content_entries ?? [],
    id: page => page.content_id,
    title: page => page.title_ko,
    slug: page => page.slug,
  },
  hub: {
    prefix: '/ko/hubs/',
    collection: bundle => bundle?.knowledge?.topic_hubs ?? [],
    id: page => page.hub_id,
    title: page => page.title_ko,
    slug: page => page.slug,
  },
  change: {
    prefix: '/ko/changes/',
    collection: bundle => bundle?.change_briefs ?? [],
    id: page => page.change_brief_id,
    title: page => page.title_ko,
    slug: page => page.slug,
  },
});

const RECOMMENDATION_PRIORITY = Object.freeze({
  'noindex-review': 4,
  merge: 3,
  improve: 2,
  keep: 1,
});

function list(value) {
  if (Array.isArray(value)) return value.flatMap(list);
  if (value === undefined || value === null) return [];
  if (typeof value === 'object') return Object.values(value).flatMap(list);
  const text = String(value).trim();
  return text ? [text] : [];
}

export function normalizeSearchText(value) {
  return list(value)
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function characterNgrams(value, size = 2) {
  const compact = normalizeSearchText(value).replaceAll(' ', '');
  const result = new Set();
  for (let index = 0; index <= compact.length - size; index += 1) {
    result.add(compact.slice(index, index + size));
  }
  return result;
}

const textProfileCache = new Map();

function textProfile(value) {
  const normalized = normalizeSearchText(value);
  const cached = textProfileCache.get(normalized);
  if (cached) return cached;
  const profile = {
    words: new Set(normalized.split(' ').filter(token => token.length >= 2)),
    ngrams: characterNgrams(normalized),
  };
  textProfileCache.set(normalized, profile);
  return profile;
}

function dice(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return (2 * intersection) / (left.size + right.size);
}

export function textSimilarity(left, right) {
  const leftProfile = textProfile(left);
  const rightProfile = textProfile(right);
  return Math.max(
    dice(leftProfile.words, rightProfile.words),
    dice(leftProfile.ngrams, rightProfile.ngrams),
  );
}

function setOverlap(left, right) {
  const a = new Set(list(left).map(normalizeSearchText).filter(Boolean));
  const b = new Set(list(right).map(normalizeSearchText).filter(Boolean));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseNumber(value, fallback = 0) {
  const normalized = String(value ?? '').replaceAll(',', '').trim();
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function parseCtr(value) {
  const normalized = String(value ?? '').trim();
  if (normalized.endsWith('%')) return parseNumber(normalized.slice(0, -1)) / 100;
  return parseNumber(normalized);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text ?? '').replace(/^\uFEFF/u, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/u, ''));
    rows.push(row);
  }
  if (quoted) throw new Error('검색콘솔 CSV의 따옴표가 닫히지 않았습니다.');
  return rows.filter(candidate => candidate.some(value => String(value).trim()));
}

const GSC_HEADER_ALIASES = Object.freeze({
  query: new Set(['query', 'top queries', '검색어', '쿼리']),
  page: new Set(['page', 'pages', 'top pages', '페이지', 'url']),
  clicks: new Set(['clicks', '클릭수', '클릭']),
  impressions: new Set(['impressions', '노출수', '노출']),
  ctr: new Set(['ctr', '클릭률']),
  position: new Set(['position', 'average position', '평균 게재순위', '게재순위']),
});

function canonicalHeader(value) {
  const normalized = normalizeSearchText(value);
  for (const [key, aliases] of Object.entries(GSC_HEADER_ALIASES)) {
    if (aliases.has(normalized)) return key;
  }
  return normalized;
}

export function parseGscCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map(canonicalHeader);
  const required = ['page', 'clicks', 'impressions', 'ctr', 'position'];
  for (const field of required) {
    if (!headers.includes(field)) throw new Error(`검색콘솔 CSV 필수 열이 없습니다: ${field}`);
  }
  return rows.slice(1).map(values => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    return {
      query: String(record.query ?? '').trim(),
      page: String(record.page ?? '').trim(),
      clicks: parseNumber(record.clicks),
      impressions: parseNumber(record.impressions),
      ctr: parseCtr(record.ctr),
      position: parseNumber(record.position),
    };
  }).filter(row => row.page);
}

function gscApiRow(row) {
  if (row && !Array.isArray(row.keys) && row.page) {
    return {
      query: String(row.query ?? '').trim(),
      page: String(row.page).trim(),
      clicks: parseNumber(row.clicks),
      impressions: parseNumber(row.impressions),
      ctr: parseCtr(row.ctr),
      position: parseNumber(row.position),
    };
  }
  const keys = Array.isArray(row?.keys) ? row.keys.map(value => String(value ?? '').trim()) : [];
  const page = keys.find(value => /^https?:\/\//iu.test(value) || value.startsWith('/')) ?? '';
  const query = keys.find(value => value !== page) ?? '';
  return {
    query,
    page,
    clicks: parseNumber(row?.clicks),
    impressions: parseNumber(row?.impressions),
    ctr: parseCtr(row?.ctr),
    position: parseNumber(row?.position),
  };
}

export function parseGscJson(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows)) throw new Error('검색콘솔 JSON은 rows 배열 또는 행 배열이어야 합니다.');
  return rows.map(gscApiRow).filter(row => row.page);
}

export async function loadGscInput(inputPath) {
  if (!inputPath) return [];
  const content = await readFile(inputPath, 'utf8');
  return /\.csv$/iu.test(inputPath) ? parseGscCsv(content) : parseGscJson(content);
}

function canonicalPath(value, baseUrl) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(text, baseUrl);
    return url.pathname.replace(/\/+$/u, '') || '/';
  } catch {
    return text.split(/[?#]/u)[0].replace(/\/+$/u, '') || '/';
  }
}

function pageUrl(baseUrl, prefix, slug) {
  return new URL(`${prefix}${slug}`, `${baseUrl.replace(/\/+$/u, '')}/`).toString();
}

function pageText(pageType, page) {
  if (pageType === 'knowledge') {
    return [
      page.title_ko,
      page.one_line_answer_ko,
      page.audience_situation_ko,
      page.key_points_ko,
      page.search_intents_ko,
      page.body_sections,
    ];
  }
  if (pageType === 'hub') return [page.title_ko, page.description_ko];
  return [
    page.title_ko,
    page.summary_ko,
    page.affected_audiences,
    page.changed_points,
    page.action_checklist,
    page.norm_delta?.legal_effect_delta_ko,
  ];
}

function pageSearchIntents(pageType, page) {
  if (pageType === 'knowledge') return list(page.search_intents_ko);
  return [];
}

function comparePageSimilarity(left, right) {
  const title = textSimilarity(left.title, right.title);
  const body = textSimilarity(left.text, right.text);
  const intents = setOverlap(left.searchIntents, right.searchIntents);
  return round((title * 0.5) + (body * 0.3) + (intents * 0.2), 4);
}

function buildPageRecords(bundle, baseUrl) {
  const records = [];
  for (const [pageType, contract] of Object.entries(PAGE_TYPES)) {
    for (const page of contract.collection(bundle)) {
      const slug = contract.slug(page);
      const title = contract.title(page);
      records.push({
        pageType,
        id: contract.id(page),
        slug,
        title,
        path: canonicalPath(`${contract.prefix}${slug}`, baseUrl),
        url: pageUrl(baseUrl, contract.prefix, slug),
        text: pageText(pageType, page),
        searchIntents: pageSearchIntents(pageType, page),
        raw: page,
      });
    }
  }
  return records.sort((left, right) => left.url.localeCompare(right.url, 'en'));
}

function nearestDuplicates(records) {
  const nearest = new Map(records.map(record => [record.id, null]));
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      if (left.pageType !== right.pageType) continue;
      const similarity = comparePageSimilarity(left, right);
      if (!nearest.get(left.id) || nearest.get(left.id).similarity < similarity) {
        nearest.set(left.id, {id: right.id, url: right.url, title: right.title, similarity});
      }
      if (!nearest.get(right.id) || nearest.get(right.id).similarity < similarity) {
        nearest.set(right.id, {id: left.id, url: left.url, title: left.title, similarity});
      }
    }
  }
  return nearest;
}

function aggregateGscRows(rows, records, baseUrl) {
  const recordByPath = new Map(records.map(record => [record.path, record]));
  const metrics = new Map(records.map(record => [record.id, {
    matched_rows: 0,
    clicks: 0,
    impressions: 0,
    weighted_position: 0,
    queries: new Map(),
  }]));
  const unmatched = [];
  for (const row of rows) {
    const pagePath = canonicalPath(row.page, baseUrl);
    const record = recordByPath.get(pagePath);
    if (!record) {
      unmatched.push({...row, canonical_path: pagePath});
      continue;
    }
    const value = metrics.get(record.id);
    value.matched_rows += 1;
    value.clicks += row.clicks;
    value.impressions += row.impressions;
    value.weighted_position += row.position * Math.max(row.impressions, 1);
    const normalizedQuery = normalizeSearchText(row.query);
    if (normalizedQuery) {
      const query = value.queries.get(normalizedQuery) ?? {
        query: row.query,
        clicks: 0,
        impressions: 0,
        weighted_position: 0,
      };
      query.clicks += row.clicks;
      query.impressions += row.impressions;
      query.weighted_position += row.position * Math.max(row.impressions, 1);
      value.queries.set(normalizedQuery, query);
    }
  }
  const result = new Map();
  for (const record of records) {
    const value = metrics.get(record.id);
    const queries = [...value.queries.values()].map(query => ({
      query: query.query,
      clicks: query.clicks,
      impressions: query.impressions,
      ctr: query.impressions ? round(query.clicks / query.impressions, 4) : 0,
      position: query.impressions ? round(query.weighted_position / query.impressions, 2) : null,
    })).sort((left, right) => (
      right.impressions - left.impressions ||
      right.clicks - left.clicks ||
      left.query.localeCompare(right.query, 'ko')
    ));
    result.set(record.id, {
      status: value.matched_rows > 0 ? 'measured' : 'not_provided',
      matched_rows: value.matched_rows,
      clicks: value.clicks,
      impressions: value.impressions,
      ctr: value.impressions ? round(value.clicks / value.impressions, 4) : null,
      position: value.impressions ? round(value.weighted_position / value.impressions, 2) : null,
      queries,
    });
  }
  return {metrics: result, unmatched};
}

function queryCannibalization(gscRows, records, baseUrl) {
  const recordByPath = new Map(records.map(record => [record.path, record]));
  const grouped = new Map();
  for (const row of gscRows) {
    const query = normalizeSearchText(row.query);
    const record = recordByPath.get(canonicalPath(row.page, baseUrl));
    if (!query || !record) continue;
    if (!grouped.has(query)) grouped.set(query, new Map());
    const page = grouped.get(query);
    const existing = page.get(record.id) ?? {
      id: record.id,
      url: record.url,
      title: record.title,
      impressions: 0,
      clicks: 0,
    };
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    page.set(record.id, existing);
  }
  return [...grouped.entries()].filter(([, pages]) => pages.size > 1).map(([query, pages]) => ({
    source: 'gsc',
    query,
    pages: [...pages.values()].sort((left, right) => (
      right.impressions - left.impressions || left.url.localeCompare(right.url, 'en')
    )),
    total_impressions: [...pages.values()].reduce((sum, page) => sum + page.impressions, 0),
  })).sort((left, right) => (
    right.total_impressions - left.total_impressions || left.query.localeCompare(right.query, 'ko')
  ));
}

function declaredIntentCannibalization(records) {
  const grouped = new Map();
  for (const record of records.filter(record => record.pageType === 'knowledge')) {
    for (const intent of record.searchIntents) {
      const normalized = normalizeSearchText(intent);
      if (!normalized) continue;
      if (!grouped.has(normalized)) grouped.set(normalized, []);
      grouped.get(normalized).push({
        id: record.id,
        url: record.url,
        title: record.title,
        intent,
      });
    }
  }
  return [...grouped.entries()].filter(([, pages]) => {
    return new Set(pages.map(page => page.id)).size > 1;
  }).map(([query, pages]) => ({
    source: 'declared_search_intent',
    query,
    pages: pages.sort((left, right) => left.url.localeCompare(right.url, 'en')),
    total_impressions: null,
  })).sort((left, right) => (
    right.pages.length - left.pages.length || left.query.localeCompare(right.query, 'ko')
  ));
}

function runtimePublicationProjection(bundle, asOf) {
  const now = new Date(asOf);
  const knowledge = bundle?.knowledge ?? {};
  const allEntries = knowledge.content_entries ?? [];
  const entries = filterFreshPublications(allEntries, now);
  const concepts = filterFreshPublications(knowledge.concept_cards ?? [], now);
  const entryById = new Map(entries.map(entry => [entry.content_id, entry]));
  const hubs = (knowledge.topic_hubs ?? []).filter(hub => (
    hub.content_ids.some(contentId => entryById.has(contentId))
  ));
  const allEntryById = new Map(allEntries.map(entry => [entry.content_id, entry]));
  const entryGraphById = new Map(entries.map(entry => [
    entry.content_id,
    resolveKnowledgeEntryGraph(knowledge, entry),
  ]));
  const outbound = new Map();
  const broken = new Map();
  const hidden = new Map();

  for (const entry of entries) {
    const sameHubContentIds = hubs
      .filter(hub => (entry.hub_ids ?? []).includes(hub.hub_id))
      .flatMap(hub => hub.content_ids);
    const presentation = buildKnowledgeRelatedPresentation(
      entry,
      entries,
      sameHubContentIds,
    );
    const readingPath = buildKnowledgeReadingPath(
      entry,
      entries,
      concepts,
      sameHubContentIds,
    );
    const renderedIds = new Set(presentation.related.map(target => target.content_id));
    for (const section of readingPath) {
      for (const item of section.items) {
        if (item.target_kind === 'content') renderedIds.add(item.target_id);
      }
    }
    outbound.set(entry.content_id, [...renderedIds]);

    const declaredTargets = relatedContentRelations(entry).map(relation => relation.targetId);
    broken.set(
      entry.content_id,
      declaredTargets.filter(targetId => !allEntryById.has(targetId)),
    );
    hidden.set(
      entry.content_id,
      declaredTargets.filter(targetId => (
        allEntryById.has(targetId) && !entryById.has(targetId)
      )),
    );
  }

  return {
    entries,
    concepts,
    hubs,
    changes: filterFreshPublications(bundle?.change_briefs ?? [], now),
    cards: filterFreshPublications(bundle?.cards ?? [], now),
    entryById,
    entryGraphById,
    outbound,
    broken,
    hidden,
  };
}

function buildLinkIndex(projection, records) {
  const {entryById, outbound, broken, hidden} = projection;
  const inbound = new Map(records.map(record => [record.id, 0]));
  const hubInbound = new Map(records.map(record => [record.id, 0]));
  for (const targets of outbound.values()) {
    for (const target of targets) {
      if (entryById.has(target)) inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }
  }
  for (const hub of projection.hubs) {
    for (const contentId of hub.content_ids) {
      if (entryById.has(contentId)) {
        hubInbound.set(contentId, (hubInbound.get(contentId) ?? 0) + 1);
      }
    }
  }
  return {entryById, inbound, hubInbound, outbound, broken, hidden};
}

function reason(code, message, evidence) {
  return {code, message_ko: message, evidence};
}

function freshnessScore(reviewedAt, expiresAt, asOf) {
  const asOfTime = Date.parse(asOf);
  const reviewedTime = Date.parse(reviewedAt ?? '');
  const expiresTime = Date.parse(expiresAt ?? '');
  let score = 0;
  const reasons = [];
  if (Number.isFinite(reviewedTime) && reviewedTime <= asOfTime) score += 50;
  else reasons.push(reason('reviewed_at_invalid', '검토일이 없거나 감사 기준시점보다 뒤입니다.', {reviewed_at: reviewedAt ?? null}));
  if (Number.isFinite(expiresTime)) {
    const remainingDays = Math.floor((expiresTime - asOfTime) / 86_400_000);
    if (remainingDays >= 90) score += 50;
    else if (remainingDays >= 30) score += 40;
    else if (remainingDays >= 0) {
      score += 20;
      reasons.push(reason('freshness_review_due_soon', '재검토 기한이 30일 안에 도래합니다.', {remaining_days: remainingDays}));
    } else {
      reasons.push(reason('freshness_expired', '재검토 기한이 지났습니다.', {remaining_days: remainingDays}));
    }
  } else {
    reasons.push(reason('expires_at_missing', '재검토 기한이 없습니다.', {expires_at: expiresAt ?? null}));
  }
  return {score, reasons};
}

function knowledgeScores(record, context) {
  const page = record.raw;
  const nearest = context.nearest.get(record.id);
  const intents = list(page.search_intents_ko);
  const normalizedTitle = normalizeSearchText(page.title_ko);
  const normalizedSlug = normalizeSearchText(page.slug);
  const copiedIntents = intents.filter(intent => {
    const normalized = normalizeSearchText(intent);
    return normalized === normalizedTitle || normalized === normalizedSlug;
  });
  const reasons = [];
  let independence = 100;
  if (!String(page.audience_situation_ko ?? '').trim()) {
    independence -= 20;
    reasons.push(reason('audience_situation_missing', '검색 이용자의 상황 설명이 비어 있습니다.', {content_id: record.id}));
  }
  if (intents.length < 3) {
    independence -= 15;
    reasons.push(reason('search_intents_insufficient', '고유한 한국어 검색 의도가 3개보다 적습니다.', {count: intents.length}));
  }
  if (copiedIntents.length) {
    independence -= 20;
    reasons.push(reason('search_intent_boilerplate', '검색 의도가 제목 또는 영문 슬러그를 그대로 복사했습니다.', {values: copiedIntents}));
  }
  if (nearest?.similarity >= 0.7) {
    const penalty = Math.round((nearest.similarity - 0.65) * 100);
    independence -= clamp(penalty, 5, 35);
    reasons.push(reason('near_duplicate_page', '같은 유형의 다른 상세과 검색 독립성이 약합니다.', nearest));
  }
  if (normalizeSearchText(pageText('knowledge', page)).length < 180) {
    independence -= 15;
    reasons.push(reason('thin_page_copy', '답변·판단요소·본문을 합친 고유 설명량이 짧습니다.', {
      normalized_length: normalizeSearchText(pageText('knowledge', page)).length,
    }));
  }

  const outbound = context.linkIndex.outbound.get(record.id) ?? [];
  const detailInbound = context.linkIndex.inbound.get(record.id) ?? 0;
  const hubInbound = context.linkIndex.hubInbound.get(record.id) ?? 0;
  const inbound = detailInbound + hubInbound;
  const broken = context.linkIndex.broken.get(record.id) ?? [];
  const hidden = context.linkIndex.hidden.get(record.id) ?? [];
  let links = Math.min(outbound.length, 3) * 15 + Math.min(detailInbound, 3) * 15;
  if (hubInbound) links += 10;
  if (!broken.length) links += 10;
  links -= Math.min(hidden.length, 2) * 10;
  links = clamp(links);
  if (!outbound.length) reasons.push(reason('orphan_outbound', '화면에 표시되는 다음 읽기 링크가 없습니다.', {rendered_related_content_ids: []}));
  if (!inbound) reasons.push(reason('orphan_inbound', '다른 상세 화면에서 이 페이지로 들어오는 링크가 없습니다.', {rendered_inbound_links: 0}));
  if (outbound.length + inbound < 2) reasons.push(reason('weak_internal_link', '화면에 표시되는 내부링크 연결도가 2보다 작습니다.', {outbound: outbound.length, inbound}));
  if (broken.length) reasons.push(reason('broken_internal_link', '존재하지 않는 관련 콘텐츠를 참조합니다.', {targets: broken}));
  if (hidden.length) reasons.push(reason('hidden_internal_link_target', '관련 콘텐츠가 재검토 기한을 지나 화면에서 제외됩니다.', {targets: hidden}));

  const sourceById = context.sourceByCoordinate;
  const directSourceIds = page.source_coordinate_ids ?? [];
  const directSources = directSourceIds.map(id => sourceById.get(id)).filter(Boolean);
  const sources = context.runtime.entryGraphById.get(record.id)?.sources ?? [];
  const official = sources.filter(source => {
    const url = browserOfficialSourceUrl(source);
    if (!url) return false;
    try {
      return ['law.go.kr', 'www.law.go.kr'].includes(new URL(url).hostname.toLowerCase());
    } catch {
      return false;
    }
  });
  const directOfficial = directSources.filter(source => {
    const url = browserOfficialSourceUrl(source);
    if (!url) return false;
    try {
      return ['law.go.kr', 'www.law.go.kr'].includes(new URL(url).hostname.toLowerCase());
    } catch {
      return false;
    }
  });
  let trust = 0;
  if (page.editorial_status === 'approved') trust += 20;
  if (sources.length) trust += 20;
  if (directSources.length === directSourceIds.length) trust += 20;
  if (official.length === sources.length && sources.length) trust += 20;
  if (page.reviewed_at) trust += 20;
  if (!sources.length) reasons.push(reason('authority_missing', '상세 화면에 표시할 공식근거 좌표가 없습니다.', {source_coordinate_ids: []}));
  if (directSources.length !== directSourceIds.length) reasons.push(reason('authority_unresolved', '콘텐츠가 직접 선언한 공식근거 좌표 일부가 현재 번들에서 해석되지 않습니다.', {
    declared: directSourceIds.length,
    resolved: directSources.length,
  }));
  if (official.length !== sources.length) reasons.push(reason('official_source_url_missing', '일부 근거가 국가법령정보센터 공식 URL로 확인되지 않습니다.', {
    resolved_sources: sources.length,
    official_urls: official.length,
  }));

  const freshness = freshnessScore(page.reviewed_at, page.expires_at, context.asOf);
  reasons.push(...freshness.reasons);
  return {
    axes: {
      search_independence: clamp(independence),
      internal_links: links,
      trust,
      freshness: freshness.score,
    },
    reasons,
    linkEvidence: {
      outbound: outbound.length,
      inbound,
      detail_inbound: detailInbound,
      hub_inbound: hubInbound,
      broken,
      hidden,
      verified_official_source_count: official.length,
      ui_visible_source_count: sources.length,
      direct_source_count: directSources.length,
      direct_verified_official_source_count: directOfficial.length,
      graph_expanded_source_count: Math.max(0, sources.length - directSources.length),
      projection: 'runtime_related_reading_and_knowledge_detail_graph',
    },
  };
}

function hubScores(record, context) {
  const page = record.raw;
  const nearest = context.nearest.get(record.id);
  const contentIds = page.content_ids ?? [];
  const resolved = contentIds.map(id => context.linkIndex.entryById.get(id)).filter(Boolean);
  const reasons = [];
  let independence = 100;
  if (normalizeSearchText(page.description_ko).length < 35) {
    independence -= 25;
    reasons.push(reason('hub_description_thin', '주제 허브 설명이 검색 이용자의 범위와 목표를 충분히 구분하지 못합니다.', {
      normalized_length: normalizeSearchText(page.description_ko).length,
    }));
  }
  if (nearest?.similarity >= 0.7) {
    independence -= 30;
    reasons.push(reason('near_duplicate_hub', '다른 주제 허브와 제목·설명이 유사합니다.', nearest));
  }
  let links = Math.min(resolved.length * 8, 80);
  if (resolved.length === contentIds.length && resolved.length) links += 20;
  links = clamp(links);
  if (!contentIds.length) reasons.push(reason('hub_empty', '허브에 연결된 상세이 없습니다.', {content_ids: []}));
  if (resolved.length !== contentIds.length) reasons.push(reason('hub_broken_content', '허브가 존재하지 않는 상세을 참조합니다.', {
    declared: contentIds.length,
    resolved: resolved.length,
  }));
  const sourceCount = new Set(resolved.flatMap(entry => entry.source_coordinate_ids ?? [])).size;
  const approved = resolved.filter(entry => entry.editorial_status === 'approved').length;
  const journeys = buildKnowledgeHubJourneys(resolved);
  const scenarioIds = new Set(resolved.flatMap(entry => entry.scenario_ids ?? []));
  const decisionPathCount = (context.bundle.knowledge?.scenario_branches ?? [])
    .filter(scenario => scenarioIds.has(scenario.scenario_id)).length;
  const connections = buildKnowledgeHubConnections(
    context.runtime.entries,
    context.runtime.hubs,
    page,
  );
  const trust = clamp(
    (resolved.length ? 30 : 0) +
    (sourceCount ? 40 : 0) +
    (resolved.length && approved === resolved.length ? 30 : 0),
  );
  const expiryValues = resolved.map(entry => entry.expires_at).filter(Boolean).sort();
  const reviewValues = resolved.map(entry => entry.reviewed_at).filter(Boolean).sort();
  const freshness = freshnessScore(
    reviewValues.at(-1),
    expiryValues[0],
    context.asOf,
  );
  reasons.push(...freshness.reasons);
  return {
    axes: {
      search_independence: clamp(independence),
      internal_links: links,
      trust,
      freshness: freshness.score,
    },
    reasons,
    linkEvidence: {
      content_count: contentIds.length,
      resolved_content_count: resolved.length,
      journey_count: journeys.length,
      decision_path_count: decisionPathCount,
      connected_hub_count: connections.length,
      projection: 'runtime_hub_journey',
    },
  };
}

function changeScores(record, context) {
  const page = record.raw;
  const assertionIds = new Set(page.assertion_ids ?? []);
  const projection = projectChangeBrief({
    brief: {...page, effective_date: page.effective_date ?? context.asOf},
    assertions: (context.bundle.assertions ?? []).filter(assertion => assertionIds.has(assertion.assertion_id)),
    entries: context.runtime.entries,
    sources: context.bundle.knowledge?.sources ?? [],
    asOf: context.asOf,
  });
  const nearest = context.nearest.get(record.id);
  const reasons = [];
  let independence = 100;
  for (const [field, minimum] of [
    ['affected_audiences', 1],
    ['changed_points', 2],
    ['action_checklist', 2],
  ]) {
    const count = list(page[field]).length;
    if (count < minimum) {
      independence -= 20;
      reasons.push(reason('change_search_scope_incomplete', '법령변화의 대상·변경점·행동 정보가 충분하지 않습니다.', {field, count, minimum}));
    }
  }
  if (nearest?.similarity >= 0.75) {
    independence -= 25;
    reasons.push(reason('near_duplicate_change', '다른 법령변화 페이지와 검색 독립성이 약합니다.', nearest));
  }
  const relatedIssues = page.related_issue_card_ids ?? [];
  const resolvedIssues = relatedIssues.filter(id => context.issueCardIds.has(id));
  const brokenIssues = relatedIssues.filter(id => !context.issueCardIds.has(id));
  const relatedReadings = projection.related_readings;
  const links = relatedReadings.length
    ? clamp(
      60 +
      Math.min(Math.max(relatedReadings.length - 1, 0), 2) * 15 +
      Math.min(resolvedIssues.length, 1) * 10,
    )
    : Math.min(resolvedIssues.length, 2) * 10;
  if (!relatedReadings.length) {
    reasons.push(reason('change_weak_internal_link', '법령변화에서 관련 생활질문으로 이어지는 명시적 링크가 없습니다.', {
      related_content_ids: page.related_content_ids ?? [],
      related_issue_card_ids: relatedIssues,
    }));
  }
  if (brokenIssues.length) {
    reasons.push(reason('change_broken_internal_link', '법령변화가 현재 번들에 없는 쟁점 카드를 참조합니다.', {
      targets: brokenIssues,
    }));
  }
  let trust = 0;
  if (page.editorial_status === 'approved') trust += 20;
  if ((page.assertion_ids ?? []).length) trust += 20;
  if ((page.source_event_ids ?? []).length) trust += 20;
  if ((page.old_snapshot_ids ?? []).length && (page.new_snapshot_ids ?? []).length) trust += 20;
  if (page.reviewed_at) trust += 20;
  if (!projection.official_sources.length) {
    reasons.push(reason('change_verified_official_source_unavailable', '검증된 법령변화 근거에서 사용자가 바로 여는 공식원문 URL을 만들 수 없습니다.', {
      law_name_ko: page.law_name_ko,
      article_no: page.article_no,
    }));
  }
  const freshness = freshnessScore(page.reviewed_at, page.expires_at, context.asOf);
  reasons.push(...freshness.reasons);
  return {
    axes: {
      search_independence: clamp(independence),
      internal_links: links,
      trust,
      freshness: freshness.score,
    },
    reasons,
    linkEvidence: {
      related_issue_card_count: relatedIssues.length,
      resolved_issue_card_count: resolvedIssues.length,
      broken_issue_card_ids: brokenIssues,
      related_knowledge_count: relatedReadings.length,
      related_knowledge_basis: [...new Set(relatedReadings.map(reading => reading.basis))],
      verified_official_source_count: projection.official_sources.length,
    },
  };
}

function recommendationFor({axes, nearest, reasons}) {
  const overall = round(
    axes.search_independence * 0.3 +
    axes.internal_links * 0.25 +
    axes.trust * 0.25 +
    axes.freshness * 0.2,
    1,
  );
  const severeDuplicate = nearest?.similarity >= 0.94 && axes.search_independence <= 45;
  const mergeDuplicate = nearest?.similarity >= 0.86 && axes.search_independence <= 60;
  const critical = reasons.some(item => [
    'broken_internal_link',
    'hidden_internal_link_target',
    'authority_unresolved',
    'freshness_expired',
  ].includes(item.code));
  let recommendation = 'keep';
  if (severeDuplicate) recommendation = 'noindex-review';
  else if (mergeDuplicate) recommendation = 'merge';
  else if (overall < 82 || critical) recommendation = 'improve';
  return {overall, recommendation};
}

function opportunityScore(page) {
  const staticDeficit = 100 - page.overall_score;
  if (page.search_console.status !== 'measured' || !page.search_console.impressions) {
    return round(staticDeficit, 2);
  }
  const measuredOpportunity = Math.log10(page.search_console.impressions + 1) * 15;
  return round(staticDeficit + measuredOpportunity, 2);
}

export function auditPublicationSearchPerformance(bundle, options = {}) {
  if (bundle?.schema !== 'rulelink_published_bundle_v1') {
    throw new Error('지원하지 않는 공개 번들 스키마입니다.');
  }
  const baseUrl = options.baseUrl ?? site.url;
  const asOf = options.asOf ?? bundle.built_at;
  if (!Number.isFinite(Date.parse(asOf))) throw new Error('감사 기준시점이 유효하지 않습니다.');
  const gscRows = options.gscRows ?? [];
  const runtime = runtimePublicationProjection(bundle, asOf);
  const runtimeBundle = {
    ...bundle,
    change_briefs: runtime.changes,
    knowledge: {
      ...bundle.knowledge,
      content_entries: runtime.entries,
      concept_cards: runtime.concepts,
      topic_hubs: runtime.hubs,
    },
  };
  const records = buildPageRecords(runtimeBundle, baseUrl);
  const nearest = nearestDuplicates(records);
  const linkIndex = buildLinkIndex(runtime, records);
  const sourceByCoordinate = new Map((bundle?.knowledge?.sources ?? []).map(source => [source.coordinate_id, source]));
  const issueCardIds = new Set(runtime.cards.map(card => card.issue_card_id ?? card.card_id).filter(Boolean));
  const {metrics, unmatched} = aggregateGscRows(gscRows, records, baseUrl);
  const context = {
    asOf,
    nearest,
    linkIndex,
    sourceByCoordinate,
    issueCardIds,
    bundle: runtimeBundle,
    runtime,
  };

  const pages = records.map(record => {
    const measured = record.pageType === 'knowledge'
      ? knowledgeScores(record, context)
      : record.pageType === 'hub'
        ? hubScores(record, context)
        : changeScores(record, context);
    const recommendation = recommendationFor({
      axes: measured.axes,
      nearest: nearest.get(record.id),
      reasons: measured.reasons,
    });
    const result = {
      page_type: record.pageType,
      id: record.id,
      url: record.url,
      title_ko: record.title,
      overall_score: recommendation.overall,
      axis_scores: measured.axes,
      recommendation: recommendation.recommendation,
      exact_reasons: measured.reasons,
      nearest_duplicate: nearest.get(record.id),
      internal_link_evidence: measured.linkEvidence,
      trust_metadata: {
        author: Object.hasOwn(record.raw, 'author') || Object.hasOwn(record.raw, 'author_ko')
          ? 'declared'
          : 'not_declared',
        reviewer: Object.hasOwn(record.raw, 'reviewer') || Object.hasOwn(record.raw, 'reviewer_ko')
          ? 'declared'
          : 'not_declared',
      },
      search_console: metrics.get(record.id),
    };
    result.opportunity_score = opportunityScore(result);
    return result;
  }).sort((left, right) => (
    RECOMMENDATION_PRIORITY[right.recommendation] - RECOMMENDATION_PRIORITY[left.recommendation] ||
    right.opportunity_score - left.opportunity_score ||
    left.url.localeCompare(right.url, 'en')
  ));

  const actionCounts = Object.fromEntries(
    Object.keys(RECOMMENDATION_PRIORITY).map(key => [key, pages.filter(page => page.recommendation === key).length]),
  );
  const pageTypeCounts = Object.fromEntries(
    Object.keys(PAGE_TYPES).map(key => [key, pages.filter(page => page.page_type === key).length]),
  );
  const gscCannibalization = queryCannibalization(gscRows, records, baseUrl);
  const declaredCannibalization = declaredIntentCannibalization(records);
  const authorMissing = pages.filter(page => page.trust_metadata.author === 'not_declared').length;
  const reviewerMissing = pages.filter(page => page.trust_metadata.reviewer === 'not_declared').length;
  const measuredPages = pages.filter(page => page.search_console.status === 'measured').length;
  return {
    schema: 'rulelink_publication_search_performance_audit_v1',
    source: {
      snapshot_id: bundle.snapshot_id,
      built_at: bundle.built_at,
      audit_as_of: asOf,
      base_url: baseUrl,
    },
    data_availability: {
      search_console: gscRows.length ? 'provided' : 'not_provided',
      search_console_rows: gscRows.length,
      unmatched_search_console_rows: unmatched.length,
      search_volume: 'not_available_and_not_estimated',
      advertising_rpm: 'not_available_and_not_estimated',
    },
    coverage: {
      ...pageTypeCounts,
      total: pages.length,
    },
    summary: {
      action_counts: actionCounts,
      orphan_outbound: pages.filter(page => page.exact_reasons.some(item => item.code === 'orphan_outbound')).length,
      orphan_inbound: pages.filter(page => page.exact_reasons.some(item => item.code === 'orphan_inbound')).length,
      weak_internal_link: pages.filter(page => page.exact_reasons.some(item => item.code === 'weak_internal_link')).length,
      verified_official_source_pages: pages.filter(
        page => (page.internal_link_evidence.verified_official_source_count ?? 0) > 0,
      ).length,
      verified_official_source_links: pages.reduce(
        (total, page) => total + (page.internal_link_evidence.verified_official_source_count ?? 0),
        0,
      ),
      knowledge_verified_official_source_links: pages
        .filter(page => page.page_type === 'knowledge')
        .reduce(
          (total, page) => total + (page.internal_link_evidence.verified_official_source_count ?? 0),
          0,
        ),
      change_verified_official_source_links: pages
        .filter(page => page.page_type === 'change')
        .reduce(
          (total, page) => total + (page.internal_link_evidence.verified_official_source_count ?? 0),
          0,
        ),
      direct_knowledge_verified_official_source_links: pages
        .filter(page => page.page_type === 'knowledge')
        .reduce(
          (total, page) => total + (page.internal_link_evidence.direct_verified_official_source_count ?? 0),
          0,
        ),
      knowledge_graph_expanded_source_pages: pages.filter(page => (
        page.page_type === 'knowledge'
        && (page.internal_link_evidence.graph_expanded_source_count ?? 0) > 0
      )).length,
      title_or_slug_search_intent_boilerplate: pages.filter(page => page.exact_reasons.some(item => item.code === 'search_intent_boilerplate')).length,
      declared_query_cannibalization: declaredCannibalization.length,
      measured_query_cannibalization: gscCannibalization.length,
      measured_pages: measuredPages,
      not_provided_pages: pages.length - measuredPages,
      author_metadata_not_declared: authorMissing,
      reviewer_metadata_not_declared: reviewerMissing,
    },
    global_findings: [{
      code: 'author_reviewer_metadata_schema_gap',
      message_ko: '현재 공개 번들은 저자·검수자 메타데이터를 페이지 단위로 선언하지 않습니다. 공식근거·검토일과 별개의 신뢰 신호 결손으로 기록하되 페이지 점수에서는 일괄 감점하지 않았습니다.',
      evidence: {
        pages: pages.length,
        author_not_declared: authorMissing,
        reviewer_not_declared: reviewerMissing,
      },
    }],
    query_cannibalization: [...gscCannibalization, ...declaredCannibalization],
    unmatched_search_console_rows: unmatched,
    pages,
  };
}

function percent(value) {
  return value === null || value === undefined ? '데이터 없음' : `${round(value * 100, 2)}%`;
}

export function renderSearchPerformanceMarkdown(report, options = {}) {
  const limit = options.limit ?? 20;
  const lines = [
    `# ${site.name} 검색 유입·콘텐츠 성과 감사`,
    '',
    `- 스냅샷: \`${report.source.snapshot_id}\``,
    `- 감사 기준시점: ${report.source.audit_as_of}`,
    `- 범위: 상세 ${report.coverage.knowledge} / 허브 ${report.coverage.hub} / 법령변화 ${report.coverage.change} / 합계 ${report.coverage.total}`,
    `- 검색콘솔: ${report.data_availability.search_console === 'provided' ? `${report.data_availability.search_console_rows}행 결합` : '입력 없음 — 정적 감사만 수행'}`,
    `- 검색콘솔 URL 결합: 실측 ${report.summary.measured_pages}개 / 미입력 ${report.summary.not_provided_pages}개`,
    '- 검색량: 데이터 없음, 추정하지 않음',
    '- 광고 RPM: 데이터 없음, 추정하지 않음',
    '',
    '## 판정 요약',
    '',
    `- keep: ${report.summary.action_counts.keep}`,
    `- improve: ${report.summary.action_counts.improve}`,
    `- merge: ${report.summary.action_counts.merge}`,
    `- noindex-review: ${report.summary.action_counts['noindex-review']}`,
    `- 화면상 나가는 링크 없음: ${report.summary.orphan_outbound}`,
    `- 상세·허브 화면에서 들어오는 링크 없음: ${report.summary.orphan_inbound}`,
    `- 검증된 공식원문: ${report.summary.verified_official_source_pages}개 페이지 / ${report.summary.verified_official_source_links}개 링크`,
    `- 검색의도 충돌: 선언 ${report.summary.declared_query_cannibalization} / 실측 ${report.summary.measured_query_cannibalization}`,
    `- 저자·검수자 메타데이터 미선언: ${report.summary.author_metadata_not_declared} / ${report.summary.reviewer_metadata_not_declared}`,
    '',
    `## 우선 실행 대상 ${Math.min(limit, report.pages.length)}개`,
    '',
    '|순위|판정|점수|페이지|검색콘솔|정확한 근거|',
    '|---:|---|---:|---|---|---|',
  ];
  for (const [index, page] of report.pages.slice(0, limit).entries()) {
    const metrics = page.search_console.status === 'measured'
      ? `노출 ${page.search_console.impressions}, 클릭 ${page.search_console.clicks}, CTR ${percent(page.search_console.ctr)}, 순위 ${page.search_console.position ?? '없음'}`
      : '입력 없음';
    const evidence = page.exact_reasons.slice(0, 3).map(item => `${item.code}: ${item.message_ko}`).join('<br>');
    lines.push(`|${index + 1}|${page.recommendation}|${page.overall_score}|[${page.title_ko}](${page.url})|${metrics}|${evidence || '중대한 결손 없음'}|`);
  }
  lines.push('', '## 검색의도 충돌', '');
  if (!report.query_cannibalization.length) {
    lines.push('- 확인된 충돌 없음');
  } else {
    for (const item of report.query_cannibalization.slice(0, limit)) {
      lines.push(`- \`${item.query}\` (${item.source}): ${item.pages.map(page => `[${page.title}](${page.url})`).join(' / ')}`);
    }
  }
  lines.push('', '## 해석 원칙', '');
  lines.push('- `noindex-review`는 자동 색인 제외가 아니라 심각한 중복을 사람이 검토할 후보입니다.');
  lines.push('- 검색콘솔 입력이 없으면 노출·클릭·CTR·순위는 모두 데이터 없음으로 남깁니다.');
  lines.push('- 검색량과 광고 RPM은 외부 실측이 없으므로 생성하거나 추정하지 않습니다.');
  lines.push('- 저자·검수자 메타데이터 결손은 현재 스키마의 전역 신뢰 결손으로 기록하며 모든 페이지를 동일하게 감점하지 않습니다.');
  return `${lines.join('\n')}\n`;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? '' : '';
}

function has(args, name) {
  return args.includes(name);
}

async function main() {
  const args = process.argv.slice(2);
  if (has(args, '--help')) {
    console.log([
      '사용법:',
      '  node scripts/audit-publication-search-performance.mjs',
      '    [--bundle <bundle.json>] [--gsc <Search Console.csv|json>]',
      '    [--json <report.json>] [--markdown <report.md>]',
      '    [--base-url <https://...>] [--as-of <ISO date>]',
      '',
      '출력 경로를 생략하면 한국어 Markdown을 표준출력으로 내보냅니다.',
      '검색콘솔 파일은 선택 입력이며 계정·API 키를 요구하지 않습니다.',
    ].join('\n'));
    return;
  }
  const bundlePath = path.resolve(option(args, '--bundle') || defaultBundlePath);
  const gscPath = option(args, '--gsc');
  const jsonPath = option(args, '--json');
  const markdownPath = option(args, '--markdown');
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const gscRows = await loadGscInput(gscPath ? path.resolve(gscPath) : '');
  const report = auditPublicationSearchPerformance(bundle, {
    gscRows,
    baseUrl: option(args, '--base-url') || undefined,
    asOf: option(args, '--as-of') || undefined,
  });
  const markdown = renderSearchPerformanceMarkdown(report);
  if (jsonPath) {
    await mkdir(path.dirname(path.resolve(jsonPath)), {recursive: true});
    await writeFile(path.resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  if (markdownPath) {
    await mkdir(path.dirname(path.resolve(markdownPath)), {recursive: true});
    await writeFile(path.resolve(markdownPath), markdown, 'utf8');
  }
  if (!jsonPath && !markdownPath) process.stdout.write(markdown);
  else {
    console.log(`검색 성과 감사 완료: ${report.coverage.total}개 페이지 / ${report.source.snapshot_id}`);
  }
}

if (path.resolve(process.argv[1] ?? '') === scriptPath) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
