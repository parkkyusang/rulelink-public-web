import {readFileSync} from 'node:fs';
import path from 'node:path';

import {expect, test} from '@playwright/test';

const bundle = JSON.parse(readFileSync(
  path.resolve(process.cwd(), 'content', 'bundle.json'),
  'utf8',
));
const expectedHubCount = bundle.knowledge.topic_hubs.length;
const widths = [320, 390, 768, 1440] as const;
const goldenQueries = [
  '집주인이 보증금을 안 줘요',
  '직장에서 괴롭힘 당했어요',
  '사장님이 월급을 안 줘요',
  '인터넷 쇼핑 환불',
  '보이스피싱 돈 돌려받기',
  '전 남편이 계속 연락해요',
  '학교에서 맞았어요',
  '월세를 세 번 밀렸어요',
  '상속 빚이 많아요',
] as const;

test('홈 상황별 디렉터리는 네 폭에서 7영역·전체 링크·검색·날짜 좌표를 보존한다', async ({
  page,
}) => {
  for (const width of widths) {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/', {waitUntil: 'networkidle'});
    const directory = page.locator('[data-knowledge-hub-directory]');
    await expect(directory).toHaveAttribute('data-enhanced', 'true');
    await expect(directory.locator('[data-hub-category]')).toHaveCount(7);
    await expect(directory.locator('a[data-hub-id]')).toHaveCount(
      expectedHubCount,
    );
    await expect(directory).not.toContainText(/핵심|인기|자주 찾는|주제 허브/u);
    await assertNoHorizontalOverflow(page);
    await assertDirectoryTextIsNotTruncated(directory);
  }

  const effectiveDates = await page.locator('[data-effective-date]').evaluateAll(
    elements => elements.map(element => ({
      coordinate: element.getAttribute('data-effective-date'),
      text: element.textContent?.replace(/\s+/g, ' ').trim(),
    })),
  );
  for (const item of effectiveDates) {
    const [year, month, day] = String(item.coordinate).split('-').map(Number);
    expect(item.text).toBe(`${year}년 ${month}월 ${day}일 시행`);
  }

  const input = page.getByLabel('상황별 주제 검색');
  await focusByKeyboard(page, '#knowledge-hub-search');
  await input.fill('보증금');
  await expect(page.getByText(/검색 결과 \d+개 · 전체 \d+개/u)).toBeVisible();
  const visibleLinks = page.locator('a[data-hub-id]:visible');
  await expect(visibleLinks).not.toHaveCount(0);
  expect(await visibleLinks.count()).toBeLessThan(expectedHubCount);
  await page.getByRole('button', {name: '상황별 주제 검색어 지우기'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('a[data-hub-id]:visible')).toHaveCount(
    expectedHubCount,
  );
});

test('자바스크립트가 없어도 홈의 28개 주제 링크는 초기 HTML에 남는다', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    locale: 'ko-KR',
    viewport: {width: 320, height: 1000},
  });
  const page = await context.newPage();
  await page.goto('/', {waitUntil: 'domcontentloaded'});
  const directory = page.locator('[data-knowledge-hub-directory]');
  await expect(directory).toHaveAttribute('data-enhanced', 'false');
  await expect(directory.locator('a[data-hub-id]')).toHaveCount(
    expectedHubCount,
  );
  await assertNoHorizontalOverflow(page);
  await context.close();
});

