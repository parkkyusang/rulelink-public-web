import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

import {selectHomepageKnowledge} from '../src/lib/homepage-knowledge-selection.ts';

const appRoot = process.cwd();
const port = Number(process.env.RULELINK_SMOKE_PORT || 18800);
const baseUrl = `http://127.0.0.1:${port}`;
const bundle = JSON.parse(await readFile(path.join(appRoot, 'content', 'bundle.json'), 'utf8'));
const nextCli = path.join(appRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const server = spawn(process.execPath, [nextCli, 'start', '-p', String(port), '-H', '127.0.0.1'], {
  cwd: appRoot,
  env: {...process.env, NODE_ENV: 'production'},
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output = appendOutput(output, chunk); });
server.stderr.on('data', chunk => { output = appendOutput(output, chunk); });

try {
  await waitForServer(server);
  const statusResponse = await fetch(`${baseUrl}/publication.json`, {cache: 'no-store'});
  assert(statusResponse.ok, `publication.json 응답 실패: ${statusResponse.status}`);
  const publication = await statusResponse.json();
  assert(publication.schema === 'rulelink_publication_status_v1', 'publication.json 스키마가 다릅니다.');
  assert(publication.status === 'published', '운영 스모크 테스트는 승인 출판본 상태여야 합니다.');
  assert(publication.snapshot_id === bundle.snapshot_id, '운영 상태의 snapshot_id가 빌드 입력과 다릅니다.');

  const expectedCounts = {
    issue_cards: bundle.cards?.length ?? 0,
    change_briefs: bundle.change_briefs?.length ?? 0,
    knowledge_entries: bundle.knowledge?.content_entries?.length ?? 0,
    knowledge_hubs: bundle.knowledge?.topic_hubs?.length ?? 0,
    public_topics: bundle.catalog?.topics?.length ?? 0,
  };
  assert(JSON.stringify(publication.counts) === JSON.stringify(expectedCounts), '운영 상태의 콘텐츠 수가 빌드 입력과 다릅니다.');

  const publicStatusText = JSON.stringify(publication);
  for (const forbidden of ['source_snapshot_id', 'file_hashes', 'source_id', 'source_hash', 'raw_prompt', 'internal_path']) {
    assert(!publicStatusText.includes(forbidden), `publication.json에 비공개 필드가 있습니다: ${forbidden}`);
  }

  const homeResponse = await fetch(baseUrl, {cache: 'no-store'});
  assert(homeResponse.ok, `홈 응답 실패: ${homeResponse.status}`);
  const homeHtml = await homeResponse.text();
  assert(homeHtml.includes('href="/ko/knowledge">상황별 지식</a>'), '상단 메뉴가 공개 지식으로 연결되지 않습니다.');
  assert(homeHtml.includes('href="/ko/sources">공식 근거</a>'), '상단 메뉴가 공식 근거 보관함으로 연결되지 않습니다.');
  for (const entry of selectHomepageKnowledge(bundle.knowledge?.content_entries ?? [], 6)) {
    assert(homeHtml.includes(`href="/ko/knowledge/${entry.slug}"`), `홈에서 공개 지식이 노출되지 않습니다: ${entry.slug}`);
  }
  for (const hub of bundle.knowledge?.topic_hubs ?? []) {
    assert(homeHtml.includes(`href="/ko/hubs/${hub.slug}"`), `홈에서 공개 지식 허브가 노출되지 않습니다: ${hub.slug}`);
  }
  if ((bundle.cards?.length ?? 0) === 0 && (bundle.knowledge?.content_entries?.length ?? 0) > 0) {
    assert(!homeHtml.includes('검토된 법률정보를 준비하고 있습니다.'), '공개 지식이 있는데 준비 중 빈 화면을 표시합니다.');
  }

  const indexableRoutes = new Set(['/', '/ko/method', '/ko/search']);
  if ((bundle.knowledge?.sources?.length ?? 0) > 0) indexableRoutes.add('/ko/sources');
  for (const card of bundle.cards ?? []) indexableRoutes.add(`/ko/issues/${card.slug}`);
  for (const brief of bundle.change_briefs ?? []) indexableRoutes.add(`/ko/changes/${brief.slug}`);
  for (const entry of bundle.knowledge?.content_entries ?? []) indexableRoutes.add(`/ko/knowledge/${entry.slug}`);
  for (const hub of bundle.knowledge?.topic_hubs ?? []) indexableRoutes.add(`/ko/hubs/${hub.slug}`);
  for (const topic of bundle.catalog?.topics ?? []) indexableRoutes.add(`/ko/topics/${topic.slug}`);
  if ((bundle.change_briefs?.length ?? 0) > 0) indexableRoutes.add('/ko/changes');
  if ((bundle.knowledge?.content_entries?.length ?? 0) > 0) indexableRoutes.add('/ko/knowledge');

  const routes = new Set([...indexableRoutes, '/publication.json', '/robots.txt', '/sitemap.xml']);
  const feedItems = [
    ...(bundle.change_briefs ?? []).map(item => `/ko/changes/${item.slug}`),
    ...(bundle.knowledge?.content_entries ?? []).map(item => `/ko/knowledge/${item.slug}`),
  ];
  if (feedItems.length) routes.add('/feed.xml');

  if (feedItems.length) {
    const feedResponse = await fetch(`${baseUrl}/feed.xml`, {cache: 'no-store'});
    assert(feedResponse.ok, `RSS 응답 실패: ${feedResponse.status}`);
    const feedXml = await feedResponse.text();
    for (const route of feedItems) {
      assert(feedXml.includes(route), `RSS에서 공개 콘텐츠가 누락됐습니다: ${route}`);
    }
  }

  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`, {cache: 'no-store'});
  assert(sitemapResponse.ok, `사이트맵 응답 실패: ${sitemapResponse.status}`);
  const sitemapXml = await sitemapResponse.text();
  if (sitemapXml.includes('<loc>')) {
    for (const route of indexableRoutes) {
      assert(sitemapXml.includes(route), `사이트맵에서 공개 경로가 누락됐습니다: ${route}`);
    }
    const robotsResponse = await fetch(`${baseUrl}/robots.txt`, {cache: 'no-store'});
    assert(robotsResponse.ok, `robots.txt 응답 실패: ${robotsResponse.status}`);
    assert((await robotsResponse.text()).includes('sitemap.xml'), 'robots.txt가 사이트맵을 알리지 않습니다.');
  }

  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`, {redirect: 'follow'});
    assert(response.ok, `공개 경로 응답 실패: ${route} -> ${response.status}`);
  }

  process.stdout.write(`공개 런타임 스모크 테스트 통과: ${bundle.snapshot_id}, ${routes.size}개 경로\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n서버 출력:\n${output}\n`);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([once(server, 'exit'), delay(5000)]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
}

async function waitForServer(serverProcess) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverProcess.exitCode !== null) throw new Error(`Next.js 서버가 일찍 종료됐습니다: ${serverProcess.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/publication.json`, {cache: 'no-store'});
      if (response.ok) return;
    } catch {
      // 서버가 수신을 시작할 때까지 다시 확인한다.
    }
    await delay(500);
  }
  throw new Error('Next.js 서버가 30초 안에 준비되지 않았습니다.');
}

function appendOutput(current, chunk) {
  return `${current}${String(chunk)}`.slice(-12000);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
