import {expect, test} from '@playwright/test';

const alternate = process.env.RULELINK_SITE_IDENTITY_MODE === 'alternate';
const expected = alternate
  ? {
      englishName: 'IdentitySwitch',
      legalOperator: '교체검증 법적 운영자',
      name: '교체검증브랜드',
      operator: '교체검증운영자',
      origin: 'https://identity-switch.lolphysical.xyz',
    }
  : {
      englishName: 'RuleLink',
      legalOperator: null,
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
  const structuredData = JSON.parse(structured ?? '{}') as Record<string, unknown>;
  if (alternate) {
    const graph = structuredData['@graph'] as Record<string, unknown>[];
    expect(graph.find(item => item['@type'] === 'WebSite')).toMatchObject({
      alternateName: expected.englishName,
      name: expected.name,
      publisher: {'@id': `${expected.origin}/#organization`},
      url: expected.origin,
    });
    expect(graph.find(item => item['@type'] === 'Organization')).toMatchObject({
      name: expected.legalOperator,
      url: expected.origin,
    });
  } else {
    expect(structuredData).toMatchObject({
      '@type': 'WebSite',
      name: expected.name,
      url: expected.origin,
    });
    expect(structuredData).not.toHaveProperty('@graph');
    expect(structuredData).not.toHaveProperty('publisher');
    expect(structuredData).not.toHaveProperty('alternateName');
  }

  await page.goto('/ko/method');
  await expect(page.locator('.methodHero .eyebrow')).toHaveText(`${expected.englishName} Method`);
  await expect(page).toHaveTitle(new RegExp(`콘텐츠 원칙 \\| ${escapeRegex(expected.name)}`));

  await page.goto('/ko/knowledge');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    `승인된 ${expected.name} 법률지식을 상황과 주제별로 찾아봅니다.`,
  );
  await page.goto('/ko/sources');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    `${expected.name} 생활법률 콘텐츠가 사용하는 법령 조문과 판례를 관련 안내와 함께 확인합니다.`,
  );
  await page.goto('/ko/lawyer-workspace');
  await expect(page.locator('main')).toContainText(`${expected.operator}는 변호사에게`);
  await expect(page).toHaveTitle(new RegExp(`변호사 전용 작업공간 \\| ${escapeRegex(expected.name)}`));
  await page.goto('/ko/changes/platform-c2c-seller-verification-2026');
  await expect(page.locator('.eyebrow').filter({
    hasText: `${expected.englishName} 연역 법리 비교`,
  })).toHaveCount(1);
  if (alternate) {
    await page.goto('/ko/trust');
    await expect(page.locator('.eyebrow').first()).toHaveText(`${expected.englishName} Trust`);
    const trustStructured = JSON.parse(
      await page.locator('script[type="application/ld+json"]').last().textContent() ?? '{}',
    );
    const trustOrganization = trustStructured['@graph'].find(
      (item: Record<string, unknown>) => item['@type'] === 'Organization',
    );
    expect(trustOrganization).toMatchObject({
      '@id': `${expected.origin}/#organization`,
      name: expected.legalOperator,
      url: expected.origin,
    });
  }

  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe(expected.name);
  expect(manifest.short_name).toBe(expected.name);
  const robots = await (await page.request.get('/robots.txt')).text();
  expect(robots).toContain(`Sitemap: ${expected.origin}/sitemap.xml`);
  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  expect(sitemap).toContain(`<loc>${expected.origin}</loc>`);
  expect(sitemap).not.toContain(alternate
    ? 'https://rulelink.lolphysical.xyz'
    : 'https://identity-switch.lolphysical.xyz');
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
