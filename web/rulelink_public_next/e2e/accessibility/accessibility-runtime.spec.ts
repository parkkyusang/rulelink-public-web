import {expect, test, type Page} from '@playwright/test';

import {
  assertNoHorizontalOverflow,
  auditWcag,
} from './support/wcag-evidence';

const mode = process.env.RULELINK_ACCESSIBILITY_MODE ?? 'default';
const widths = [320, 390, 768, 1440] as const;
const defaultRoutes = [
  {id: 'home', route: '/'},
  {id: 'search-empty-query', route: '/ko/search'},
  {id: 'hub', route: '/ko/hubs/debt-enforcement'},
  {
    id: 'knowledge-typed',
    route: '/ko/knowledge/legal-heir-order-and-spouse',
  },
  {
    id: 'knowledge-fallback',
    route: '/ko/knowledge/administrative-appeal-appointed-representative-documents-change',
  },
  {
    id: 'change-detail',
    route: '/ko/changes/administrative-appeals-state-representative-documents',
  },
] as const;

test.describe('default public build', () => {
  test.skip(mode !== 'default', '기본 공개 build 전용');

  for (const routeCase of defaultRoutes) {
    for (const width of widths) {
      test(`${routeCase.id} ${width}px WCAG A/AA`, async ({page}, testInfo) => {
        await page.setViewportSize({height: 1000, width});
        const response = await page.goto(
          routeCase.route,
          {waitUntil: 'networkidle'},
        );
        expect(response?.status()).toBe(200);
        await assertPageStructure(page);
        if (routeCase.id === 'home') {
          await expect(page.getByRole('link', {name: '운영·신뢰'}))
            .toHaveCount(0);
        }
        if (routeCase.id === 'knowledge-typed') {
          await expect(page.locator('[data-authority-reading-root]'))
            .toHaveCount(0);
          await expect(page.locator('a[href^="/ko/authorities/"]'))
            .toHaveCount(0);
        }
        await assertNoHorizontalOverflow(page);
        await auditWcag(page, testInfo, {
          id: routeCase.id,
          mode,
          route: routeCase.route,
          state: 'ready',
          width,
        });
      });
    }
  }

  for (const width of widths) {
    test(`search states ${width}px WCAG A/AA`, async ({page}, testInfo) => {
      await page.setViewportSize({height: 1000, width});
      let releaseIndex = () => {};
      const indexGate = new Promise<void>(resolve => {
        releaseIndex = resolve;
      });
      await page.route('**/search-index.json', async route => {
        await indexGate;
        await route.continue();
      });
      await page.goto('/ko/search', {waitUntil: 'domcontentloaded'});
      const input = page.getByLabel(
        '상황, 법 이름, 조문이나 사건번호를 적어보세요',
      );
      await input.focus();
      await input.fill('집주인이 보증금을 안 줘요');
      await expect(page.locator('[data-site-search]')).toHaveAttribute(
        'data-search-index-state',
        'loading',
      );
      await expect(
        page.getByText('전체 검색 인덱스를 불러오는 중입니다.'),
      ).toBeVisible();
      await expect(page.locator('[aria-live="polite"]')).toContainText(
        '전체 검색 인덱스를 불러오는 중입니다.',
      );
      await auditWcag(page, testInfo, {
        id: 'search-loading',
        mode,
        route: '/ko/search',
        state: 'loading',
        width,
      });

      releaseIndex();
      await expect(page.locator('[data-site-search]')).toHaveAttribute(
        'data-search-index-state',
        'ready',
      );
      await expect(page.locator('[data-search-result-id]').first()).toBeVisible();
      await auditWcag(page, testInfo, {
        id: 'search-query',
        mode,
        route: '/ko/search?q=집주인이%20보증금을%20안%20줘요',
        state: 'query',
        width,
      });

      await input.fill('존재하지않는법률정보검색어');
      await expect(page.locator('[data-search-empty]')).toBeVisible();
      await expect(page.getByText('찾은 법률정보 0개')).toBeVisible();
      await expect(page.locator('[aria-live="polite"]')).toContainText(
        '찾은 법률정보 0개',
      );
      await auditWcag(page, testInfo, {
        id: 'search-zero',
        mode,
        route: '/ko/search?q=존재하지않는법률정보검색어',
        state: 'zero',
        width,
      });
    });
  }

  test('키보드로 본문 바로가기·검색·필터를 완주하고 초점이 보인다', async ({
    page,
  }) => {
    await page.setViewportSize({height: 1000, width: 390});
    await page.goto('/ko/search', {waitUntil: 'networkidle'});
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', {name: '본문 바로가기'});
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await assertVisibleFocus(skipLink);
    await page.keyboard.press('Tab');
    const brand = page.locator('header a[href="/"]').first();
    await expect(brand).toBeFocused();
    await assertVisibleFocus(brand);
    await page.keyboard.press('Shift+Tab');
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await focusByTab(page, '#site-search');
    await assertVisibleFocus(page.locator('#site-search'));
    await page.keyboard.press('Tab');
    const allFilter = page.getByRole('button', {name: /^전체/u});
    await expect(allFilter).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(allFilter).toHaveAttribute('aria-pressed', 'true');
  });

  test('trust off는 공개 메뉴·정본 경로를 만들지 않고 404도 접근 가능하다', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({height: 1000, width: 390});
    await page.goto('/', {waitUntil: 'networkidle'});
    await expect(page.getByRole('link', {name: '운영·신뢰'})).toHaveCount(0);
    const response = await page.goto('/ko/trust', {waitUntil: 'networkidle'});
    expect(response?.status()).toBe(404);
    await auditWcag(page, testInfo, {
      id: 'trust-off-404',
      mode,
      route: '/ko/trust',
      state: 'disabled',
      width: 390,
    });
  });

  test('authority zero-state는 기존 상세 구조를 보존한다', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({height: 1000, width: 390});
    const route = '/ko/knowledge/legal-heir-order-and-spouse';
    await page.goto(route, {waitUntil: 'networkidle'});
    await expect(page.locator('[data-authority-reading-root]')).toHaveCount(0);
    await expect(page.locator('a[href^="/ko/authorities/"]')).toHaveCount(0);
    await auditWcag(page, testInfo, {
      id: 'authority-zero-state',
      mode,
      route,
      state: 'zero',
      width: 390,
    });
  });
});

