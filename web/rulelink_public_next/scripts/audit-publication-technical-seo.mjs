import {readFile, readdir, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const defaultBundlePath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const defaultBuildRoot = path.join(appRoot, '.next', 'server', 'app');

const PAGE_TYPES = Object.freeze({
  knowledge: {
    collection: bundle => bundle?.knowledge?.content_entries ?? [],
    id: item => item.content_id,
    route: item => `/ko/knowledge/${item.slug}`,
    expectedJsonLd: ['WebPage', 'BreadcrumbList'],
  },
  hub: {
    collection: bundle => bundle?.knowledge?.topic_hubs ?? [],
    id: item => item.hub_id,
    route: item => `/ko/hubs/${item.slug}`,
    expectedJsonLd: ['CollectionPage', 'BreadcrumbList'],
  },
  change: {
    collection: bundle => bundle?.change_briefs ?? [],
    id: item => item.change_brief_id,
    route: item => `/ko/changes/${item.slug}`,
    expectedJsonLd: ['Article', 'BreadcrumbList'],
  },
});

function decodeHtml(value = '') {
  return value
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)));
}

function stripTags(value = '') {
  return decodeHtml(value.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim());
}

function normalizeText(value = '') {
  return stripTags(String(value)).normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, 'iu'));
  return decodeHtml(match?.[1] ?? match?.[2] ?? '');
}

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, 'giu')) ?? [];
}

function metaContent(html, name) {
  for (const tag of tags(html, 'meta')) {
    if (attr(tag, 'name').toLowerCase() === name.toLowerCase()) return attr(tag, 'content');
  }
  return '';
}

function canonicalHref(html) {
  for (const tag of tags(html, 'link')) {
    if (attr(tag, 'rel').toLowerCase().split(/\s+/u).includes('canonical')) return attr(tag, 'href');
  }
  return '';
}

function titleText(html) {
  return stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? '');
}

function headingText(html) {
  return stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? '');
}

function jsonLdDocuments(html) {
  const result = [];
  const pattern = /<script\b[^>]*type=(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/giu;
  for (const match of html.matchAll(pattern)) {
    try {
      result.push(JSON.parse(decodeHtml(match[1])));
    } catch {
      result.push({__parse_error: true});
    }
  }
  return result;
}

function flattenJsonLdTypes(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLdTypes(item, result);
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  if (typeof value['@type'] === 'string') result.push({type: value['@type'], node: value});
  if (Array.isArray(value['@graph'])) flattenJsonLdTypes(value['@graph'], result);
  return result;
}

function canonicalRoute(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin) return null;
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/u, '') || '/';
    return pathname;
  } catch {
    return null;
  }
}

function internalLinks(html, baseUrl) {
  const links = new Set();
  for (const tag of tags(html, 'a')) {
    const href = attr(tag, 'href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    const route = canonicalRoute(href, baseUrl);
    if (route) links.add(route);
  }
  return [...links];
}

function htmlRoute(buildRoot, filename) {
  const relative = path.relative(buildRoot, filename).replaceAll('\\', '/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/\.html$/u, '')}`;
}

async function listHtmlFiles(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && entry.name.endsWith('.html') && !entry.name.startsWith('_')) result.push(target);
    }
  }
  await visit(root);
  return result;
}

function expectedPages(bundle) {
  return Object.entries(PAGE_TYPES).flatMap(([pageType, contract]) => (
    contract.collection(bundle).map(item => ({
      page_type: pageType,
      id: contract.id(item),
      route: contract.route(item),
      expected_jsonld_types: contract.expectedJsonLd,
      raw: item,
    }))
  ));
}

function duplicateGroups(pages, field) {
  const grouped = new Map();
  for (const page of pages) {
    const value = normalizeText(page[field]);
    if (!value) continue;
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(page.route);
  }
  return [...grouped.entries()]
    .filter(([, routes]) => routes.length > 1)
    .map(([value, routes]) => ({value, routes: routes.sort()}))
    .sort((left, right) => right.routes.length - left.routes.length || left.value.localeCompare(right.value, 'ko'));
}

function bfsDepth(graph, start = '/') {
  const depths = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    const depth = depths.get(current);
    for (const next of graph.get(current) ?? []) {
      if (depths.has(next)) continue;
      depths.set(next, depth + 1);
      queue.push(next);
    }
  }
  return depths;
}

function issue(code, layer, message, evidence = {}) {
  return {code, layer, message_ko: message, evidence};
}

