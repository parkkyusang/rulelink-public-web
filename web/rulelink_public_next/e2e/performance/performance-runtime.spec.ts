import {readFileSync} from 'node:fs';
import path from 'node:path';

import {expect, test, type Page, type TestInfo} from '@playwright/test';

import {
  performanceWidths,
  resolvePerformanceCases,
} from './support/performance-cases.mjs';
import {performanceBudgets} from './support/performance-evidence.mjs';

const bundle = JSON.parse(readFileSync(
  path.resolve(process.cwd(), 'content', 'bundle.json'),
  'utf8',
));
const selection = resolvePerformanceCases(bundle);
const ordinaryCases = selection.routes.filter(item => (
  item.id !== 'search-initial' && item.id !== 'search-query'
));

for (const width of performanceWidths) {
  for (const routeCase of ordinaryCases) {
    test(`${routeCase.id} ${width}px production 성능`, async ({
      page,
    }, testInfo) => {
      await preparePage(page, width);
      const response = await page.goto(routeCase.route, {
        waitUntil: 'networkidle',
      });
      expect(response?.status()).toBe(200);
      if (routeCase.id === 'authority-zero') {
        await expect(page.locator('[data-authority-reading-root]')).toHaveCount(0);
        await expect(page.locator('a[href^="/ko/authorities/"]')).toHaveCount(0);
      }
      await assertNoHorizontalOverflow(page);
      const evidence = await measurePage(page, response, {
        ...routeCase,
        width,
      });
      assertBudgets(evidence);
      await writeEvidence(testInfo, evidence);
    });
  }

  test(`search initial/query ${width}px production 성능`, async ({
    page,
  }, testInfo) => {
    await preparePage(page, width);
    let indexRequests = 0;
    let indexBytes = 0;
    page.on('response', async response => {
      if (new URL(response.url()).pathname !== '/search-index.json') return;
      indexRequests += 1;
      indexBytes = (await response.body()).byteLength;
    });
    const response = await page.goto('/ko/search', {waitUntil: 'networkidle'});
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-site-search]')).toHaveAttribute(
      'data-search-index-state',
      'idle',
    );
    expect(indexRequests).toBe(0);
    await assertNoHorizontalOverflow(page);
    const initialEvidence = await measurePage(page, response, {
      id: 'search-initial',
      route: '/ko/search',
      state: 'idle',
      width,
      searchIndex: {bytes: 0, requests: 0},
    });
    assertBudgets(initialEvidence);
    await writeEvidence(testInfo, initialEvidence);

    const input = page.getByLabel(
      '상황, 법 이름, 조문이나 사건번호를 적어보세요',
    );
    await input.focus();
    await input.fill(selection.query);
    await expect(page.locator('[data-site-search]')).toHaveAttribute(
      'data-search-index-state',
      'ready',
    );
    await expect(page.locator('[data-search-result-id]').first()).toBeVisible();
    expect(indexRequests).toBe(1);
    expect(indexBytes).toBeLessThanOrEqual(performanceBudgets.searchIndexBytes);
    await input.fill(`${selection.query} `);
    await expect(page.locator('[data-search-result-id]').first()).toBeVisible();
    expect(indexRequests).toBe(1);
    await assertNoHorizontalOverflow(page);
    const queryEvidence = await measurePage(page, response, {
      id: 'search-query',
      route: '/ko/search',
      state: 'ready',
      width,
      searchIndex: {bytes: indexBytes, requests: indexRequests},
    });
    assertBudgets(queryEvidence);
    await writeEvidence(testInfo, queryEvidence);
  });
}

async function preparePage(page: Page, width: number) {
  await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
  await page.addInitScript(() => {
    const metrics = {
      cls: 0,
      largestContentfulPaint: 0,
      longTasks: [] as number[],
    };
    (window as typeof window & {__rulelinkPerformance: typeof metrics})
      .__rulelinkPerformance = metrics;
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          metrics.longTasks.push(entry.duration);
        }
      }).observe({buffered: true, type: 'longtask'});
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) metrics.cls += shift.value;
        }
      }).observe({buffered: true, type: 'layout-shift'});
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        metrics.largestContentfulPaint = entries.at(-1)?.startTime ?? 0;
      }).observe({buffered: true, type: 'largest-contentful-paint'});
    } catch {}
  });
}

