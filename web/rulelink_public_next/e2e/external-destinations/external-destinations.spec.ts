import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Locator, type Page} from '@playwright/test';

const mode = process.env.RULELINK_EXTERNAL_DESTINATIONS_MODE ?? 'default';
const widths = [320, 390, 768, 1440];
const knowledgePath = '/ko/knowledge/legal-heir-order-and-spouse';

for (const width of widths) {
  test(`external destinations ${mode} ${width}px`, async ({page}) => {
    await page.setViewportSize({height: width <= 390 ? 844 : 1000, width});
    const externalRequests: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).origin !== `http://127.0.0.1:8899`) {
        externalRequests.push(request.url());
      }
    });
    await page.goto('/ko/lawyer-workspace', {waitUntil: 'networkidle'});
    await assertNoOverflow(page);
    expect(externalRequests).toEqual([]);

    const workspace = page.locator(
      '[data-external-destination-role="optional_workspace"]',
    );
    if (mode === 'default') {
      await expect(workspace).toHaveCount(0);
    } else {
      await expect(workspace).toHaveAttribute(
        'href',
        'https://workspace.rulelink.kr/verified',
      );
      await expect(workspace).toHaveAttribute('target', '_blank');
      await expect(workspace).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      );
      await expect(workspace).toHaveAccessibleName(
        /외부 사이트, 새 탭/u,
      );
      await clickWithoutNavigation(page, workspace);
    }

    await page.goto(knowledgePath, {waitUntil: 'networkidle'});
    await assertNoOverflow(page);
    const official = page.locator('a[target="_blank"]').filter({
      hasText: /원문/u,
    }).first();
    await expect(official).toHaveAttribute('rel', 'noopener noreferrer');

    if (mode === 'configured') {
      const reviewer = page.locator(
        '[data-external-destination-role="reviewer_evidence"]',
      );
      await expect(reviewer).toHaveAttribute(
        'href',
        'https://reviewer-registry.rulelink.kr/reviewers/bar-001',
      );
      await expect(reviewer).toHaveAccessibleName(/외부 사이트, 새 탭/u);
      await reviewer.focus();
      await expect(reviewer).toBeFocused();
      await clickWithoutNavigation(page, reviewer);

      await page.goto('/ko/trust', {waitUntil: 'networkidle'});
      const contact = page.locator(
        '[data-external-destination-role="operator_contact"]',
      );
      await expect(contact).toHaveAttribute(
        'href',
        'mailto:corrections@rulelink.kr?subject=content-correction',
      );
      await expect(contact).not.toHaveAttribute('target', '_blank');
      await expect(contact).toHaveAccessibleName(/이메일 보내기/u);
      await clickWithoutNavigation(page, contact);
    }

    expect(externalRequests).toEqual([]);
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
    const failing = axe.violations.filter(item => [
      'moderate',
      'serious',
      'critical',
    ].includes(item.impact ?? ''));
    expect(failing, JSON.stringify(failing, null, 2)).toEqual([]);
  });
}

async function clickWithoutNavigation(page: Page, locator: Locator) {
  await locator.evaluate(element => {
    element.addEventListener('click', event => {
      event.preventDefault();
      document.documentElement.dataset.clickedExternalHref =
        (event.currentTarget as HTMLAnchorElement).href;
    }, {once: true});
  });
  await locator.click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-clicked-external-href',
    await locator.evaluate(element => (element as HTMLAnchorElement).href),
  );
}

async function assertNoOverflow(page: Page) {
  const measurement = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(measurement.scrollWidth).toBeLessThanOrEqual(
    measurement.clientWidth + 1,
  );
}
