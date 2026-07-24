import {expect, test} from '@playwright/test';

const alternate = process.env.RULELINK_SITE_IDENTITY_MODE === 'alternate';
const expected = alternate
  ? {
      englishName: 'IdentitySwitch',
      name: '교체검증브랜드',
      operator: '교체검증운영자',
      origin: 'https://identity-switch.invalid',
    }
  : {
      englishName: 'RuleLink',
      name: 'RuleLink',
      operator: '리알레',
      origin: 'https://rulelink.lolphysical.xyz',
    };

test('브랜드·원점 설정이 화면과 검색엔진 표면에 일관되게 투영된다', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('header a').first()).toHaveText(expected.name);
  await expect(page.locator('footer strong')).toHaveText(expected.name);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', expected.origin);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', expected.name);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', expected.origin);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

  const structured = await page.locator('script[type="application/ld+json"]').first().textContent();
  const graph = JSON.parse(structured ?? '{}')['@graph'] as Record<string, unknown>[];
  expect(graph.find(item => item['@type'] === 'WebSite')).toMatchObject({
    alternateName: expected.englishName,
    name: expected.name,
    url: expected.origin,
  });
  expect(graph.find(item => item['@type'] === 'Organization')).toMatchObject({
    name: expected.operator,
    url: expected.origin,
  });

  await page.goto('/ko/method');
  await expect(page.locator('.methodHero .eyebrow')).toHaveText(`${expected.englishName} Method`);
  await expect(page).toHaveTitle(new RegExp(`콘텐츠 원칙 \\| ${escapeRegex(expected.name)}`));

  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe(expected.name);
  expect(manifest.short_name).toBe(expected.name);
  const robots = await (await page.request.get('/robots.txt')).text();
  expect(robots).toContain(`Sitemap: ${expected.origin}/sitemap.xml`);
  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  expect(sitemap).toContain(`<loc>${expected.origin}</loc>`);
  expect(sitemap).not.toContain(alternate
    ? 'https://rulelink.lolphysical.xyz'
    : 'https://identity-switch.invalid');
});

for (const width of [320, 390, 768, 1440]) {
  test(`${width}px에서 브랜드 교체 뒤 가로 넘침이 없다`, async ({page}) => {
    await page.setViewportSize({height: 900, width});
    await page.goto('/');
    const dimensions = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.locator('header a').first()).toHaveText(expected.name);
  });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
