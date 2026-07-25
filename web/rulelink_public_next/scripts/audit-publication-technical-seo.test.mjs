import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditPublicationTechnicalSeo,
  renderTechnicalSeoMarkdown,
  resolveAuditBaseUrl,
} from './audit-publication-technical-seo.mjs';

function page({title, h1 = title, description, canonical, jsonLd, links = [], robots = ''}) {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${canonical}">${robots ? `<meta name="robots" content="${robots}">` : ''}<script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body><h1>${h1}</h1>${links.map(link => `<a href="${link}">이동</a>`).join('')}</body></html>`;
}

function bundle() {
  const entry = {
    content_id: 'content.one',
    slug: 'one',
    title_ko: '첫 질문',
    one_line_answer_ko: '첫 질문에 대한 독립적인 법률 설명을 충분한 길이로 제공하는 메타 설명입니다.',
  };
  return {
    schema: 'rulelink_published_bundle_v1',
    snapshot_id: 'snapshot.test',
    change_briefs: [{
      change_brief_id: 'change.one',
      slug: 'one',
      title_ko: '첫 변화',
      summary_ko: '첫 법령변화의 시행시점과 바뀌는 내용을 독자가 이해할 수 있도록 설명합니다.',
    }],
    knowledge: {
      content_entries: [entry],
      topic_hubs: [{
        hub_id: 'hub.one',
        slug: 'one',
        title_ko: '첫 허브',
        description_ko: '첫 허브가 다루는 사용자 상황과 연결되는 법률 질문의 범위를 설명합니다.',
      }],
    },
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rulelink-seo-'));
  await mkdir(path.join(root, 'ko', 'knowledge'), {recursive: true});
  await mkdir(path.join(root, 'ko', 'hubs'), {recursive: true});
  await mkdir(path.join(root, 'ko', 'changes'), {recursive: true});
  const base = 'https://example.test';
  await writeFile(path.join(root, 'index.html'), page({
    title: '홈',
    description: '법률정보 홈 설명은 충분히 길게 작성되어 있습니다. 필요한 생활법률 경로를 제공합니다.',
    canonical: `${base}/`,
    jsonLd: {'@type': 'WebSite'},
    links: ['/ko/knowledge/one', '/ko/hubs/one', '/ko/changes/one'],
  }));
  await writeFile(path.join(root, 'ko', 'knowledge', 'one.html'), page({
    title: '첫 질문 | 홈',
    h1: '첫 질문',
    description: '첫 질문에 대한 독립적인 법률 설명을 충분한 길이로 제공하는 메타 설명입니다.',
    canonical: `${base}/ko/knowledge/one`,
    jsonLd: {'@graph': [
      {'@type': 'WebPage', name: '첫 질문'},
      {'@type': 'BreadcrumbList', itemListElement: [{name: '첫 질문'}]},
    ]},
  }));
  await writeFile(path.join(root, 'ko', 'hubs', 'one.html'), page({
    title: '첫 허브 | 홈',
    h1: '첫 허브',
    description: '첫 허브가 다루는 사용자 상황과 연결되는 법률 질문의 범위를 설명합니다.',
    canonical: `${base}/ko/hubs/one`,
    jsonLd: {'@graph': [
      {'@type': 'CollectionPage', name: '첫 허브'},
      {'@type': 'BreadcrumbList', itemListElement: [{name: '첫 허브'}]},
    ]},
  }));
  await writeFile(path.join(root, 'ko', 'changes', 'one.html'), page({
    title: '첫 변화 | 홈',
    h1: '첫 변화',
    description: '첫 법령변화의 시행시점과 바뀌는 내용을 독자가 이해할 수 있도록 설명합니다.',
    canonical: `${base}/ko/changes/one`,
    jsonLd: {'@type': 'Article', headline: '첫 변화'},
  }));
  await writeFile(path.join(root, 'sitemap.xml.body'), [
    '<urlset>',
    ...['/ko/knowledge/one', '/ko/hubs/one', '/ko/changes/one'].map(route => `<url><loc>${base}${route}</loc></url>`),
    '</urlset>',
  ].join(''));
  await writeFile(path.join(root, 'robots.txt.body'), 'User-Agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml\n');
  return {root, base};
}

test('정적 HTML·사이트맵·robots·crawl depth를 페이지별로 전수감사한다', async () => {
  const {root, base} = await fixture();
  const report = await auditPublicationTechnicalSeo({bundle: bundle(), buildRoot: root, baseUrl: base});
  assert.deepEqual(report.coverage, {knowledge: 1, hub: 1, change: 1, total: 3});
  assert.equal(report.summary.sitemap_target_missing, 0);
  assert.equal(report.summary.sitemap_target_duplicate, 0);
  assert.equal(report.pages.find(item => item.page_type === 'knowledge').crawl_depth, 1);
  assert.deepEqual(
    report.pages.find(item => item.page_type === 'change').issues.map(item => item.code),
    ['jsonld_type_missing'],
  );
});

test('canonical·noindex·사이트맵·고립·구조화 데이터 화면 불일치를 exact evidence로 남긴다', async () => {
  const {root, base} = await fixture();
  const target = path.join(root, 'ko', 'knowledge', 'one.html');
  await writeFile(target, page({
    title: '첫 질문 | 홈',
    h1: '첫 질문',
    description: '짧음',
    canonical: `${base}/wrong`,
    robots: 'noindex, nofollow',
    jsonLd: {'@graph': [
      {'@type': 'WebPage', name: '다른 제목'},
      {'@type': 'BreadcrumbList', itemListElement: [{name: '다른 제목'}]},
    ]},
  }));
  await writeFile(path.join(root, 'index.html'), page({
    title: '홈',
    description: '법률정보 홈 설명은 충분히 길게 작성되어 있습니다. 필요한 생활법률 경로를 제공합니다.',
    canonical: `${base}/`,
    jsonLd: {'@type': 'WebSite'},
    links: ['/ko/hubs/one', '/ko/changes/one'],
  }));
  const report = await auditPublicationTechnicalSeo({bundle: bundle(), buildRoot: root, baseUrl: base});
  const codes = report.pages.find(item => item.page_type === 'knowledge').issues.map(item => item.code);
  for (const code of [
    'description_too_short',
    'canonical_mismatch',
    'unexpected_noindex',
    'orphan_page',
    'crawl_unreachable',
    'jsonld_visible_title_mismatch',
    'breadcrumb_visible_title_mismatch',
  ]) assert.ok(codes.includes(code), code);
});

test('한국어 Markdown은 데이터와 공통 실행계층 결손을 분리하고 외부 지표를 추정하지 않는다', async () => {
  const {root, base} = await fixture();
  const report = await auditPublicationTechnicalSeo({bundle: bundle(), buildRoot: root, baseUrl: base});
  const markdown = renderTechnicalSeoMarkdown(report);
  assert.match(markdown, /데이터 결손/u);
  assert.match(markdown, /공통 실행계층 결손/u);
  assert.match(markdown, /검색콘솔·검색량·광고 RPM: 입력 없음, 추정하지 않음/u);
});

test('preview/local 검색 차단은 명시 모드에서만 정상이고 기본 production 감사는 차단 사고로 판정한다', async () => {
  const {root, base} = await fixture();
  await writeFile(path.join(root, 'robots.txt.body'), 'User-Agent: *\nDisallow: /\n');
  await writeFile(path.join(root, 'sitemap.xml.body'), '<urlset></urlset>');
  for (const filename of [
    path.join(root, 'ko', 'knowledge', 'one.html'),
    path.join(root, 'ko', 'hubs', 'one.html'),
    path.join(root, 'ko', 'changes', 'one.html'),
  ]) {
    const html = await import('node:fs/promises').then(({readFile}) => readFile(filename, 'utf8'));
    await writeFile(filename, html.replace('</head>', '<meta name="robots" content="noindex, nofollow"></head>'));
  }
  const preview = await auditPublicationTechnicalSeo({
    bundle: bundle(),
    buildRoot: root,
    baseUrl: base,
    indexingMode: 'blocked-preview',
  });
  assert.equal(preview.generated_from.indexing_mode, 'blocked-preview');
  assert.ok(preview.pages.every(item => !item.issues.some(finding => (
    finding.code === 'unexpected_noindex' ||
    finding.code === 'robots_blocks_all' ||
    finding.code === 'sitemap_missing'
  ))));
  const production = await auditPublicationTechnicalSeo({
    bundle: bundle(),
    buildRoot: root,
    baseUrl: base,
  });
  assert.equal(production.generated_from.indexing_mode, 'production');
  assert.ok(production.pages.every(item => item.issues.some(finding => finding.code === 'unexpected_noindex')));
  assert.ok(production.pages.every(item => item.issues.some(finding => finding.code === 'sitemap_missing')));
});

test('화면과 구조화 데이터가 서로 일치해도 정본 제목·설명을 바꿔 끼우면 차단한다', async () => {
  const {root, base} = await fixture();
  await writeFile(path.join(root, 'ko', 'knowledge', 'one.html'), page({
    title: '첫 허브 | 홈',
    h1: '첫 허브',
    description: '첫 허브가 다루는 사용자 상황과 연결되는 법률 질문의 범위를 설명합니다.',
    canonical: `${base}/ko/knowledge/one`,
    jsonLd: {'@graph': [
      {'@type': 'WebPage', name: '첫 허브'},
      {'@type': 'BreadcrumbList', itemListElement: [{name: '첫 허브'}]},
    ]},
  }));
  const report = await auditPublicationTechnicalSeo({bundle: bundle(), buildRoot: root, baseUrl: base});
  const codes = report.pages.find(item => item.page_type === 'knowledge').issues.map(item => item.code);
  assert.ok(codes.includes('title_source_mismatch'));
  assert.ok(codes.includes('description_source_mismatch'));
  assert.ok(codes.includes('h1_source_mismatch'));
  assert.ok(!codes.includes('jsonld_visible_title_mismatch'));
});

test('감사 기준 URL은 CLI 또는 공개사이트 정본 환경값이 없거나 안전하지 않으면 실패한다', () => {
  assert.throws(
    () => resolveAuditBaseUrl({environment: {}}),
    /--base-url 또는 NEXT_PUBLIC_RULELINK_SITE_URL/u,
  );
  assert.throws(
    () => resolveAuditBaseUrl({argument: 'not-a-url', environment: {}}),
    /유효하지 않습니다/u,
  );
  assert.throws(
    () => resolveAuditBaseUrl({argument: 'http://alternate.example', environment: {}}),
    /HTTPS origin/u,
  );
  assert.throws(
    () => resolveAuditBaseUrl({argument: 'https://alternate.example/path', environment: {}}),
    /HTTPS origin/u,
  );
  assert.equal(
    resolveAuditBaseUrl({argument: 'https://alternate.example', environment: {}}),
    'https://alternate.example',
  );
  assert.equal(
    resolveAuditBaseUrl({environment: {NEXT_PUBLIC_RULELINK_SITE_URL: 'https://environment.example'}}),
    'https://environment.example',
  );
});

test('감사기·법령변화 구조화 데이터·페이지는 특정 운영 도메인을 정본처럼 포함하지 않는다', async () => {
  const forbiddenHostFragment = ['lol', 'physical'].join('');
  for (const relativePath of [
    'scripts/audit-publication-technical-seo.mjs',
    'src/lib/change-brief-structured-data.ts',
    'app/ko/changes/[slug]/page.tsx',
  ]) {
    const source = await import('node:fs/promises').then(({readFile}) => readFile(relativePath, 'utf8'));
    assert.ok(!source.includes(forbiddenHostFragment), relativePath);
  }
});