function structuredDataIssues(page, documents, baseUrl) {
  const issues = [];
  const typed = documents.flatMap(document => flattenJsonLdTypes(document));
  if (documents.some(document => document.__parse_error)) {
    issues.push(issue('jsonld_parse_error', 'runtime', '구조화 데이터 JSON을 해석할 수 없습니다.'));
  }
  for (const expected of page.expected_jsonld_types) {
    if (!typed.some(item => item.type === expected)) {
      issues.push(issue('jsonld_type_missing', 'runtime', `필수 구조화 데이터 ${expected}가 없습니다.`, {expected_type: expected}));
    }
  }
  const primaryType = page.page_type === 'hub'
    ? 'CollectionPage'
    : page.page_type === 'knowledge'
      ? 'WebPage'
      : 'Article';
  const primary = typed.find(item => item.type === primaryType)?.node;
  if (primary) {
    const structuredTitle = normalizeText(primary.headline ?? primary.name ?? '');
    if (structuredTitle && structuredTitle !== normalizeText(page.h1)) {
      issues.push(issue('jsonld_visible_title_mismatch', 'runtime', '구조화 데이터 제목과 실제 화면 제목이 다릅니다.', {
        structured_title: structuredTitle,
        visible_h1: page.h1,
      }));
    }
  }
  const breadcrumbs = typed.filter(item => item.type === 'BreadcrumbList');
  if (breadcrumbs.length > 1) {
    issues.push(issue('jsonld_breadcrumb_duplicate', 'runtime', 'BreadcrumbList가 중복 생성됐습니다.', {count: breadcrumbs.length}));
  }
  const breadcrumb = breadcrumbs[0]?.node;
  if (breadcrumb) {
    const items = Array.isArray(breadcrumb.itemListElement) ? breadcrumb.itemListElement : [];
    const lastName = normalizeText(items.at(-1)?.name ?? '');
    if (lastName && lastName !== normalizeText(page.h1)) {
      issues.push(issue('breadcrumb_visible_title_mismatch', 'runtime', 'BreadcrumbList의 현재 페이지 이름과 실제 화면 제목이 다릅니다.', {
        breadcrumb_name: lastName,
        visible_h1: page.h1,
      }));
    }
    if (page.page_type === 'change') {
      const expected = [
        {position: 1, name: '홈', item: baseUrl.replace(/\/$/u, '')},
        {position: 2, name: '법령 변화', item: new URL('/ko/changes', baseUrl).href},
        {position: 3, name: page.h1, item: new URL(page.route, baseUrl).href},
      ];
      const actual = Array.isArray(breadcrumb.itemListElement) ? breadcrumb.itemListElement : [];
      if (JSON.stringify(actual.map(item => ({
        position: item.position,
        name: normalizeText(item.name),
        item: item.item,
      }))) !== JSON.stringify(expected)) {
        issues.push(issue('change_breadcrumb_contract_mismatch', 'runtime', '법령변화 BreadcrumbList가 화면의 홈→법령 변화→현재 상세 경로와 일치하지 않습니다.', {
          expected,
          actual,
        }));
      }
    }
  }
  return issues;
}

