import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {filterFreshPublications} from '../src/lib/publication-freshness.ts';

const DEFAULT_BASE_URL = 'https://rulelink.lolphysical.xyz';
const nonVisibleElementPattern = /<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/giu;
const textFlowBoundaryPattern = /<\/?(?:address|article|aside|blockquote|body|br|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hgroup|hr|html|li|main|menu|nav|ol|p|pre|search|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/giu;

export function expectedPublicationCounts(bundle, now) {
  const visibleCards = filterFreshPublications(bundle.cards ?? [], now);
  const visibleCardIds = new Set(visibleCards.map(card => card.issue_card_id));
  const visibleTopics = (bundle.catalog?.topics ?? [])
    .filter(topic => topic.issue_card_ids.some(cardId => visibleCardIds.has(cardId)));
  return {
    issue_cards: visibleCards.length,
    change_briefs: filterFreshPublications(bundle.change_briefs ?? [], now).length,
    concept_cards: filterFreshPublications(bundle.knowledge?.concept_cards ?? [], now).length,
    knowledge_entries: filterFreshPublications(bundle.knowledge?.content_entries ?? [], now).length,
    knowledge_hubs: (bundle.knowledge?.topic_hubs ?? []).filter(hub => (
      hub.content_ids.some(contentId => (
        filterFreshPublications(bundle.knowledge?.content_entries ?? [], now)
          .some(entry => entry.content_id === contentId)
      ))
    )).length,
    public_topics: visibleTopics.length,
  };
}

export function validateLivePublication(publication, bundle) {
  assert(publication && typeof publication === 'object', 'publication.json이 객체가 아닙니다.');
  assert(publication.schema === 'rulelink_publication_status_v1', 'publication.json 스키마가 다릅니다.');
  assert(publication.status === 'published', '운영 주소가 승인 출판본 상태가 아닙니다.');
  assert(
    publication.snapshot_id === bundle.snapshot_id,
    `운영 스냅샷이 main과 다릅니다: expected=${bundle.snapshot_id}, actual=${publication.snapshot_id}`,
  );
  const expectedCounts = expectedPublicationCounts(bundle);
  assert(
    JSON.stringify(publication.counts) === JSON.stringify(expectedCounts),
    `운영 주소의 공개 콘텐츠 수가 main 출판본과 다릅니다: expected=${JSON.stringify(expectedCounts)}, actual=${JSON.stringify(publication.counts)}`,
  );

  const publicStatusText = JSON.stringify(publication);
  for (const forbidden of ['source_snapshot_id', 'file_hashes', 'source_id', 'source_hash', 'raw_prompt', 'internal_path']) {
    assert(!publicStatusText.includes(forbidden), `publication.json에 비공개 필드가 있습니다: ${forbidden}`);
  }
}

export function validateInlineConceptBoundaries(html, route = 'unknown') {
  const openMarker = '\uFFF0';
  const closeMarker = '\uFFF1';
  const annotatedText = html
    // React 전송 데이터와 비가시 요소는 화면의 텍스트 흐름이 아니므로 경계 판정에서 제외한다.
    .replace(nonVisibleElementPattern, '\n')
    .replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/giu, (button, attributes, label) => {
      if (!attributes.includes('termButton')) return button;
      return `${openMarker}${label.replace(/<[^>]*>/gu, '')}${closeMarker}`;
    })
    // 블록 사이에는 실제 단어 연속성이 없다. 인라인 태그만 제거해 같은 문장 안의 경계는 보존한다.
    .replace(textFlowBoundaryPattern, '\n')
    .replace(/<[^>]*>/gu, '');

  // 본문 자동 해설과 같은 규칙이다. 앞에 문자가 붙은 법정상속인·공동상속인은 차단하고,
  // 뒤에 붙는 한국어 조사(상속인이·상속인은 등)는 정상적인 독립 용례로 인정한다.
  const partialMatch = annotatedText.match(/[\p{L}\p{N}_]\uFFF0([^\uFFF1]+)\uFFF1/u);

  assert(
    !partialMatch,
    `운영 본문에서 긴 용어 내부의 부분 해설이 발견되었습니다: ${route} -> ${partialMatch?.[1] ?? ''}`,
  );
}

export function expectedLiveRoutes(bundle) {
  const routes = new Set(['/']);
  for (const card of bundle.cards ?? []) routes.add(`/ko/issues/${card.slug}`);
  for (const brief of bundle.change_briefs ?? []) routes.add(`/ko/changes/${brief.slug}`);
  for (const entry of bundle.knowledge?.content_entries ?? []) routes.add(`/ko/knowledge/${entry.slug}`);
  for (const hub of bundle.knowledge?.topic_hubs ?? []) routes.add(`/ko/hubs/${hub.slug}`);
  for (const concept of bundle.knowledge?.concept_cards ?? []) routes.add(`/ko/concepts/${concept.slug}`);
  for (const topic of bundle.catalog?.topics ?? []) routes.add(`/ko/topics/${topic.slug}`);
  if ((bundle.change_briefs?.length ?? 0) > 0) routes.add('/ko/changes');
  if ((bundle.knowledge?.content_entries?.length ?? 0) > 0) routes.add('/ko/knowledge');
  if ((bundle.knowledge?.sources?.length ?? 0) > 0) routes.add('/ko/sources');
  if ((bundle.knowledge?.concept_cards?.length ?? 0) > 0) routes.add('/ko/concepts');
  return [...routes];
}

