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

const knowledgeRoute = '/ko/knowledge/authority-e2e-multi-version';
const authorityRoute = '/ko/authorities/test-law/0025';
const viewportWidths = [320, 390, 768, 1440] as const;

for (const routeCase of [
  {name: 'knowledge', route: knowledgeRoute},
  {name: 'authority', route: authorityRoute},
]) {
  for (const width of viewportWidths) {
    test(`${routeCase.name} ${width}px 실제 가로 넘침이 없다`, async ({
      page,
    }, testInfo) => {
      const evidence = baseEvidence(
        `overflow-${routeCase.name}-${width}`,
        routeCase.route,
      );
      evidence.viewport = {height: 1000, width};
      await page.setViewportSize(evidence.viewport);
      await page.goto(routeCase.route, {waitUntil: 'networkidle'});
      await expect(page.locator('[data-authority-reading-root]')).toHaveCount(1);
      await openAllAuthorityDetails(page);
      const measurement = await measureAuthorityLayout(page);
      const screenshot = testInfo.outputPath(
        `authority-${routeCase.name}-${width}.png`,
      );
      await page.screenshot({fullPage: true, path: screenshot});
      await testInfo.attach('authority-screenshot', {
        contentType: 'image/png',
        path: screenshot,
      });
      const failures = authorityLayoutFailures(measurement);
      evidence.dom = await authorityDomCounts(page);
      evidence.measurements = measurement;
      evidence.failures = failures.map(message => ({
        actual: message,
        assertion: 'horizontal overflow',
        expected: '0px overflow within 1px rounding tolerance',
      }));
      await attachAuthorityEvidence(testInfo, evidence);
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }
}

test('가장 깊은 clause fragment가 조상을 열고 정확한 대상에 초점을 둔다', async ({
  page,
}, testInfo) => {
  const evidence = baseEvidence('direct-clause-fragment', knowledgeRoute);
  await page.goto(knowledgeRoute);
  const deepest = page.locator('[data-authority-clause-target]').last();
  const targetId = await requiredAttribute(deepest, 'id');
  const directUrl = `${knowledgeRoute}#${encodeURIComponent(targetId)}`;
  await page.goto(directUrl);
  await expect.poll(
    () => page.evaluate(() => document.activeElement?.id ?? ''),
  ).toBe(targetId);
  const ancestorDetails = await page.locator(`#${cssEscape(targetId)}`).evaluate(
    target => {
      const result: Array<{id: string; open: boolean}> = [];
      let parent = target.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) {
          result.push({id: parent.id, open: parent.open});
        }
        parent = parent.parentElement;
      }
      return result.reverse();
    },
  );
  await expect(page.locator(`#${cssEscape(targetId)}`)).toBeInViewport();
  const currentHash = await page.evaluate(() => decodeURIComponent(location.hash.slice(1)));
  evidence.interaction = {
    activeElementId: await page.evaluate(() => document.activeElement?.id ?? null),
    ancestorDetails,
    hash: currentHash,
    targetId,
  };
  evidence.dom = await authorityDomCounts(page);
  evidence.failures = ancestorDetails
    .filter(item => !item.open)
    .map(item => ({
      actual: false,
      assertion: 'direct fragment ancestor open',
      expected: true,
      selector: `#${item.id}`,
    }));
  await attachAuthorityEvidence(testInfo, evidence);
  expect(ancestorDetails.length).toBeGreaterThanOrEqual(5);
  expect(ancestorDetails.every(item => item.open)).toBe(true);
  expect(currentHash).toBe(targetId);
});

