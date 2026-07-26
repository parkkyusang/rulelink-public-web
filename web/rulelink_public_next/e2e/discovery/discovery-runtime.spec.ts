import {readFileSync} from 'node:fs';
import path from 'node:path';

import {expect, test} from '@playwright/test';

const bundle = JSON.parse(readFileSync(
  path.resolve(process.cwd(), 'content', 'bundle.json'),
  'utf8',
));
const sourceTextLibrary = JSON.parse(readFileSync(
  path.resolve(process.cwd(), 'content', 'source-text-library.json'),
  'utf8',
));
type ScenarioFixture = {
  question_ko: string;
  scenario_id: string;
  when_false_ko: string;
  when_true_ko: string;
};
type ScenarioEntryFixture = {
  content_id: string;
  scenario_ids: string[];
  search_intents_ko: string[];
  slug: string;
};
const expectedHubCount = bundle.knowledge.topic_hubs.length;
const verifiedSourceIds = new Set<string>(
  sourceTextLibrary.bindings.map((binding: {coordinate_id: string}) => (
    binding.coordinate_id
  )),
);
const linkOnlySourceIds = new Set<string>(
  sourceTextLibrary.unresolved.map((item: {coordinate_id: string}) => (
    item.coordinate_id
  )),
);
const verifiedTextEntry = bundle.knowledge.content_entries.find(
  (entry: ScenarioEntryFixture & {source_coordinate_ids: string[]}) => (
    entry.source_coordinate_ids.some(id => verifiedSourceIds.has(id))
  ),
) as ScenarioEntryFixture | undefined;
const linkOnlyEntry = bundle.knowledge.content_entries.find(
  (entry: ScenarioEntryFixture & {source_coordinate_ids: string[]}) => (
    entry.source_coordinate_ids.some(id => linkOnlySourceIds.has(id))
  ),
) as ScenarioEntryFixture | undefined;
const scenarioById = new Map<string, ScenarioFixture>(
  bundle.knowledge.scenario_branches.map((scenario: ScenarioFixture) => [
    scenario.scenario_id,
    scenario,
  ] as const),
);
const scenarioEntry = bundle.knowledge.content_entries.find(
  (entry: ScenarioEntryFixture) => (
    entry.scenario_ids.filter(scenarioId => scenarioById.has(scenarioId)).length > 1
  ),
) as ScenarioEntryFixture | undefined;
const scenarioFixture = scenarioEntry
  ? scenarioById.get([...scenarioEntry.scenario_ids].reverse().find(
    (scenarioId: string) => scenarioById.has(scenarioId),
  ) ?? '')
  : undefined;
const widths = [320, 390, 768, 1440] as const;
const directoryQueries = [
  '보이스피싱',
  '보증금 반환',
  '직장 내 괴롭힘',
] as const;
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

  for (const width of widths) {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/', {waitUntil: 'networkidle'});
    const input = page.getByRole('searchbox', {
      name: '상황별 주제 검색',
      exact: true,
    });
    await focusByKeyboard(page, '#knowledge-hub-search');

    for (const query of directoryQueries) {
      await input.fill(query);
      await assertDirectoryFilterState(page, expectedHubCount);
      const clear = page.getByRole('button', {
        name: '상황별 주제 검색어 지우기',
      });
      await clear.focus();
      await page.keyboard.press('Tab');
      const focusedLink = page.locator('a[data-hub-id]:focus');
      await expect(focusedLink).toHaveCount(1);
      await expect(focusedLink).not.toHaveAttribute('hidden', '');
    }

    await input.fill('결과가 존재하지 않는 임의 검색어');
    await expect(page.getByText('맞는 주제를 찾지 못했습니다.')).toBeVisible();
    await expect(page.locator('a[data-hub-id]:visible')).toHaveCount(0);
    await expect(page.locator('[data-hub-category]:visible')).toHaveCount(0);
    await assertHiddenDirectoryItemsHaveNoLayout(page);

    const clear = page.getByRole('button', {
      name: '상황별 주제 검색어 지우기',
    });
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('a[data-hub-id]:visible')).toHaveCount(
      expectedHubCount,
    );
    await expect(page.locator('a[data-hub-id][hidden]')).toHaveCount(0);
    await expect(page.locator('[data-hub-category]:visible')).toHaveCount(7);
  }
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