test('검색은 느린 전체 인덱스 중 0건을 확정하지 않고 준비 뒤 근거 있는 결과만 표시한다', async ({
  page,
}) => {
  const indexResponses: Array<{bytes: number; status: number}> = [];
  await page.route('**/search-index.json', async route => {
    await new Promise(resolve => setTimeout(resolve, 1_000));
    await route.continue();
  });
  page.on('response', async response => {
    if (new URL(response.url()).pathname !== '/search-index.json') return;
    indexResponses.push({
      bytes: (await response.body()).byteLength,
      status: response.status(),
    });
  });

  await page.setViewportSize({width: 390, height: 1000});
  const searchResponse = await page.goto('/ko/search', {waitUntil: 'networkidle'});
  expect(searchResponse).not.toBeNull();
  expect((await searchResponse!.body()).byteLength).toBeLessThanOrEqual(150_000);
  await expect(page.locator('[data-site-search]')).toHaveAttribute(
    'data-search-index-state',
    'idle',
  );
  await expect(page.locator('[data-search-result-id]')).toHaveCount(24);
  expect(indexResponses).toEqual([]);

  const input = page.getByLabel(
    '상황, 법 이름, 조문이나 사건번호를 적어보세요',
  );
  await input.focus();
  await input.fill('집주인이 보증금을 안 줘요');
  await expect(page.locator('[data-site-search]')).toHaveAttribute(
    'data-search-index-state',
    'loading',
  );
  await expect(page.getByText('전체 검색 인덱스를 불러오는 중입니다.')).toBeVisible();
  await expect(page.locator('[data-search-empty]')).toHaveCount(0);
  await expect(page.locator('[data-site-search]')).toHaveAttribute(
    'data-search-index-state',
    'ready',
  );
  expect(indexResponses).toHaveLength(1);
  expect(indexResponses[0].status).toBe(200);
  expect(indexResponses[0].bytes).toBeLessThanOrEqual(400_000);

  for (const query of goldenQueries) {
    await input.fill(query);
    const firstResult = page.locator('[data-search-result-id]').first();
    await expect(firstResult).toBeVisible();
    await expect(firstResult).toHaveAttribute('data-search-result-kind', 'knowledge');
    await expect(firstResult.locator('[data-match-reasons]')).toBeVisible();
  }

  await input.fill('세 번');
  await expect(page.locator('[data-search-result-id]')).toHaveCount(0);
  await expect(page.locator('[data-search-empty]')).toBeVisible();
  await expect(page.getByText('찾은 법률정보 0개')).toBeVisible();

  await input.fill('');
  await input.focus();
  await page.keyboard.press('Tab');
  const allFilter = page.getByRole('button', {name: /^전체/u});
  await expect(allFilter).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(allFilter).toHaveAttribute('aria-pressed', 'true');
});

test('검색·허브 세로 경로·상세 연결 독해는 네 폭에서 의미 경계와 무횡스크롤을 지킨다', async ({
  page,
}) => {
  for (const width of widths) {
    await page.setViewportSize({width, height: 1000});

    await page.goto('/ko/search', {waitUntil: 'networkidle'});
    await assertNoHorizontalOverflow(page);
    const resultColumns = await page.locator('#site-search-result-grid').evaluate(
      element => getComputedStyle(element).gridTemplateColumns
        .split(' ')
        .filter(Boolean).length,
    );
    expect(resultColumns).toBe(width <= 720 ? 1 : 2);

    await page.goto('/ko/hubs/debt-enforcement', {waitUntil: 'networkidle'});
    await expect(page.locator('[data-hub-journey]')).toBeVisible();
    await expect(page.locator('[data-hub-stage="judgment"]').first()).toBeVisible();
    await expect(page.locator('[data-hub-stage="evidence"]').first()).toBeVisible();
    await expect(page.locator('[data-hub-stage="action"]').first()).toBeVisible();
    await expect(page.locator('[data-hub-connection="typed"]').first()).toBeVisible();
    await expect(page.locator('[data-hub-connection="legacy"]').first()).toContainText(
      '함께 확인할 주제',
    );
    await assertNoHorizontalOverflow(page);

    await page.goto(
      '/ko/knowledge/legal-heir-order-and-spouse',
      {waitUntil: 'networkidle'},
    );
    await expect(
      page.locator('[data-reading-section][data-typed="true"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-reading-section="same_topic"][data-typed="false"]'),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
  }
});

async function assertNoHorizontalOverflow(
  page: import('@playwright/test').Page,
) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.clientWidth,
  );
}

async function assertDirectoryTextIsNotTruncated(
  directory: import('@playwright/test').Locator,
) {
  const violations = await directory.locator('a[data-hub-id] strong, a[data-hub-id] p')
    .evaluateAll(elements => elements.flatMap(element => {
      const style = getComputedStyle(element);
      const clipped = (
        style.textOverflow === 'ellipsis'
        || style.whiteSpace === 'nowrap'
        || element.scrollHeight > element.clientHeight + 1
      );
      return clipped ? [element.textContent?.trim() ?? ''] : [];
    }));
  expect(violations).toEqual([]);
}

async function focusByKeyboard(
  page: import('@playwright/test').Page,
  selector: string,
) {
  await page.locator('body').click({position: {x: 1, y: 1}});
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate(
      element => element === document.activeElement,
    )) return;
  }
  throw new Error(`키보드 Tab으로 ${selector}에 도달하지 못했습니다.`);
}