export async function auditPublicationTechnicalSeo({
  bundle,
  buildRoot,
  baseUrl,
  indexingMode = 'auto',
}) {
  if (bundle?.schema !== 'rulelink_published_bundle_v1') throw new Error('지원하지 않는 공개 번들 스키마입니다.');
  const pages = expectedPages(bundle);
  const expectedRoutes = new Set(pages.map(page => page.route));
  const allHtml = new Map();
  for (const filename of await listHtmlFiles(buildRoot)) {
    const route = htmlRoute(buildRoot, filename);
    allHtml.set(route, await readFile(filename, 'utf8'));
  }
  const graph = new Map([...allHtml].map(([route, html]) => [route, internalLinks(html, baseUrl)]));
  const depths = bfsDepth(graph);
  const inbound = new Map(pages.map(page => [page.route, 0]));
  for (const [from, targets] of graph) {
    for (const target of targets) {
      if (target !== from && inbound.has(target)) inbound.set(target, inbound.get(target) + 1);
    }
  }

  const sitemapText = await readFile(path.join(buildRoot, 'sitemap.xml.body'), 'utf8');
  const sitemapRoutes = [...sitemapText.matchAll(/<loc>(.*?)<\/loc>/giu)]
    .map(match => canonicalRoute(match[1], baseUrl))
    .filter(Boolean);
  const sitemapCounts = new Map();
  for (const route of sitemapRoutes) sitemapCounts.set(route, (sitemapCounts.get(route) ?? 0) + 1);
  const robotsText = await readFile(path.join(buildRoot, 'robots.txt.body'), 'utf8');
  const robotsBlocksAll = /Disallow:\s*\/\s*$/imu.test(robotsText);
  const resolvedIndexingMode = indexingMode === 'auto'
    ? robotsBlocksAll && sitemapRoutes.length === 0 ? 'blocked-preview' : 'production'
    : indexingMode;
  if (!['production', 'blocked-preview'].includes(resolvedIndexingMode)) {
    throw new Error(`지원하지 않는 검색 공개 모드입니다: ${resolvedIndexingMode}`);
  }

  const audited = [];
  for (const page of pages) {
    const html = allHtml.get(page.route) ?? '';
    const title = titleText(html);
    const description = metaContent(html, 'description');
    const canonical = canonicalHref(html);
    const robots = metaContent(html, 'robots');
    const h1 = headingText(html);
    const documents = jsonLdDocuments(html);
    const issues = [];
    if (!html) issues.push(issue('html_missing', 'runtime', '정적 HTML이 없습니다.'));
    if (!title) issues.push(issue('title_missing', 'runtime', '문서 제목이 없습니다.'));
    if (!description) issues.push(issue('description_missing', 'runtime', '메타 설명이 없습니다.'));
    else if (normalizeText(description).length < 40) issues.push(issue('description_too_short', 'data', '메타 설명이 40자보다 짧습니다.', {length: normalizeText(description).length}));
    else if (normalizeText(description).length > 160) issues.push(issue('description_too_long', 'data', '메타 설명이 160자를 초과합니다.', {length: normalizeText(description).length}));
    const expectedCanonical = new URL(page.route, baseUrl).href;
    if (canonical !== expectedCanonical) issues.push(issue('canonical_mismatch', 'runtime', 'canonical URL이 실제 공개 경로와 다릅니다.', {
      expected: expectedCanonical,
      actual: canonical || null,
    }));
    if (resolvedIndexingMode === 'production') {
      if (/(?:^|,)\s*noindex\b/iu.test(robots)) issues.push(issue('unexpected_noindex', 'runtime', '공개 대상 페이지가 noindex로 표시됩니다.', {robots}));
      if (robotsBlocksAll) issues.push(issue('robots_blocks_all', 'runtime', 'robots.txt가 전체 크롤링을 차단합니다.'));
      if (!sitemapCounts.has(page.route)) issues.push(issue('sitemap_missing', 'runtime', '사이트맵에서 공개 경로가 누락됐습니다.'));
      if ((sitemapCounts.get(page.route) ?? 0) > 1) issues.push(issue('sitemap_duplicate', 'runtime', '사이트맵에 같은 공개 경로가 중복됐습니다.', {count: sitemapCounts.get(page.route)}));
    }
    if ((inbound.get(page.route) ?? 0) === 0) issues.push(issue('orphan_page', 'runtime', '다른 정적 페이지에서 들어오는 내부 링크가 없습니다.'));
    const depth = depths.get(page.route);
    if (depth === undefined) issues.push(issue('crawl_unreachable', 'runtime', '홈에서 내부 링크로 도달할 수 없습니다.'));
    else if (depth > 3) issues.push(issue('crawl_depth_over_three', 'runtime', '홈에서 세 번을 초과해 클릭해야 도달합니다.', {crawl_depth: depth}));
    issues.push(...structuredDataIssues({...page, h1}, documents, baseUrl));
    audited.push({
      page_type: page.page_type,
      id: page.id,
      route: page.route,
      title,
      description,
      description_length: normalizeText(description).length,
      canonical,
      robots: robots || 'inherited_index_follow',
      h1,
      sitemap_count: sitemapCounts.get(page.route) ?? 0,
      inbound_internal_links: inbound.get(page.route) ?? 0,
      crawl_depth: depth ?? null,
      jsonld_types: flattenJsonLdTypes(documents).map(item => item.type),
      issues,
    });
  }

  const duplicateTitles = duplicateGroups(audited, 'title');
  const duplicateDescriptions = duplicateGroups(audited, 'description');
  const duplicateTitleRoutes = new Set(duplicateTitles.flatMap(group => group.routes));
  const duplicateDescriptionRoutes = new Set(duplicateDescriptions.flatMap(group => group.routes));
  for (const page of audited) {
    if (duplicateTitleRoutes.has(page.route)) page.issues.push(issue('duplicate_title', 'data', '다른 공개 페이지와 문서 제목이 같습니다.'));
    if (duplicateDescriptionRoutes.has(page.route)) page.issues.push(issue('duplicate_description', 'data', '다른 공개 페이지와 메타 설명이 같습니다.'));
  }

  const issueCounts = {};
  const layerCounts = {data: 0, runtime: 0};
  for (const finding of audited.flatMap(page => page.issues)) {
    issueCounts[finding.code] = (issueCounts[finding.code] ?? 0) + 1;
    layerCounts[finding.layer] += 1;
  }
  return {
    schema: 'rulelink_public_technical_seo_audit_v1',
    generated_from: {
      snapshot_id: bundle.snapshot_id,
      build_root: buildRoot,
      base_url: baseUrl,
      indexing_mode: resolvedIndexingMode,
      external_search_data: 'not_provided_and_not_estimated',
      search_volume: 'not_provided_and_not_estimated',
      advertising_rpm: 'not_provided_and_not_estimated',
    },
    coverage: Object.fromEntries(Object.keys(PAGE_TYPES).map(type => [
      type,
      audited.filter(page => page.page_type === type).length,
    ]).concat([['total', audited.length]])),
    summary: {
      pages_with_issues: audited.filter(page => page.issues.length).length,
      pages_without_issues: audited.filter(page => !page.issues.length).length,
      issue_counts: Object.fromEntries(Object.entries(issueCounts).sort()),
      layer_counts: layerCounts,
      duplicate_title_groups: duplicateTitles.length,
      duplicate_description_groups: duplicateDescriptions.length,
      sitemap_target_missing: [...expectedRoutes].filter(route => !sitemapCounts.has(route)).length,
      sitemap_target_duplicate: [...expectedRoutes].filter(route => (sitemapCounts.get(route) ?? 0) > 1).length,
    },
    duplicate_titles: duplicateTitles,
    duplicate_descriptions: duplicateDescriptions,
    pages: audited.sort((left, right) => (
      right.issues.length - left.issues.length || left.route.localeCompare(right.route, 'en')
    )),
  };
}

