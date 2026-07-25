import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';

const widths = [320, 390, 768, 1440] as const;
const wcagTags = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
] as const;

test('024 파일럿은 사실 선택을 답·주장·근거·자료·행동·기한에 일관되게 반영한다', async ({
  page,
}) => {
  for (const width of widths) {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/', {waitUntil: 'networkidle'});
    await expect(page.locator('[data-answer-state]')).toHaveAttribute(
      'data-answer-state',
      'conditional',
    );
    const accessibility = await new AxeBuilder({page})
      .withTags([...wcagTags])
      .analyze();
    expect(
      accessibility.violations,
      `파일럿 ${width}px WCAG 자동검사 위반`,
    ).toEqual([]);
    const scenarios = page.locator('[data-scenario-id]');
    await expect(scenarios).toHaveCount(2);
    const conditionalClaim = page.locator('[data-authority-claims] [data-claim-state="pending"]').first();
    await expect(conditionalClaim).toContainText('사실 확인 전 조건부');

    await scenarios.nth(0).getByRole('button', {name: '예', exact: true}).click();
    await scenarios.nth(1).getByRole('button', {name: '예', exact: true}).click();
    await expect(page.locator('[data-answer-state]')).toHaveAttribute(
      'data-answer-state',
      'active',
    );
    const activeClaim = page.locator('[data-active-claim-id]').filter({
      has: page.locator('[data-claim-authority-id]'),
    }).first();
    await expect(activeClaim).toBeVisible();

    const authorityLink = activeClaim.locator('[data-claim-authority-id]').first();
    const authorityHash = await authorityLink.getAttribute('href');
    await authorityLink.click();
    expect(authorityHash).toMatch(/^#authority-/u);
    await expect(page.locator(authorityHash!)).toBeFocused();
    await expect(page.locator(authorityHash!).locator('xpath=ancestor::details[1]')).toHaveAttribute('open', '');

    for (const kind of ['evidence', 'action', 'deadline'] as const) {
      const link = activeClaim.locator(`[data-claim-${kind}-id]`).first();
      await expect(link).toBeVisible();
      const hash = await link.getAttribute('href');
      await link.click();
      await expect(page.locator(`[id="${hash!.slice(1)}"]`)).toBeFocused();
    }

    await scenarios.nth(0).getByRole('button', {name: '모르겠음', exact: true}).click();
    await expect(page.locator('[data-answer-state]')).toHaveAttribute(
      'data-answer-state',
      'conditional',
    );
    await expect(page.locator('[data-authority-claims] [data-claim-state="pending"]').first()).toBeVisible();

    await scenarios.nth(0).getByRole('button', {name: '아니오', exact: true}).click();
    await expect(page.locator('[data-answer-state]')).toHaveAttribute(
      'data-answer-state',
      'conditional',
    );
    await expect(page.locator('[data-authority-claims] [data-claim-state="excluded"]')).toHaveCount(0);
    const scenarioStorage = await page.evaluate(() => (
      Object.keys(localStorage).filter(key => key.startsWith('rulelink-scenario-'))
    ));
    expect(scenarioStorage).toEqual([]);
    const overflow = await page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ));
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('024 파일럿은 자바스크립트 없이 양쪽 사실분기와 정적 근거를 보존한다', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  try {
    for (const width of widths) {
      await page.setViewportSize({width, height: 1000});
      await page.goto('/', {waitUntil: 'domcontentloaded'});
      await expect(page).toHaveTitle('공개 법률답변 024 화면 계약 파일럿');
      const scenarios = page.locator('[data-scenario-id]');
      await expect(scenarios).toHaveCount(2);
      await expect(scenarios.locator('button')).toHaveCount(0);
      await expect(scenarios.getByText('해당하면', {exact: true})).toHaveCount(2);
      await expect(scenarios.getByText('해당하지 않으면', {exact: true})).toHaveCount(2);
      await expect(page.locator('[data-authority-claims]').first()).toBeVisible();
      const overflow = await page.evaluate(() => (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      ));
      expect(overflow).toBeLessThanOrEqual(1);
    }
  } finally {
    await context.close();
  }
});