test.describe('trust on', () => {
  test.skip(mode !== 'trust', '신뢰 fixture build 전용');
  for (const routeCase of [
    {id: 'trust-on', route: '/ko/trust'},
    {
      id: 'trust-editorial-knowledge',
      route: '/ko/knowledge/legal-heir-order-and-spouse',
    },
  ] as const) {
    for (const width of widths) {
      test(`${routeCase.id} ${width}px WCAG A/AA`, async ({page}, testInfo) => {
        await page.setViewportSize({height: 1000, width});
        await page.goto(routeCase.route, {waitUntil: 'networkidle'});
        await assertPageStructure(page);
        await assertNoHorizontalOverflow(page);
        await auditWcag(page, testInfo, {
          id: routeCase.id,
          mode,
          route: routeCase.route,
          state: 'ready',
          width,
        });
      });
    }
  }
});

test.describe('native authority details', () => {
  test.skip(mode !== 'authority', 'authority fixture build 전용');
  for (const width of widths) {
    test(`authority details ${width}px WCAG A/AA`, async ({page}, testInfo) => {
      const route = '/ko/authorities/test-law/0025';
      await page.setViewportSize({height: 1000, width});
      await page.goto(route, {waitUntil: 'networkidle'});
      const details = page.locator('details').first();
      const summary = details.locator(':scope > summary');
      await expect(details).toHaveAttribute('open', '');
      await summary.focus();
      await assertVisibleFocus(summary);
      await page.keyboard.press('Enter');
      await expect(details).not.toHaveAttribute('open', '');
      await page.keyboard.press('Tab');
      const focusedInsideClosedDetails = await details.evaluate(
        element => element.contains(document.activeElement),
      );
      expect(focusedInsideClosedDetails).toBe(false);
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await page.keyboard.press('Enter');
      await expect(details).not.toHaveAttribute('open', '');
      await auditWcag(page, testInfo, {
        id: 'authority-native-details',
        mode,
        route,
        state: 'closed',
        width,
      });
    });
  }
});

async function assertPageStructure(page: Page) {
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  const navigationNames = await page.locator('nav').evaluateAll(
    elements => elements.map(element => (
      element.getAttribute('aria-label')
      ?? element.getAttribute('aria-labelledby')
      ?? ''
    ).trim()),
  );
  expect(navigationNames.every(Boolean), navigationNames.join(', ')).toBe(true);
  expect(new Set(navigationNames).size).toBe(navigationNames.length);
  const headingLevels = await page.locator('main h1, main h2, main h3, main h4')
    .evaluateAll(headings => headings.map(item => Number(item.tagName.slice(1))));
  expect(headingLevels[0]).toBe(1);
  for (let index = 1; index < headingLevels.length; index += 1) {
    expect(headingLevels[index] - headingLevels[index - 1])
      .toBeLessThanOrEqual(1);
  }
}

async function assertVisibleFocus(locator: import('@playwright/test').Locator) {
  const focus = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      visible: rect.width > 0 && rect.height > 0,
    };
  });
  expect(focus.visible).toBe(true);
  expect(
    focus.outlineStyle !== 'none' && focus.outlineWidth !== '0px'
      || focus.boxShadow !== 'none',
    JSON.stringify(focus),
  ).toBe(true);
}

async function focusByTab(page: Page, selector: string) {
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate(
      element => element === document.activeElement,
    )) return;
  }
  throw new Error(`Tab으로 ${selector}에 도달하지 못했습니다.`);
}
