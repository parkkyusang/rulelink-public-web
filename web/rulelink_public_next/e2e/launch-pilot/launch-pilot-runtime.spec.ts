import {expect, test} from '@playwright/test';

const widths = [320, 390, 768, 1440] as const;

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
