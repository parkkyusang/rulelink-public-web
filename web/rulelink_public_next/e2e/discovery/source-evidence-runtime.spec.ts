import {readFileSync} from 'node:fs';
import path from 'node:path';

import {expect, test, type Page} from '@playwright/test';

type ContentEntry = {
  concept_ids?: string[];
  content_id: string;
  rule_ids?: string[];
  scenario_ids?: string[];
  slug: string;
  source_coordinate_ids?: string[];
};

type SourceLinked = {
  rule_ids?: string[];
  source_coordinate_ids?: string[];
};

const bundle = JSON.parse(readFileSync(
  path.resolve(process.cwd(), 'content', 'bundle.json'),
  'utf8',
));
const sourceTextLibrary = JSON.parse(readFileSync(
  path.resolve(process.cwd(), 'content', 'source-text-library.json'),
  'utf8',
));
const knowledge = bundle.knowledge;
const rules = new Map<string, SourceLinked>(
  knowledge.rule_cards.map((item: SourceLinked & {rule_id: string}) => [
    item.rule_id,
    item,
  ]),
);
const scenarios = new Map<string, SourceLinked>(
  knowledge.scenario_branches.map((item: SourceLinked & {scenario_id: string}) => [
    item.scenario_id,
    item,
  ]),
);
const concepts = new Map<string, SourceLinked>(
  knowledge.concept_cards.map((item: SourceLinked & {concept_id: string}) => [
    item.concept_id,
    item,
  ]),
);
const entries = knowledge.content_entries as ContentEntry[];
const verifiedSourceIds = new Set<string>(
  sourceTextLibrary.bindings.map((item: {coordinate_id: string}) => item.coordinate_id),
);
const linkOnlySourceIds = new Set<string>(
  sourceTextLibrary.unresolved.map((item: {coordinate_id: string}) => item.coordinate_id),
);

const graphSourceIds = (entry: ContentEntry): string[] => {
  const scenarioRows = (entry.scenario_ids ?? [])
    .map(id => scenarios.get(id))
    .filter((item): item is SourceLinked => Boolean(item));
  const ruleIds = new Set([
    ...(entry.rule_ids ?? []),
    ...scenarioRows.flatMap(item => item.rule_ids ?? []),
  ]);
  return [...new Set([
    ...(entry.source_coordinate_ids ?? []),
    ...[...ruleIds].flatMap(id => rules.get(id)?.source_coordinate_ids ?? []),
    ...scenarioRows.flatMap(item => item.source_coordinate_ids ?? []),
    ...(entry.concept_ids ?? []).flatMap(
      id => concepts.get(id)?.source_coordinate_ids ?? [],
    ),
  ])];
};

const multiSourceEntry = [...entries]
  .map(entry => ({entry, sourceIds: graphSourceIds(entry)}))
  .filter(item => item.sourceIds.length >= 3)
  .sort((left, right) => right.sourceIds.length - left.sourceIds.length)[0];
const verifiedEntry = entries.find(entry => (
  graphSourceIds(entry).some(id => verifiedSourceIds.has(id))
));
const linkOnlyEntry = entries.find(entry => (
  graphSourceIds(entry).some(id => linkOnlySourceIds.has(id))
));

test('복수 공식 근거는 네 화면 폭에서 모두 접혀 시작하고 fragment 대상만 열린다', async ({
  page,
}) => {
  if (!multiSourceEntry) throw new Error('복수 공식 근거 공개 fixture가 필요합니다.');

  for (const width of [320, 390, 768, 1440] as const) {
    await page.setViewportSize({width, height: 1000});
    const route = `/ko/knowledge/${multiSourceEntry.entry.slug}`;
    await page.goto(route, {waitUntil: 'networkidle'});
    const cards = page.locator('[data-source-evidence] [data-source-card]');
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('[data-source-evidence] details[open]')).toHaveCount(0);
    await assertSummaryAvailabilityIsComplete(page);
    await assertNoHorizontalOverflow(page);

    const targetCard = cards.nth(1);
    const targetId = await targetCard.getAttribute('id');
    const targetCoordinate = await targetCard.getAttribute('data-source-coordinate');
    expect(targetId).toBeTruthy();
    expect(targetCoordinate).toBeTruthy();
    await page.goto(`${route}#${encodeURIComponent(targetId!)}`, {
      waitUntil: 'networkidle',
    });
    const navigatedTarget = page.locator(
      `[data-source-coordinate="${targetCoordinate}"]`,
    );
    await expect(navigatedTarget.locator(':scope > details')).toHaveAttribute(
      'open',
      '',
    );
    await expect(page.locator('[data-source-evidence] details[open]')).toHaveCount(1);
    await expect(navigatedTarget).toBeFocused();
    await assertNoHorizontalOverflow(page);
  }
});

