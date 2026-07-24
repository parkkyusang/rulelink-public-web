import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import {expect, type Page, type TestInfo} from '@playwright/test';

export const wcagTags = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
] as const;

const reportedImpacts = new Set(['moderate', 'serious', 'critical']);

export async function auditWcag(
  page: Page,
  testInfo: TestInfo,
  context: {
    id: string;
    mode: string;
    route: string;
    state: string;
    width: number;
  },
) {
  const result = await new AxeBuilder({page})
    .withTags([...wcagTags])
    .analyze();
  const violations = result.violations
    .filter(item => item.impact && reportedImpacts.has(item.impact))
    .map(item => ({
      description: item.description,
      help: item.help,
      helpUrl: item.helpUrl,
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.map(node => ({
        failureSummary: node.failureSummary,
        html: node.html,
        impact: node.impact,
        target: node.target,
      })),
      tags: item.tags,
    }));
  const evidence = {
    schema: 'rulelink_wcag_browser_evidence_v1',
    generatedAt: new Date().toISOString(),
    axeVersion: result.testEngine.version,
    tags: wcagTags,
    ...context,
    violations,
  };
  const evidenceRoot = path.resolve(
    process.cwd(),
    'test-results',
    'accessibility',
    'evidence',
    context.mode,
  );
  await mkdir(evidenceRoot, {recursive: true});
  const filename = path.join(
    evidenceRoot,
    `${safe(context.id)}-${context.width}.json`,
  );
  await writeFile(filename, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await testInfo.attach('wcag-evidence', {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: 'application/json',
  });
  expect(
    violations,
    `WCAG moderate 이상 위반:\n${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}

export async function assertNoHorizontalOverflow(page: Page) {
  const measurement = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(measurement.body, JSON.stringify(measurement)).toBeLessThanOrEqual(
    measurement.viewport + 1,
  );
  expect(measurement.document, JSON.stringify(measurement)).toBeLessThanOrEqual(
    measurement.viewport + 1,
  );
}

function safe(value: string) {
  return value.replace(/[^a-z0-9_-]+/giu, '-').replace(/^-|-$/gu, '');
}
