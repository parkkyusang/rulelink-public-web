import {expect, test, type Page} from '@playwright/test';

const widths = [320, 390, 768, 1440] as const;
const routes = [
  {id: 'trust', path: '/ko/trust'},
  {
    id: 'knowledge',
    path: '/ko/knowledge/legal-heir-order-and-spouse',
  },
] as const;

for (const route of routes) {
  for (const width of widths) {
    test(`${route.id} ${width}px에서 가로 넘침이 없다`, async ({page}) => {
      await page.setViewportSize({height: 1000, width});
      await page.goto(route.path, {waitUntil: 'networkidle'});
      const layout = await measureLayout(page);
      expect(layout.bodyScrollWidth).toBeLessThanOrEqual(width + 1);
      expect(layout.documentScrollWidth).toBeLessThanOrEqual(width + 1);
      expect(layout.outsideViewport, JSON.stringify(layout, null, 2)).toEqual(
        [],
      );
    });
  }
}

test('신뢰 페이지가 실제 운영 필드와 다섯 운영 원칙을 노출한다', async ({
  page,
}) => {
  await page.goto('/ko/trust', {waitUntil: 'networkidle'});
  await expect(page.getByRole('heading', {
    level: 1,
    name: /무엇을 근거로 만들고/,
  })).toBeVisible();
  for (const heading of [
    '운영·콘텐츠 제작',
    '자동화·AI 사용 범위',
    '출처·최신성',
    '수정·이의제기',
  ]) {
    await expect(page.getByRole('heading', {name: heading})).toBeVisible();
  }
  await expect(page.getByRole('heading', {
    name: /광고는 법률정보·공식근거/,
  })).toBeVisible();
  await expect(page.getByText('브라우저 시험용 운영 법인')).toBeVisible();
  const contact = page.getByRole('link', {
    name: '브라우저 시험용 오류 제보',
  });
  await contact.focus();
  await expect(contact).toBeFocused();
  await expect(contact).toHaveAttribute(
    'href',
    'mailto:trust-fixture@example.test',
  );
});

test('편집자 표지와 Article·Breadcrumb·Organization 투영이 일치한다', async ({
  page,
}) => {
  await page.goto(
    '/ko/knowledge/legal-heir-order-and-spouse',
    {waitUntil: 'networkidle'},
  );
  const attribution = page.locator('[data-editorial-attribution]');
  await expect(attribution).toHaveCount(1);
  await expect(attribution).toContainText('브라우저 시험용 편집 조직');
  await expect(attribution).toContainText('브라우저 시험용 법률 검토자');
  await expect(attribution).toContainText('시험 fixture 자격');
  await expect(attribution).toContainText('상속');
  await expect(attribution.getByRole('link', {
    name: /콘텐츠 제작·검토 원칙/,
  })).toHaveAttribute('href', '/ko/trust');

  const graphTypes = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll(scripts => scripts.flatMap(script => {
      const value = JSON.parse(script.textContent ?? '{}');
      return Array.isArray(value['@graph'])
        ? value['@graph'].map((item: {'@type'?: string}) => item['@type'])
        : [value['@type']];
    }));
  expect(graphTypes).toContain('Article');
  expect(graphTypes).toContain('BreadcrumbList');
  expect(graphTypes).toContain('Organization');
});

test('광고 준비 영역은 행동 안내 뒤·관련 읽기 뒤에만 있고 상호작용을 위장하지 않는다', async ({
  page,
}) => {
  await page.setViewportSize({height: 1000, width: 320});
  await page.goto(
    '/ko/knowledge/legal-heir-order-and-spouse',
    {waitUntil: 'networkidle'},
  );
  const ads = page.locator('[data-ad-placeholder]');
  await expect(ads).toHaveCount(2);
  await expect(ads.nth(0)).toHaveAttribute(
    'data-ad-placement',
    'knowledge-after-actions',
  );
  await expect(ads.nth(1)).toHaveAttribute(
    'data-ad-placement',
    'knowledge-after-related-reading',
  );
  await expect(ads.nth(0)).toContainText('광고');
  const boundary = await page.evaluate(() => {
    const actions = document.querySelector<HTMLElement>('#actions')!;
    const firstAd = document.querySelector<HTMLElement>(
      '[data-ad-placeholder]',
    )!;
    return {
      actionsBottom: actions.offsetTop + actions.offsetHeight,
      adTop: firstAd.offsetTop,
      firstViewportHeight: window.innerHeight,
      forbiddenAncestors: [
        '.knowledgeHero',
        '#actions',
        '#sources',
        '[data-authority-reading-root]',
      ].filter(selector => firstAd.closest(selector)),
      interactiveChildren: firstAd.querySelectorAll(
        'a, button, input, iframe, script',
      ).length,
    };
  });
  expect(boundary.adTop).toBeGreaterThanOrEqual(boundary.actionsBottom);
  expect(boundary.adTop).toBeGreaterThan(boundary.firstViewportHeight);
  expect(boundary.forbiddenAncestors).toEqual([]);
  expect(boundary.interactiveChildren).toBe(0);
});

async function measureLayout(page: Page) {
  return page.evaluate(() => {
    const outsideViewport = [...document.querySelectorAll<HTMLElement>(
      'main, main *',
    )]
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          key:
            element.id
            || element.getAttribute('data-ad-placement')
            || element.getAttribute('data-editorial-attribution')
            || element.tagName.toLowerCase(),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter(item => item.left < -1 || item.right > window.innerWidth + 1);
    return {
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      outsideViewport,
    };
  });
}
