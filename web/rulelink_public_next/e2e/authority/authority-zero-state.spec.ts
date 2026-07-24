import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {expect, test} from '@playwright/test';

import {
  attachAuthorityEvidence,
  type AuthorityEvidenceCase,
} from './support/evidence-reporter';

const route = '/ko/knowledge/legal-heir-order-and-spouse';
const baselinePath = path.resolve(
  process.cwd(),
  'e2e',
  'authority',
  'baselines',
  '023-zero-state.semantic.json',
);

test('023 zero-state 상세 화면의 의미구조가 authority runtime에서도 불변이다', async ({
  page,
}, testInfo) => {
  await page.goto(route, {waitUntil: 'networkidle'});
  await expect(page.locator('[data-authority-reading-root]')).toHaveCount(0);
  await expect(page.locator('[data-authority-depth-nav]')).toHaveCount(0);
  await expect(page.locator('.knowledgeSectionNav')).toHaveCount(1);
  await expect(page.locator('#summary')).toHaveCount(1);
  await expect(page.locator('#rules')).toHaveCount(1);
  await expect(page.locator('#actions')).toHaveCount(1);
  await expect(page.locator('a[href^="/ko/authorities/"]')).toHaveCount(0);

  const signature = await semanticSignature(page);
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  if (process.env.RULELINK_UPDATE_AUTHORITY_BASELINE === '1') {
    baseline.signature = signature;
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  }
  const diff = semanticDiff(baseline.signature, signature);
  const evidence: AuthorityEvidenceCase = {
    dom: {
      authorityRoots: 0,
      depthNavs: 0,
      existingKnowledgeNavs: 1,
    },
    failures: diff.map(item => ({
      actual: item.actual,
      assertion: `023 zero-state semantic signature: ${item.path}`,
      expected: item.expected,
    })),
    id: 'zero-state-023-semantic',
    publicationSnapshotId:
      'kr-knowledge-core-20260723-023-authority-browser-fixture',
    route,
    zeroState: {
      actualHash: stableJson(signature),
      baselineHash: stableJson(baseline.signature),
      baselineRelease: '023',
      diff,
    },
  };
  await attachAuthorityEvidence(testInfo, evidence);
  expect(diff, JSON.stringify(diff, null, 2)).toEqual([]);
});

async function semanticSignature(page: import('@playwright/test').Page) {
  return page.locator('main').evaluate(main => {
    const normalize = (value: string | null) => (
      value ?? ''
    ).replace(/\s+/g, ' ').trim();
    return {
      headings: [...main.querySelectorAll('h1, h2, h3, h4')]
        .map(element => ({
          level: Number(element.tagName.slice(1)),
          text: normalize(element.textContent),
        })),
      landmarks: {
        main: document.querySelectorAll('main').length,
        nav: main.querySelectorAll('nav').length,
        section: main.querySelectorAll('section').length,
      },
      links: [...main.querySelectorAll<HTMLAnchorElement>('a[href]')]
        .map(link => ({
          href: link.getAttribute('href'),
          text: normalize(link.textContent),
        })),
      navigations: [...main.querySelectorAll<HTMLElement>('nav')]
        .map(nav => ({
          ariaLabel: nav.getAttribute('aria-label'),
          hrefs: [...nav.querySelectorAll<HTMLAnchorElement>('a[href]')]
            .map(link => link.getAttribute('href')),
        })),
      sectionIds: [...main.querySelectorAll<HTMLElement>('section[id]')]
        .map(section => section.id),
    };
  });
}

function semanticDiff(
  expected: unknown,
  actual: unknown,
  currentPath = '$',
): Array<{actual: unknown; expected: unknown; path: string}> {
  if (Object.is(expected, actual)) return [];
  if (
    !expected || !actual
    || typeof expected !== 'object'
    || typeof actual !== 'object'
  ) {
    return [{actual, expected, path: currentPath}];
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return [{actual, expected, path: currentPath}];
    }
    const result = [];
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      result.push(...semanticDiff(
        expected[index],
        actual[index],
        `${currentPath}[${index}]`,
      ));
    }
    return result;
  }
  const expectedObject = expected as Record<string, unknown>;
  const actualObject = actual as Record<string, unknown>;
  return [...new Set([
    ...Object.keys(expectedObject),
    ...Object.keys(actualObject),
  ])].sort().flatMap(key => semanticDiff(
    expectedObject[key],
    actualObject[key],
    `${currentPath}.${key}`,
  ));
}

function stableJson(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, item) => {
    if (!item || Array.isArray(item) || typeof item !== 'object') return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
