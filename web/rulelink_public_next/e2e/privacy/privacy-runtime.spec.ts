import {readFileSync} from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page, type TestInfo} from '@playwright/test';

const mode = process.env.RULELINK_PRIVACY_MODE ?? 'default';
const widths = [320, 390, 768, 1440] as const;
const bundle = JSON.parse(readFileSync(
  process.env.RULELINK_PRIVACY_BUNDLE_PATH
    ?? path.resolve(process.cwd(), 'content', 'bundle.json'),
  'utf8',
));
const checklistEntry = bundle.knowledge.content_entries.find(
  (entry: {
    action_steps_ko?: string[];
    facts_to_check_ko?: string[];
    slug: string;
  }) => (
    (entry.facts_to_check_ko?.length ?? 0) > 0
    && (entry.action_steps_ko?.length ?? 0) > 0
  ),
);
if (!checklistEntry) throw new Error('체크리스트 브라우저 표본이 없습니다.');

for (const width of widths) {
  test(`default ${width}px 광고·분석 0과 무횡스크롤`, async ({
    page,
  }, testInfo) => {
    test.skip(mode !== 'default', 'default zero-state 전용');
    await preparePage(page, width);
    const externalRequests: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).origin !== baseOrigin()) {
        externalRequests.push(request.url());
      }
    });
    const response = await page.goto(
      `/ko/knowledge/${checklistEntry.slug}`,
      {waitUntil: 'networkidle'},
    );
    expect(response?.status()).toBe(200);
    await assertNoHorizontalOverflow(page);
    await expect(page.locator('[data-ad-placeholder]')).toHaveCount(0);
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(externalRequests).toEqual([]);
    expect(await page.evaluate(() => (
      (window as typeof window & {__beacons: unknown[]}).__beacons
    ))).toEqual([]);
    expect(await response?.headerValue('set-cookie')).toBeNull();
    expect(await page.context().cookies()).toEqual([]);
    await writeEvidence(testInfo, {
      externalRequests,
      id: 'default-zero-state',
      route: `/ko/knowledge/${checklistEntry.slug}`,
      width,
    });
  });
}

test('default privacy 404·footer/sitemap 링크 0', async ({page}) => {
  test.skip(mode !== 'default', 'default zero-state 전용');
  const response = await page.goto('/ko/privacy', {waitUntil: 'networkidle'});
  expect(response?.status()).toBe(404);
  await page.goto('/', {waitUntil: 'networkidle'});
  await expect(page.locator('a[href="/ko/privacy"]')).toHaveCount(0);
  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).not.toContain('/ko/privacy');
});

test('체크리스트는 미동작 0→사용자 체크 exact key 1→초기화 0이다', async ({
  page,
}) => {
  test.skip(mode !== 'default', 'default zero-state 전용');
  await preparePage(page, 390);
  await page.goto(
    `/ko/knowledge/${checklistEntry.slug}`,
    {waitUntil: 'networkidle'},
  );
  expect(await storageState(page)).toEqual({
    caches: 0,
    indexedDatabases: 0,
    localKeys: [],
    sessionKeys: [],
  });
  await page.getByRole('checkbox').first().check();
  await expect.poll(async () => (
    page.evaluate(() => Object.keys(localStorage))
  )).toHaveLength(1);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys[0]).toMatch(new RegExp(
    `^rulelink-checklist-v1:${escapeRegExp(checklistEntry.content_id)}:`,
  ));
  await page.getByRole('button', {name: '표시 초기화'}).click();
  await expect.poll(async () => (
    page.evaluate(() => Object.keys(localStorage))
  )).toEqual([]);
  expect(await page.context().cookies()).toEqual([]);
});