test('검증 문언과 공식 원문 연결 상태를 카드 제목과 본문에서 같은 기준으로 표시한다', async ({
  page,
}) => {
  if (!verifiedEntry || !linkOnlyEntry) {
    throw new Error('검증 문언과 공식 원문 연결 공개 fixture가 모두 필요합니다.');
  }

  await page.goto(`/ko/knowledge/${verifiedEntry.slug}`, {waitUntil: 'networkidle'});
  const verifiedCard = page.locator(
    `[data-source-coordinate="${firstMatchingSource(verifiedEntry, verifiedSourceIds)}"]`,
  );
  await expect(verifiedCard.locator('summary')).toContainText('조문 문언 포함');
  await verifiedCard.locator('summary').click();
  await expect(verifiedCard.locator('[data-source-text-state="verified_text"]')).toBeVisible();
  await expect(verifiedCard.locator('[data-source-text-state="verified_text"] p')).not.toBeEmpty();
  await expect(verifiedCard.getByRole('link', {name: /새 탭으로 열기/u})).toBeVisible();

  await page.goto(`/ko/knowledge/${linkOnlyEntry.slug}`, {waitUntil: 'networkidle'});
  const linkOnlyCard = page.locator(
    `[data-source-coordinate="${firstMatchingSource(linkOnlyEntry, linkOnlySourceIds)}"]`,
  );
  await expect(linkOnlyCard.locator('summary')).toContainText('공식 원문에서 확인');
  await linkOnlyCard.locator('summary').click();
  const linkOnly = linkOnlyCard.locator('[data-source-text-state="link_only"]');
  await expect(linkOnly).toBeVisible();
  await expect(linkOnly).toContainText('아래 공식 사이트에서 확인할 수 있습니다.');
  await expect(linkOnly).not.toContainText('페이지 안에 문언을 옮겨 싣지 않고');
  await expect(linkOnlyCard.getByRole('link', {name: /새 탭으로 열기/u})).toBeVisible();
});

test('자바스크립트가 없어도 모든 근거 제목과 원문 링크에 접근할 수 있다', async ({
  browser,
}) => {
  if (!multiSourceEntry) throw new Error('복수 공식 근거 공개 fixture가 필요합니다.');
  const context = await browser.newContext({
    javaScriptEnabled: false,
    locale: 'ko-KR',
    viewport: {width: 320, height: 1000},
  });
  const page = await context.newPage();
  await page.goto(`/ko/knowledge/${multiSourceEntry.entry.slug}`, {
    waitUntil: 'domcontentloaded',
  });
  const cards = page.locator('[data-source-evidence] [data-source-card]');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('[data-source-evidence] details[open]')).toHaveCount(0);
  await cards.first().locator('summary').click();
  await expect(cards.first().locator(':scope > details')).toHaveAttribute('open', '');
  await expect(cards.first().getByRole('link', {name: /새 탭으로 열기/u})).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await context.close();
});

function firstMatchingSource(entry: ContentEntry, sourceIds: Set<string>): string {
  const match = graphSourceIds(entry).find(id => sourceIds.has(id));
  if (!match) throw new Error(`${entry.content_id}에서 기대한 근거 상태를 찾지 못했습니다.`);
  return match;
}

async function assertSummaryAvailabilityIsComplete(page: Page) {
  const states = await page.locator(
    '[data-source-evidence] [data-source-card] summary',
  ).evaluateAll(items => items.map(item => {
    const text = item.textContent ?? '';
    return ['조문 문언 포함', '공식 원문에서 확인']
      .filter(label => text.includes(label)).length;
  }));
  expect(states.every(count => count === 1)).toBe(true);
}

async function assertNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll, JSON.stringify(widths)).toBeLessThanOrEqual(widths.client);
}