async function measurePage(
  page: Page,
  response: import('@playwright/test').Response | null,
  context: {
    id: string;
    route: string;
    searchIndex?: {bytes: number; requests: number};
    state: string;
    width: number;
  },
) {
  await page.waitForTimeout(150);
  const runtime = await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType('paint');
    const metrics = (
      window as typeof window & {
        __rulelinkPerformance: {
          cls: number;
          largestContentfulPaint: number;
          longTasks: number[];
        };
      }
    ).__rulelinkPerformance;
    const transferred = (suffix: string) => entries
      .filter(entry => new URL(entry.name).pathname.endsWith(suffix))
      .reduce((sum, entry) => sum + entry.transferSize, 0);
    return {
      cls: metrics.cls,
      cssTransferredBytes: transferred('.css'),
      firstContentfulPaintMs: paints.find(item => (
        item.name === 'first-contentful-paint'
      ))?.startTime ?? 0,
      jsTransferredBytes: transferred('.js'),
      lcpApproxMs: metrics.largestContentfulPaint,
      longTaskCount: metrics.longTasks.length,
      longTaskDurationMs: metrics.longTasks.reduce(
        (sum, duration) => sum + duration,
        0,
      ),
      navigationTransferredBytes: navigation?.transferSize ?? 0,
      requestCount: entries.length + 1,
      totalTransferredBytes: (
        (navigation?.transferSize ?? 0)
        + entries.reduce((sum, entry) => sum + entry.transferSize, 0)
      ),
    };
  });
  return {
    schema: 'rulelink_public_performance_case_v1',
    generatedAt: new Date().toISOString(),
    runId: requiredEnvironment('RULELINK_PERFORMANCE_RUN_ID'),
    ...context,
    initialHtmlBytes: response ? (await response.body()).byteLength : 0,
    ...runtime,
  };
}

function assertBudgets(evidence: Awaited<ReturnType<typeof measurePage>>) {
  expect(evidence.initialHtmlBytes).toBeGreaterThan(0);
  expect(evidence.firstContentfulPaintMs).toBeGreaterThan(0);
  expect(evidence.lcpApproxMs).toBeGreaterThan(0);
  expect(evidence.initialHtmlBytes).toBeLessThanOrEqual(
    performanceBudgets.initialHtmlBytes,
  );
  expect(evidence.jsTransferredBytes).toBeLessThanOrEqual(
    performanceBudgets.jsTransferredBytes,
  );
  expect(evidence.cssTransferredBytes).toBeLessThanOrEqual(
    performanceBudgets.cssTransferredBytes,
  );
  expect(evidence.totalTransferredBytes).toBeLessThanOrEqual(
    performanceBudgets.totalTransferredBytes,
  );
  expect(evidence.requestCount).toBeLessThanOrEqual(
    performanceBudgets.requestCount,
  );
  expect(evidence.longTaskDurationMs).toBeLessThanOrEqual(
    performanceBudgets.longTaskDurationMs,
  );
  expect(evidence.cls).toBeLessThanOrEqual(performanceBudgets.cls);
  expect(evidence.lcpApproxMs).toBeLessThanOrEqual(
    performanceBudgets.lcpApproxMs,
  );
}

async function writeEvidence(
  testInfo: TestInfo,
  evidence: Awaited<ReturnType<typeof measurePage>>,
) {
  const root = path.join(
    requiredEnvironment('RULELINK_PERFORMANCE_EVIDENCE_ROOT'),
    'runs',
    requiredEnvironment('RULELINK_PERFORMANCE_RUN_ID'),
  );
  const filename = `${
    [evidence.id, evidence.state, evidence.width].join('-')
  }.json`;
  await import('node:fs/promises').then(({mkdir, writeFile}) => (
    mkdir(root, {recursive: true}).then(() => writeFile(
      path.join(root, filename),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    ))
  ));
  await testInfo.attach('performance-evidence', {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: 'application/json',
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경값이 필요합니다.`);
  return value;
}