test.describe('privacy enabled fixture', () => {
  for (const width of widths) {
    test(`privacy ${width}px 접근성·무횡스크롤`, async ({
      page,
    }, testInfo) => {
      test.skip(mode !== 'enabled', 'enabled privacy fixture 전용');
      await preparePage(page, width);
      const response = await page.goto('/ko/privacy', {
        waitUntil: 'networkidle',
      });
      expect(response?.status()).toBe(200);
      await assertNoHorizontalOverflow(page);
      await expect(page.locator('[data-data-practice]')).toHaveCount(4);
      await expect(page.locator(
        '[data-practice-status="active"]',
      )).toHaveCount(2);
      await expect(page.locator(
        '[data-practice-status="disabled"]',
      )).toHaveCount(2);
      for (const heading of [
        '파기절차와 방법',
        '정보주체와 법정대리인의 권리',
        '개인정보 보호·고충처리 담당',
        '안전성 확보조치',
        '제3자 제공',
        '처리위탁',
        '국외이전',
        '자동 수집 장치',
      ]) {
        await expect(page.getByRole('heading', {name: heading})).toBeVisible();
      }
      await expect(page.locator(
        'a[href="mailto:privacy@vercel.com"]',
      )).toHaveCount(2);
      const axe = await new AxeBuilder({page})
        .withTags([
          'wcag2a',
          'wcag2aa',
          'wcag21a',
          'wcag21aa',
          'wcag22a',
          'wcag22aa',
        ])
        .analyze();
      const failing = axe.violations.filter(
        item => ['moderate', 'serious', 'critical'].includes(
          item.impact ?? '',
        ),
      );
      expect(failing, JSON.stringify(failing, null, 2)).toEqual([]);
      await writeEvidence(testInfo, {
        axeVersion: axe.testEngine.version,
        id: 'privacy-enabled',
        route: '/ko/privacy',
        violations: axe.violations,
        width,
      });
    });
  }

  test('privacy footer·sitemap·구조화데이터가 같은 운영 정본을 쓴다', async ({
    page,
  }) => {
    test.skip(mode !== 'enabled', 'enabled privacy fixture 전용');
    await page.goto('/ko/privacy', {waitUntil: 'networkidle'});
    await expect(page.getByRole('heading', {
      level: 1,
      name: '실제로 처리하는 데이터만 공개합니다.',
    })).toBeVisible();
    await expect(page.getByText('리알레 주식회사')).toBeVisible();
    const graphs = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll(scripts => scripts.map(script => (
        JSON.parse(script.textContent ?? '{}')
      )));
    expect(JSON.stringify(graphs)).toContain('privacy@rulelink.kr');
    expect(JSON.stringify(graphs)).not.toContain('?subject=privacy');
    expect(JSON.stringify(graphs)).toContain('2026-07-24');
    await expect(page.locator(
      'a[href="mailto:privacy@rulelink.kr?subject=privacy"]',
    )).toHaveCount(2);
    await page.goto('/', {waitUntil: 'networkidle'});
    await expect(page.locator('footer a[href="/ko/privacy"]')).toHaveCount(1);
    const sitemap = await page.request.get('/sitemap.xml');
    expect(await sitemap.text()).toContain('/ko/privacy');
  });
});

async function preparePage(page: Page, width: number) {
  await page.setViewportSize({width, height: width <= 390 ? 844 : 1000});
  await page.addInitScript(() => {
    (window as typeof window & {__beacons: unknown[]}).__beacons = [];
    const original = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (...args) => {
      (window as typeof window & {__beacons: unknown[]}).__beacons.push(args);
      return original(...args);
    };
  });
}

async function storageState(page: Page) {
  return page.evaluate(async () => ({
    caches: (await caches.keys()).length,
    indexedDatabases:
      typeof indexedDB.databases === 'function'
        ? (await indexedDB.databases()).length
        : 0,
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage),
  }));
}

async function assertNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(layout.body, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.viewport + 1,
  );
  expect(layout.document, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.viewport + 1,
  );
}

async function writeEvidence(
  testInfo: TestInfo,
  evidence: Record<string, unknown>,
) {
  const root = requiredEnvironment('RULELINK_PRIVACY_EVIDENCE_ROOT');
  const filename = [
    mode,
    evidence.id,
    evidence.width ?? 'all',
  ].join('-') + '.json';
  const complete = {
    schema: 'rulelink_public_privacy_browser_evidence_v1',
    generatedAt: new Date().toISOString(),
    mode,
    ...evidence,
  };
  await import('node:fs/promises').then(async ({mkdir, writeFile}) => {
    await mkdir(root, {recursive: true});
    await writeFile(
      path.join(root, filename),
      `${JSON.stringify(complete, null, 2)}\n`,
      'utf8',
    );
  });
  await testInfo.attach('privacy-evidence', {
    body: Buffer.from(JSON.stringify(complete, null, 2)),
    contentType: 'application/json',
  });
}

function baseOrigin() {
  return `http://127.0.0.1:${
    requiredEnvironment('RULELINK_PRIVACY_PORT')
  }`;
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경값이 필요합니다.`);
  return value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