export function representativeOfficialUrls(bundle) {
  const sources = bundle.knowledge?.sources ?? [];
  const selected = [
    sources.find(source => source.source_kind === 'precedent'),
    sources.find(source => source.source_kind === 'official_document'),
    sources.find(source => !source.source_kind || source.source_kind === 'statute'),
  ].filter(Boolean);
  return [...new Set(selected.map(source => source.official_url).filter(Boolean))];
}

export async function main() {
  const baseUrl = normalizeBaseUrl(process.env.RULELINK_PUBLIC_BASE_URL || DEFAULT_BASE_URL);
  const bundlePath = process.env.RULELINK_EXPECTED_BUNDLE
    ? path.resolve(process.env.RULELINK_EXPECTED_BUNDLE)
    : path.resolve(process.cwd(), '..', '..', 'artifacts', 'publication', 'current', 'bundle.json');
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const releasePath = process.env.RULELINK_RELEASE_MARKER
    ? path.resolve(process.env.RULELINK_RELEASE_MARKER)
    : path.resolve(process.cwd(), 'deploy', 'release.json');
  const release = JSON.parse(await readFile(releasePath, 'utf8'));
  assert(release.schema === 'rulelink_public_release_v1', '운영 공개 표식 스키마가 다릅니다.');
  assert(
    release.snapshot_id === bundle.snapshot_id,
    `운영 공개 표식과 현재 번들의 스냅샷이 다릅니다: marker=${release.snapshot_id}, bundle=${bundle.snapshot_id}`,
  );
  const attempts = positiveInteger(process.env.RULELINK_LIVE_SMOKE_ATTEMPTS, 42);
  const delayMs = positiveInteger(process.env.RULELINK_LIVE_SMOKE_DELAY_MS, 10000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const statusUrl = new URL('/publication.json', baseUrl);
      statusUrl.searchParams.set('deployment_check', `${Date.now()}-${attempt}`);
      const statusResponse = await fetchWithTimeout(statusUrl);
      assert(statusResponse.ok, `publication.json 응답 실패: ${statusResponse.status}`);
      const publication = await statusResponse.json();
      validateLivePublication(publication, bundle);

      const routes = expectedLiveRoutes(bundle);
      for (const route of routes) {
        const response = await fetchWithTimeout(new URL(route, baseUrl));
        assert(response.ok, `운영 공개 경로 응답 실패: ${route} -> ${response.status}`);
        if ((response.headers.get('content-type') ?? '').includes('text/html')) {
          validateInlineConceptBoundaries(await response.text(), route);
        }
      }

      const homeHtml = await (await fetchWithTimeout(new URL('/', baseUrl))).text();
      assert(!/noindex|nofollow/i.test(homeHtml), '운영 홈이 검색엔진 차단 메타를 포함합니다.');

      const robotsResponse = await fetchWithTimeout(new URL('/robots.txt', baseUrl));
      assert(robotsResponse.ok, `robots.txt 응답 실패: ${robotsResponse.status}`);
      const robotsText = await robotsResponse.text();
      assert(/Allow:\s*\//i.test(robotsText), 'robots.txt가 전체 공개 경로를 허용하지 않습니다.');
      assert(!/Disallow:\s*\/\s*$/im.test(robotsText), 'robots.txt가 전체 공개 경로를 차단합니다.');
      assert(/sitemap\.xml/i.test(robotsText), 'robots.txt가 사이트맵을 알리지 않습니다.');

      const sitemapResponse = await fetchWithTimeout(new URL('/sitemap.xml', baseUrl));
      assert(sitemapResponse.ok, `sitemap.xml 응답 실패: ${sitemapResponse.status}`);
      const sitemapText = await sitemapResponse.text();
      assert(/<loc>/i.test(sitemapText), 'sitemap.xml이 비어 있습니다.');
      for (const route of routes) {
        assert(sitemapText.includes(new URL(route, baseUrl).href), `sitemap.xml 공개 경로 누락: ${route}`);
      }

      for (const officialUrl of representativeOfficialUrls(bundle)) {
        const officialResponse = await fetchWithTimeout(new URL(officialUrl));
        assert(officialResponse.ok, `공식 원문 응답 실패: ${officialUrl} -> ${officialResponse.status}`);
      }

      process.stdout.write(
        `## 운영 실주소 점검 통과\n\n- 공개 식별자: \`${release.release_id}\`\n- 스냅샷: \`${bundle.snapshot_id}\`\n- 공개 경로: ${routes.length}개\n- 주소: ${baseUrl.origin}\n`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      process.stdout.write(
        `운영본 대기 ${attempt}/${attempts}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      await delay(delayMs);
    }
  }

  throw lastError ?? new Error('운영 실주소를 확인하지 못했습니다.');
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  assert(url.protocol === 'https:', '운영 실주소 점검은 HTTPS 주소만 허용합니다.');
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

async function fetchWithTimeout(url) {
  return fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: {'user-agent': 'RuleLink-GitHub-Production-Smoke/1.0'},
  });
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