test('같은 route의 현행·구법은 DOM ID와 fragment focus를 공유하지 않는다', async ({
  page,
}, testInfo) => {
  const evidence = baseEvidence('same-route-multiversion-focus', knowledgeRoute);
  await page.goto(knowledgeRoute);
  const cards = page.locator('article[data-authority-id]');
  await expect(cards).toHaveCount(2);
  const currentCard = cards.filter({
    has: page.getByText('현행', {exact: true}),
  });
  const historicalCard = cards.filter({
    has: page.getByText('구법 적용 가능', {exact: true}),
  });
  await expect(currentCard).toHaveCount(1);
  await expect(historicalCard).toHaveCount(1);

  const allIds = await page.locator(
    '[data-authority-reading-root] details[id], '
    + '[data-authority-reading-root] summary[id], '
    + '[data-authority-clause-target][id]',
  ).evaluateAll(elements => elements.map(element => element.id));
  expect(new Set(allIds).size).toBe(allIds.length);

  const currentTargetId = await requiredAttribute(
    currentCard.locator('[data-authority-clause-target]').last(),
    'id',
  );
  const historicalTargetId = await requiredAttribute(
    historicalCard.locator('[data-authority-clause-target]').last(),
    'id',
  );
  expect(currentTargetId).not.toBe(historicalTargetId);
  expect(currentTargetId).toContain('-version-');
  expect(historicalTargetId).toContain('-version-');

  await page.goto(`${knowledgeRoute}#${encodeURIComponent(currentTargetId)}`);
  await expect.poll(
    () => page.evaluate(() => document.activeElement?.id ?? ''),
  ).toBe(currentTargetId);
  await page.evaluate(targetId => {
    location.hash = `#${encodeURIComponent(targetId)}`;
  }, historicalTargetId);
  await expect.poll(
    () => page.evaluate(() => document.activeElement?.id ?? ''),
  ).toBe(historicalTargetId);
  const historicalAncestors = await page
    .locator(`#${cssEscape(historicalTargetId)}`)
    .evaluate(target => {
      const states: Array<{id: string; open: boolean}> = [];
      let parent = target.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) {
          states.push({id: parent.id, open: parent.open});
        }
        parent = parent.parentElement;
      }
      return states;
    });

  evidence.interaction = {
    activeElementId: await page.evaluate(() => document.activeElement?.id ?? null),
    currentTargetId,
    historicalAncestors,
    historicalTargetId,
    uniqueDomIdCount: new Set(allIds).size,
  };
  evidence.dom = await authorityDomCounts(page);
  await attachAuthorityEvidence(testInfo, evidence);
  expect(historicalAncestors.every(item => item.open)).toBe(true);

  await page.goto(authorityRoute);
  await expect(page.locator('article[data-authority-id]')).toHaveCount(1);
  await expect(page.getByText('현행', {exact: true})).toHaveCount(1);
});

test('키보드로 읽기 깊이·카드·조문·직접 링크를 완주한다', async ({
  page,
}, testInfo) => {
  const evidence = baseEvidence('keyboard-reading-flow', knowledgeRoute);
  await page.goto(knowledgeRoute);
  const depthNav = page.locator('[data-authority-depth-nav]');
  const summaryLink = depthNav.getByRole('link', {name: '30초 답'});
  await summaryLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#summary$/);
  await expect(page.locator('#summary')).toBeInViewport();

  const statuteLink = depthNav.getByRole('link', {name: '조문 구조'});
  await statuteLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#statute-reading$/);
  await expect(page.locator('#statute-reading')).toBeInViewport();

  const cardDetails = page.locator('article[data-authority-id] > details').first();
  const cardSummary = cardDetails.locator(':scope > summary');
  await cardSummary.focus();
  if (await cardDetails.getAttribute('open') !== null) {
    await page.keyboard.press('Enter');
    await expect(cardDetails).not.toHaveAttribute('open', '');
  }
  await page.keyboard.press('Enter');
  await expect(cardDetails).toHaveAttribute('open', '');

  const clauseDetails = cardDetails.locator('.clauseTree details, ol[aria-label] details');
  const clauseCount = await clauseDetails.count();
  expect(clauseCount).toBeGreaterThanOrEqual(4);
  for (let index = 0; index < clauseCount; index += 1) {
    const disclosure = clauseDetails.nth(index);
    const disclosureSummary = disclosure.locator(':scope > summary');
    await expect(disclosureSummary).toBeVisible();
    await disclosureSummary.focus();
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('open', '');
  }

  const clauseLink = cardDetails.locator('a[href^="#authority-"]').last();
  const fragmentHref = await requiredAttribute(clauseLink, 'href');
  const targetId = decodeURIComponent(fragmentHref.slice(1));
  await clauseLink.focus();
  await page.keyboard.press('Enter');
  await expect.poll(
    () => page.evaluate(() => document.activeElement?.id ?? ''),
  ).toBe(targetId);
  await expect(page.locator(`#${cssEscape(targetId)}`)).toBeInViewport();

  await cardSummary.focus();
  await page.keyboard.press('Enter');
  await expect(cardDetails).not.toHaveAttribute('open', '');
  await page.keyboard.press('Tab');
  const focusedInsideClosedCard = await cardDetails.evaluate(
    details => details.contains(document.activeElement),
  );
  evidence.interaction = {
    activeElementAfterClauseLink: targetId,
    cardOpenAfterClose: await cardDetails.getAttribute('open') !== null,
    clauseCount,
    focusedInsideClosedCard,
    hash: await page.evaluate(() => decodeURIComponent(location.hash.slice(1))),
  };
  await attachAuthorityEvidence(testInfo, evidence);
  expect(focusedInsideClosedCard).toBe(false);
});

