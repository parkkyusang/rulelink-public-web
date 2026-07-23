import {expect, test} from '@playwright/test';

import {
  attachAuthorityEvidence,
  type AuthorityEvidenceCase,
} from './support/evidence-reporter';
import {
  authorityLayoutFailures,
  measureAuthorityLayout,
  openAllAuthorityDetails,
} from './support/measure-layout';
import {resolveAuthorityReleaseCases} from './support/release-cases';

const viewportWidths = [320, 390, 768, 1440] as const;

test('024 실제 배포의 authority 브라우저 수락 증거를 수집한다', async ({
  context,
  page,
  request,
}, testInfo) => {
  const gateEvidence: AuthorityEvidenceCase = {
    failures: [],
    id: 'release-024-gate',
    route: '/publication.json',
  };
  try {
    const baseUrl = process.env.RULELINK_AUTHORITY_RELEASE_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        '024 release gate 미충족: RULELINK_AUTHORITY_RELEASE_BASE_URL이 필요합니다.',
      );
    }
    const cases = await resolveAuthorityReleaseCases();
    gateEvidence.publicationSnapshotId = cases.publicationSnapshotId;
    const publicationResponse = await request.get(`${baseUrl}/publication.json`);
    expect(publicationResponse.ok()).toBe(true);
    const publication = await publicationResponse.json();
    expect(publication.snapshot_id).toBe(cases.publicationSnapshotId);
    await attachAuthorityEvidence(testInfo, {
      ...gateEvidence,
      dom: {authorityRoutes: cases.authorityRoutes.length},
      interaction: {publishedSnapshotId: publication.snapshot_id},
    });

    for (const routeCase of [
      {name: 'knowledge', route: cases.knowledgeRoute},
      ...cases.authorityRoutes.map((route, index) => ({
        name: `authority-${index + 1}`,
        route,
      })),
    ]) {
      for (const width of viewportWidths) {
        await page.setViewportSize({height: 1000, width});
        await page.goto(routeCase.route, {waitUntil: 'networkidle'});
        await expect(page.locator('[data-authority-reading-root]')).toHaveCount(1);
        await openAllAuthorityDetails(page);
        const measurement = await measureAuthorityLayout(page);
        const failures = authorityLayoutFailures(measurement);
        const screenshot = testInfo.outputPath(
          `release-${routeCase.name}-${width}.png`,
        );
        await page.screenshot({fullPage: true, path: screenshot});
        await testInfo.attach(`release-screenshot-${routeCase.name}-${width}`, {
          contentType: 'image/png',
          path: screenshot,
        });
        await attachAuthorityEvidence(testInfo, {
          failures: failures.map(message => ({
            actual: message,
            assertion: '024 release horizontal overflow',
            expected: '0px overflow within 1px rounding tolerance',
          })),
          id: `release-overflow-${routeCase.name}-${width}`,
          measurements: measurement,
          publicationSnapshotId: cases.publicationSnapshotId,
          route: routeCase.route,
          viewport: {height: 1000, width},
        });
        expect(failures, failures.join('\n')).toEqual([]);
      }
    }

    await page.goto(cases.knowledgeRoute);
    const target = page.locator('[data-authority-clause-target]').last();
    const targetId = await target.getAttribute('id');
    expect(targetId).toBeTruthy();
    await page.goto(`${cases.knowledgeRoute}#${encodeURIComponent(targetId!)}`);
    await expect.poll(
      () => page.evaluate(() => document.activeElement?.id ?? ''),
    ).toBe(targetId);
    const ancestors = await page.locator(`#${cssEscape(targetId!)}`).evaluate(
      element => {
        const result: Array<{id: string; open: boolean}> = [];
        let parent = element.parentElement;
        while (parent) {
          if (parent instanceof HTMLDetailsElement) {
            result.push({id: parent.id, open: parent.open});
          }
          parent = parent.parentElement;
        }
        return result;
      },
    );
    expect(ancestors.every(item => item.open)).toBe(true);

    await context.route('https://www.law.go.kr/**', route => route.fulfill({
      body: '<!doctype html><title>공식원문 수락 응답</title>',
      contentType: 'text/html; charset=utf-8',
      status: 200,
    }));
    const officialLink = page
      .locator(`#${cssEscape(targetId!)}`)
      .locator('xpath=ancestor::article[@data-authority-id]')
      .locator('[data-authority-official-link]');
    const popupPromise = page.waitForEvent('popup');
    await officialLink.focus();
    await page.keyboard.press('Enter');
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    const hashAfterPopup = await page.evaluate(
      () => decodeURIComponent(location.hash.slice(1)),
    );
    expect(hashAfterPopup).toBe(targetId);
    await popup.close();

    const authorityRoot = page.locator('#statute-reading[data-authority-reading-root]');
    const readingPath = page.locator('#reading-path');
    await expect(authorityRoot).toHaveCount(1);
    await expect(readingPath).toHaveCount(1);
    await expect(authorityRoot.locator('[data-reading-section]')).toHaveCount(0);
    await expect(readingPath.locator('[data-authority-official-link]')).toHaveCount(0);

    await page.goto(cases.zeroStateRoute);
    await expect(page.locator('[data-authority-reading-root]')).toHaveCount(0);
    await expect(page.locator('[data-authority-depth-nav]')).toHaveCount(0);
    await attachAuthorityEvidence(testInfo, {
      dom: {
        ancestorDetails: ancestors,
        authorityTypedBoundary: true,
        zeroStateAuthorityRoots: 0,
      },
      failures: [],
      id: 'release-024-interaction',
      interaction: {
        activeElementId: targetId,
        hashAfterPopup,
      },
      publicationSnapshotId: cases.publicationSnapshotId,
      route: cases.knowledgeRoute,
    });
  } catch (error) {
    gateEvidence.failures = [{
      actual: error instanceof Error ? error.message : String(error),
      assertion: '024 release evidence gate',
      expected: 'deployed 024 snapshot with compensation authority binding',
    }];
    await attachAuthorityEvidence(testInfo, gateEvidence);
    throw error;
  }
});

function cssEscape(value: string): string {
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}