test('후속 상황 질문도 네 폭에서 검색 카드와 상세 사실분기로 이어진다', async ({
  browser,
  page,
}) => {
  if (!scenarioEntry || !scenarioFixture) {
    throw new Error('시나리오가 연결된 공개 지식 fixture가 필요합니다.');
  }
  const situationQuery = scenarioFixture.question_ko;
  for (const width of widths) {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/', {waitUntil: 'networkidle'});
    await page.locator('#home-situation-search').fill(situationQuery);
    await page.getByRole('button', {name: '관련 질문 찾기'}).click();
    await expect(page).toHaveURL(/\/ko\/search\?q=/u);
    await expect(page.locator('[data-site-search]')).toHaveAttribute(
      'data-search-index-state',
      'ready',
    );
    const targetResult = page.locator(
      `[data-search-result-id="${scenarioEntry.content_id}"]`,
    );
    await expect(targetResult).toBeVisible();
    await expect(targetResult.locator('[data-decision-question]')).toContainText(
      situationQuery,
    );
    await expect(targetResult.locator('[data-match-reasons]')).toContainText(
      '판단 질문',
    );
    await expect(targetResult).toHaveAttribute(
      'href',
      `/ko/knowledge/${scenarioEntry.slug}#scenario-${scenarioFixture.scenario_id}`,
    );
    await assertNoHorizontalOverflow(page);

    await targetResult.click();
    await expect(page).toHaveURL(
      new RegExp(
        `/ko/knowledge/${scenarioEntry.slug}#scenario-${scenarioFixture.scenario_id}$`,
        'u',
      ),
    );
    const decision = page.locator(
      `[data-scenario-id="${scenarioFixture.scenario_id}"]`,
    );
    await expect(decision).toHaveAttribute('data-enhanced', 'true');
    await expect(decision.locator('xpath=ancestor::article[1]')).toBeFocused();
    await expect(decision).toContainText(situationQuery);
    await decision.getByRole('button', {name: '예', exact: true}).click();
    await expect(decision.locator('[data-selected-outcome="true"]')).toContainText(
      scenarioFixture.when_true_ko,
    );
    await decision.getByRole('button', {name: '아니오', exact: true}).click();
    await expect(decision.locator('[data-selected-outcome="false"]')).toContainText(
      scenarioFixture.when_false_ko,
    );
    await decision.getByRole('button', {name: '모르겠음', exact: true}).click();
    await expect(decision.locator('[data-selected-outcome="unknown"]')).toContainText(
      '어느 결과가 적용되는지 단정할 수 없습니다',
    );
    await expect(page.locator('[data-follow-up-questions]')).toContainText(
      scenarioFixture.question_ko,
    );
    const scenarioStorageKeys = await page.evaluate(() => (
      Object.keys(localStorage).filter(key => key.startsWith('rulelink-scenario-'))
    ));
    expect(scenarioStorageKeys).toEqual([]);
    await expect(page.locator('#sources')).toBeVisible();
    await expect(page.locator('[data-source-evidence] details').first()).toBeVisible();
    await expect(page.locator('#actions')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    const noScriptContext = await browser.newContext({
      javaScriptEnabled: false,
      locale: 'ko-KR',
      viewport: {width, height: 1000},
    });
    const noScriptPage = await noScriptContext.newPage();
    await noScriptPage.goto(`/ko/knowledge/${scenarioEntry.slug}`, {
      waitUntil: 'domcontentloaded',
    });
    const noScriptDecision = noScriptPage.locator(
      `[data-scenario-id="${scenarioFixture.scenario_id}"]`,
    );
    await expect(noScriptDecision).toHaveAttribute('data-enhanced', 'false');
    await expect(noScriptDecision).toContainText(scenarioFixture.when_true_ko);
    await expect(noScriptDecision).toContainText(scenarioFixture.when_false_ko);
    await assertNoHorizontalOverflow(noScriptPage);
    await noScriptContext.close();
  }
});

test('검색은 느린 전체 인덱스 중 0건을 확정하지 않고 준비 뒤 근거 있는 결과만 표시한다', async ({
  page,
}) => {
  const indexResponses: Array<{bytes: number; status: number}> = [];
  await page.route('**/search-index.v2.json', async route => {
    await new Promise(resolve => setTimeout(resolve, 1_000));
    await route.continue();
  });
  page.on('response', async response => {
    if (new URL(response.url()).pathname !== '/search-index.v2.json') return;
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
  expect(indexResponses[0].bytes).toBeLessThanOrEqual(420_000);

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
  const exampleButtons = page.getByLabel('검색 예시').getByRole('button');
  const exampleCount = await exampleButtons.count();
  expect(exampleCount).toBeGreaterThan(0);
  for (let index = 0; index < exampleCount; index += 1) {
    await page.keyboard.press('Tab');
    await expect(exampleButtons.nth(index)).toBeFocused();
  }
  await page.keyboard.press('Tab');
  const allFilter = page.getByRole('button', {name: /^전체/u});
  await expect(allFilter).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(allFilter).toHaveAttribute('aria-pressed', 'true');
});

test('버전별 검색 인덱스는 구·신 클라이언트의 교차 배포 캐시를 분리한다', async ({
  page,
  request,
}) => {
  const legacyResponse = await request.get('/search-index.json');
  expect(legacyResponse.ok()).toBe(true);
  const legacyPayload = await legacyResponse.json();
  expect(legacyPayload.schema).toBe('rulelink_public_search_index_v1');
  expect(Array.isArray(legacyPayload.documents)).toBe(true);

  const v2Response = await request.get('/search-index.v2.json');
  expect(v2Response.ok()).toBe(true);
  const v2Payload = await v2Response.json();
  expect(v2Payload.schema).toBe('rulelink_public_search_index_v2');

  const requests = {legacy: 0, v2: 0};
  page.on('request', requestEvent => {
    const pathname = new URL(requestEvent.url()).pathname;
    if (pathname === '/search-index.json') requests.legacy += 1;
    if (pathname === '/search-index.v2.json') requests.v2 += 1;
  });
  await page.goto('/ko/search', {waitUntil: 'networkidle'});
  await expect(page.locator('[data-search-result-id]')).toHaveCount(24);
  expect(requests).toEqual({legacy: 0, v2: 0});

  await page.getByLabel(
    '상황, 법 이름, 조문이나 사건번호를 적어보세요',
  ).fill('보증금 반환');
  await expect(page.locator('[data-site-search]')).toHaveAttribute(
    'data-search-index-state',
    'ready',
  );
  expect(requests).toEqual({legacy: 0, v2: 1});
});

test('신 클라이언트는 v2 URL의 구 스키마를 한 번만 요청하고 fail-closed 한다', async ({
  page,
  request,
}) => {
  const legacyPayload = await (await request.get('/search-index.json')).json();
  let requestCount = 0;
  await page.route('**/search-index.v2.json', async route => {
    requestCount += 1;
    await route.fulfill({json: legacyPayload, status: 200});
  });
  await page.goto('/ko/search', {waitUntil: 'networkidle'});
  const input = page.getByLabel(
    '상황, 법 이름, 조문이나 사건번호를 적어보세요',
  );
  await input.fill('보증금 반환');
  await expect(page.locator('[data-site-search]')).toHaveAttribute(
    'data-search-index-state',
    'error',
  );
  expect(requestCount).toBe(1);
  await input.fill('보증금 반환 신청');
  await expect(page.locator('[data-site-search]')).toHaveAttribute(
    'data-search-index-state',
    'error',
  );
  expect(requestCount).toBe(1);
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

test('상세의 모든 공식 근거는 확인한 문언 또는 공식 원문 연결 상태를 명확히 표시한다', async ({
  page,
}) => {
  if (!verifiedTextEntry || !linkOnlyEntry) {
    throw new Error('문언 표시와 공식 원문 연결 상태를 가진 공개 지식 fixture가 필요합니다.');
  }
  for (const width of [390, 1440] as const) {
    await page.setViewportSize({width, height: 1000});
    await page.goto(`/ko/knowledge/${verifiedTextEntry.slug}`, {
      waitUntil: 'networkidle',
    });
    await expect(page.getByRole('heading', {
      name: '이 글의 판단에 사용한 법령과 공식 자료입니다.',
    })).toBeVisible();
    const verified = page.locator('[data-source-text-state="verified_text"]');
    await expect(page.locator('[data-source-evidence] details[open]')).toHaveCount(0);
    await expect(verified.first()).toBeHidden();
    await verified.first().locator('xpath=ancestor::article[1]/details/summary').click();
    await expect(verified.first()).toBeVisible();
    await expect(verified.first()).toContainText('확인한 조문 문언');
    await expect(verified.first().locator('p')).not.toBeEmpty();
    await assertEverySourceHasOneDisplayState(page);
    await assertNoHorizontalOverflow(page);

    await page.goto(`/ko/knowledge/${linkOnlyEntry.slug}`, {
      waitUntil: 'networkidle',
    });
    const linkOnly = page.locator('[data-source-text-state="link_only"]');
    await expect(page.locator('[data-source-evidence] details[open]')).toHaveCount(0);
    await expect(linkOnly.first()).toBeHidden();
    await linkOnly.first().locator('xpath=ancestor::article[1]/details/summary').click();
    await expect(linkOnly.first()).toBeVisible();
    await expect(linkOnly.first()).toContainText('공식 원문에서 확인');
    await expect(linkOnly.first()).toContainText(
      '아래 공식 사이트에서 확인할 수 있습니다.',
    );
    await assertEverySourceHasOneDisplayState(page);
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

async function assertDirectoryFilterState(
  page: import('@playwright/test').Page,
  totalCount: number,
) {
  const resultCount = page.locator('[aria-live="polite"]');
  await expect(resultCount).toContainText(
    new RegExp(`검색 결과 \\d+개 · 전체 ${totalCount}개`, 'u'),
  );
  const reportedCount = Number(
    (await resultCount.textContent())?.match(/검색 결과 (\d+)개/u)?.[1],
  );
  expect(reportedCount).toBeGreaterThan(0);
  expect(reportedCount).toBeLessThan(totalCount);

  const visibleLinks = page.locator('a[data-hub-id]:visible');
  const unhiddenLinks = page.locator('a[data-hub-id]:not([hidden])');
  await expect(visibleLinks).toHaveCount(reportedCount);
  await expect(unhiddenLinks).toHaveCount(reportedCount);
  await assertHiddenDirectoryItemsHaveNoLayout(page);
}

async function assertHiddenDirectoryItemsHaveNoLayout(
  page: import('@playwright/test').Page,
) {
  const violations = await page
    .locator('[data-hub-category][hidden], a[data-hub-id][hidden]')
    .evaluateAll(elements => elements.flatMap(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        style.display !== 'none'
        || rect.width !== 0
        || rect.height !== 0
      ) ? [{
          display: style.display,
          height: rect.height,
          id: element.getAttribute('data-hub-category')
            ?? element.getAttribute('data-hub-id'),
          width: rect.width,
        }] : [];
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

async function assertEverySourceHasOneDisplayState(
  page: import('@playwright/test').Page,
) {
  const cards = page.locator('[data-source-evidence] article');
  const states = page.locator(
    '[data-source-evidence] [data-source-text-state="verified_text"], '
    + '[data-source-evidence] [data-source-text-state="link_only"]',
  );
  await expect(states).toHaveCount(await cards.count());
}