export function renderTechnicalSeoMarkdown(report) {
  const lines = [
    '# RuleLink 공개 페이지 기술 SEO 전수감사',
    '',
    `- 공개본: ${report.generated_from.snapshot_id}`,
    `- 범위: 지식 상세 ${report.coverage.knowledge} / 주제 허브 ${report.coverage.hub} / 법령변화 ${report.coverage.change} / 합계 ${report.coverage.total}`,
    `- 결손 페이지: ${report.summary.pages_with_issues} / 무결손 페이지: ${report.summary.pages_without_issues}`,
    `- 데이터 결손 ${report.summary.layer_counts.data}건 / 공통 실행계층 결손 ${report.summary.layer_counts.runtime}건`,
    '- 검색콘솔·검색량·광고 RPM: 입력 없음, 추정하지 않음',
    '',
    '## 결손 종류',
    '',
    ...Object.entries(report.summary.issue_counts).map(([code, count]) => `- ${code}: ${count}`),
    '',
    '## 우선 실행 대상',
    '',
    '|경로|유형|결손|근거|',
    '|---|---|---|---|',
  ];
  for (const page of report.pages.filter(page => page.issues.length).slice(0, 50)) {
    lines.push(`|${page.route}|${page.page_type}|${page.issues.map(item => item.code).join(', ')}|${page.issues.map(item => item.message_ko).join(' / ')}|`);
  }
  return `${lines.join('\n')}\n`;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? '' : '';
}

async function main() {
  const args = process.argv.slice(2);
  const bundlePath = path.resolve(option(args, '--bundle') || defaultBundlePath);
  const buildRoot = path.resolve(option(args, '--build-root') || defaultBuildRoot);
  const baseUrl = option(args, '--base-url') || process.env.NEXT_PUBLIC_SITE_URL || 'https://rulelink.lolphysical.xyz';
  const indexingMode = option(args, '--indexing-mode') || 'auto';
  const report = await auditPublicationTechnicalSeo({
    bundle: JSON.parse(await readFile(bundlePath, 'utf8')),
    buildRoot,
    baseUrl,
    indexingMode,
  });
  const jsonPath = option(args, '--json');
  const markdownPath = option(args, '--markdown');
  if (jsonPath) {
    await mkdir(path.dirname(path.resolve(jsonPath)), {recursive: true});
    await writeFile(path.resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  const markdown = renderTechnicalSeoMarkdown(report);
  if (markdownPath) {
    await mkdir(path.dirname(path.resolve(markdownPath)), {recursive: true});
    await writeFile(path.resolve(markdownPath), markdown, 'utf8');
  }
  if (!jsonPath && !markdownPath) process.stdout.write(markdown);
  else console.log(`기술 SEO 감사 완료: ${report.coverage.total}개 페이지 / ${report.generated_from.snapshot_id}`);
}

if (path.resolve(process.argv[1] ?? '') === scriptPath) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
