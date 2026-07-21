import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const DEFAULT_BASE_URL = 'https://rulelink.lolphysical.xyz';

export function expectedPublicationCounts(bundle) {
  return {
    issue_cards: bundle.cards?.length ?? 0,
    change_briefs: bundle.change_briefs?.length ?? 0,
    knowledge_entries: bundle.knowledge?.content_entries?.length ?? 0,
    knowledge_hubs: bundle.knowledge?.topic_hubs?.length ?? 0,
    public_topics: bundle.catalog?.topics?.length ?? 0,
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
  assert(
    JSON.stringify(publication.counts) === JSON.stringify(expectedPublicationCounts(bundle)),
    '운영 주소의 공개 콘텐츠 수가 main 출판본과 다릅니다.',
  );

  const publicStatusText = JSON.stringify(publication);
  for (const forbidden of ['source_snapshot_id', 'file_hashes', 'source_id', 'source_hash', 'raw_prompt', 'internal_path']) {
    assert(!publicStatusText.includes(forbidden), `publication.json에 비공개 필드가 있습니다: ${forbidden}`);
  }
}

export function expectedLiveRoutes(bundle) {
  const routes = new Set(['/']);
  for (const card of bundle.cards ?? []) routes.add(`/ko/issues/${card.slug}`);
  for (const brief of bundle.change_briefs ?? []) routes.add(`/ko/changes/${brief.slug}`);
  for (const entry of bundle.knowledge?.content_entries ?? []) routes.add(`/ko/knowledge/${entry.slug}`);
  for (const hub of bundle.knowledge?.topic_hubs ?? []) routes.add(`/ko/hubs/${hub.slug}`);
  for (const topic of bundle.catalog?.topics ?? []) routes.add(`/ko/topics/${topic.slug}`);
  if ((bundle.change_briefs?.length ?? 0) > 0) routes.add('/ko/changes');
  if ((bundle.knowledge?.content_entries?.length ?? 0) > 0) routes.add('/ko/knowledge');
  if ((bundle.knowledge?.sources?.length ?? 0) > 0) routes.add('/ko/sources');
  return [...routes];
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