test('공식원문 popup 뒤 exact clause fragment를 보존한다', async ({
  context,
  page,
}, testInfo) => {
  const evidence = baseEvidence('official-popup-fragment-preservation', knowledgeRoute);
  await context.route('https://www.law.go.kr/**', route => route.fulfill({
    body: '<!doctype html><title>공식원문 시험 응답</title>',
    contentType: 'text/html; charset=utf-8',
    status: 200,
  }));
  await page.goto(knowledgeRoute);
  const targetId = await requiredAttribute(
    page.locator('[data-authority-clause-target]').last(),
    'id',
  );
  await page.goto(`${knowledgeRoute}#${encodeURIComponent(targetId)}`);
  await expect.poll(
    () => page.evaluate(() => document.activeElement?.id ?? ''),
  ).toBe(targetId);
  const targetCard = page
    .locator(`#${cssEscape(targetId)}`)
    .locator('xpath=ancestor::article[@data-authority-id]');
  const officialLink = targetCard.locator('[data-authority-official-link]');
  const officialHref = await requiredAttribute(officialLink, 'href');
  await officialLink.focus();
  const popupPromise = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  const hashAfterPopup = await page.evaluate(
    () => decodeURIComponent(location.hash.slice(1)),
  );
  expect(new URL(popup.url()).href).toBe(new URL(officialHref).href);
  expect(new URL(popup.url()).protocol).toBe('https:');
  expect(new URL(popup.url()).hostname).toBe('www.law.go.kr');
  await popup.close();
  expect(hashAfterPopup).toBe(targetId);
  await expect(page.locator(`#${cssEscape(targetId)}`)).toHaveCount(1);

  await page.goto(knowledgeRoute);
  const firstOfficial = page.locator('[data-authority-official-link]').first();
  const returnFragment = await requiredAttribute(
    firstOfficial,
    'data-authority-return-fragment',
  );
  const secondPopupPromise = page.waitForEvent('popup');
  await firstOfficial.focus();
  await page.keyboard.press('Enter');
  const secondPopup = await secondPopupPromise;
  await expect.poll(
    () => page.evaluate(() => decodeURIComponent(location.hash.slice(1))),
  ).toBe(returnFragment);
  await secondPopup.close();

  evidence.interaction = {
    exactClauseFragment: targetId,
    hashAfterPopup,
    officialHref,
    returnFragmentWithoutInitialHash: returnFragment,
  };
  await attachAuthorityEvidence(testInfo, evidence);
});

test('authority와 typed reading path는 의미와 DOM 경계를 공유하지 않는다', async ({
  page,
}, testInfo) => {
  const evidence = baseEvidence('authority-typed-section-boundary', knowledgeRoute);
  await page.goto(knowledgeRoute);
  const authorityRoot = page.locator('#statute-reading[data-authority-reading-root]');
  const readingPath = page.locator('#reading-path');
  await expect(authorityRoot).toHaveCount(1);
  await expect(readingPath).toHaveCount(1);
  await expect(readingPath.locator('[data-reading-section]')).toHaveCount(1);
  await expect(authorityRoot.locator('[data-reading-section]')).toHaveCount(0);
  await expect(readingPath.locator('[data-authority-reading-root]')).toHaveCount(0);
  await expect(readingPath.locator('[data-authority-official-link]')).toHaveCount(0);
  const authorityBeforeReadingPath = await authorityRoot.evaluate((authority, targetId) => {
    const target = document.getElementById(targetId);
    return Boolean(
      target
      && authority.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }, 'reading-path');
  evidence.dom = {
    ...(await authorityDomCounts(page)),
    authorityBeforeReadingPath,
    readingSectionsInsideAuthority: await authorityRoot
      .locator('[data-reading-section]')
      .count(),
  };
  await attachAuthorityEvidence(testInfo, evidence);
  expect(authorityBeforeReadingPath).toBe(true);
});

function baseEvidence(id: string, route: string): AuthorityEvidenceCase {
  return {
    failures: [],
    id,
    publicationSnapshotId:
      'kr-knowledge-core-20260723-023-authority-browser-fixture',
    route,
  };
}

async function authorityDomCounts(page: import('@playwright/test').Page) {
  return {
    authorityRoots: await page.locator('[data-authority-reading-root]').count(),
    cards: await page.locator('[data-authority-id]').count(),
    clauseTargets: await page.locator('[data-authority-clause-target]').count(),
    depthNavs: await page.locator('[data-authority-depth-nav]').count(),
    typedSections: await page.locator('[data-reading-section]').count(),
  };
}

async function requiredAttribute(
  locator: import('@playwright/test').Locator,
  name: string,
): Promise<string> {
  const value = await locator.getAttribute(name);
  expect(value, `${name} attribute`).toBeTruthy();
  return value!;
}

function cssEscape(value: string): string {
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}
