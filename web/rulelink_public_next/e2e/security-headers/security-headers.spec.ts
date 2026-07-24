import {readFileSync} from 'node:fs';

import {expect, test, type Page, type Response} from '@playwright/test';

import {publicSecurityResponseHeaders} from '../../src/lib/public-security-headers';

const widths = [320, 390, 768, 1440] as const;
const bundle = JSON.parse(readFileSync('content/bundle.json', 'utf8'));
const selection = selectRoutes(bundle);
const expectedHeaders = new Map(publicSecurityResponseHeaders.map(
  header => [header.key.toLowerCase(), header.value],
));

for (const width of widths) {
  test(`${width}px 실제 공개 경로는 보안정책과 기능을 함께 보존한다`, async ({
    context,
    page,
    request,
  }) => {
    await page.setViewportSize({height: 1000, width});
    const violations: string[] = [];
    const runtimeErrors: string[] = [];
    let activeRoute = '';
    await page.addInitScript(() => {
      window.addEventListener('securitypolicyviolation', event => {
        const store = (
          window as Window & {__rulelinkCspViolations?: string[]}
        );
        store.__rulelinkCspViolations ??= [];
        store.__rulelinkCspViolations.push(
          `${event.effectiveDirective}:${event.blockedURI}`,
        );
      });
    });
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (
        activeRoute === '/ko/trust'
        && text === 'Failed to load resource: the server responded with a status of 404 (Not Found)'
      ) return;
      runtimeErrors.push(`${activeRoute}: ${text}`);
    });
    page.on('pageerror', error => runtimeErrors.push(error.message));

    for (const route of selection.routes) {
      activeRoute = route;
      const response = await page.goto(route, {waitUntil: 'networkidle'});
      expect(response, route).not.toBeNull();
      assertSecurityHeaders(response as Response);
      await assertNoHorizontalOverflow(page, route);
      violations.push(...await currentCspViolations(page));
    }

    activeRoute = '/ko/search';
    await page.goto('/ko/search');
    const searchResponse = page.waitForResponse(response => (
      new URL(response.url()).pathname === '/search-index.json'
    ));
    await page.getByLabel(
      '상황, 법 이름, 조문이나 사건번호를 적어보세요',
    ).fill(selection.query);
    const indexResponse = await searchResponse;
    assertSecurityHeaders(indexResponse);
    await expect(page.locator('[data-search-index-state]')).toHaveAttribute(
      'data-search-index-state',
      'ready',
    );
    await expect(page.locator('[data-search-result-id]').first()).toBeVisible();
    violations.push(...await currentCspViolations(page));

    await context.route('https://www.law.go.kr/**', route => route.fulfill({
      body: '<!doctype html><title>공식원문 시험 응답</title>',
      contentType: 'text/html; charset=utf-8',
      status: 200,
    }));
    activeRoute = selection.officialRoute;
    await page.goto(selection.officialRoute);
    const officialLink = page.locator(
      'a[href*="law.go.kr"][target="_blank"]',
    ).first();
    await expect(officialLink).toBeVisible();
    const hashBefore = await page.evaluate(() => location.hash);
    const popupPromise = page.waitForEvent('popup');
    await officialLink.focus();
    await page.keyboard.press('Enter');
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    expect(new URL(popup.url()).hostname).toBe('www.law.go.kr');
    expect(await page.evaluate(() => location.hash)).toBe(hashBefore);
    await popup.close();
    violations.push(...await currentCspViolations(page));

    for (const route of [
      '/robots.txt',
      '/sitemap.xml',
      '/manifest.webmanifest',
      '/search-index.json',
    ]) {
      const response = await request.get(route);
      expect(response.ok(), route).toBe(true);
      assertHeaderMap(response.headers());
    }
    const asset = await page.locator(
      'script[src^="/_next/"], link[href^="/_next/"]',
    ).first().getAttribute('src').catch(() => null)
      ?? await page.locator('link[href^="/_next/"]').first().getAttribute('href');
    expect(asset).toBeTruthy();
    const assetResponse = await request.get(asset as string);
    expect(assetResponse.ok()).toBe(true);
    assertHeaderMap(assetResponse.headers());

    expect(violations, violations.join('\n')).toEqual([]);
    expect(runtimeErrors, runtimeErrors.join('\n')).toEqual([]);
  });
}

async function currentCspViolations(page: Page) {
  return page.evaluate(() => (
    (window as Window & {__rulelinkCspViolations?: string[]})
      .__rulelinkCspViolations ?? []
  ));
}

function assertSecurityHeaders(response: Response) {
  assertHeaderMap(response.headers());
}

function assertHeaderMap(headers: Record<string, string>) {
  for (const [name, value] of expectedHeaders) {
    expect(headers[name], name).toBe(value);
  }
  expect(headers['cross-origin-opener-policy']).toBeUndefined();
  expect(headers['cross-origin-resource-policy']).toBeUndefined();
}

async function assertNoHorizontalOverflow(page: Page, route: string) {
  const measurement = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    measurement.scrollWidth - measurement.clientWidth,
    route,
  ).toBeLessThanOrEqual(1);
}

function selectRoutes(publication: any) {
  const entries = publication.knowledge.content_entries;
  const hubs = publication.knowledge.topic_hubs;
  const changes = publication.change_briefs;
  const typed = entries.find((entry: any) => entry.related_edges?.length);
  const fallback = entries.find((entry: any) => (
    !entry.related_edges?.length && entry.related_content_ids?.length
  ));
  const authorityZero = entries.find(
    (entry: any) => !entry.authority_binding_ids?.length,
  );
  const official = entries.find((entry: any) => (
    entry.source_coordinate_ids?.length
  ));
  const hub = hubs.reduce((selected: any, item: any) => (
    item.content_ids.length > selected.content_ids.length ? item : selected
  ));
  const change = changes.reduce((selected: any, item: any) => (
    (item.changed_points?.length ?? 0) > (selected.changed_points?.length ?? 0)
      ? item
      : selected
  ));
  if (!typed || !fallback || !authorityZero || !official || !hub || !change) {
    throw new Error('보안 헤더 브라우저 표본을 공개 번들에서 고를 수 없습니다.');
  }
  return {
    officialRoute: `/ko/knowledge/${official.slug}`,
    query: typed.search_intents_ko?.[0]
      ?? typed.audience_situation_ko
      ?? typed.title_ko,
    routes: [
      '/',
      '/ko/search',
      `/ko/hubs/${hub.slug}`,
      `/ko/knowledge/${typed.slug}`,
      `/ko/knowledge/${fallback.slug}`,
      `/ko/changes/${change.slug}`,
      '/ko/trust',
      `/ko/knowledge/${authorityZero.slug}`,
    ],
  };
}
