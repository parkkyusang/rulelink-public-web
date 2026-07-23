import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  authorityRouteParams,
  selectCanonicalAuthorityReadings,
  selectAuthorityReadingForRoute,
} from '../src/lib/authority-reading.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('정본 경로는 승인된 view의 route_key만 사용하고 같은 경로에서 현행판을 우선한다', () => {
  const current = {
    routeKey: {law_key: 'civil-execution', article_no: '0246-02'},
    timeState: 'current_as_of_review',
    effectiveFrom: '2026-02-01T00:00:00+09:00',
  };
  const historical = {
    ...current,
    timeState: 'historical',
    effectiveFrom: '2024-01-01T00:00:00+09:00',
  };
  assert.deepEqual(authorityRouteParams([historical, current]), [{
    lawKey: 'civil-execution',
    articleNo: '0246-02',
  }]);
  assert.equal(
    selectAuthorityReadingForRoute(
      [historical, current],
      'civil-execution',
      '0246-02',
    ),
    current,
  );
  assert.deepEqual(selectCanonicalAuthorityReadings([historical, current]), [current]);
  assert.equal(
    selectAuthorityReadingForRoute([current], 'civil-execution', '0246'),
    null,
  );
});

test('현행판이 없으면 가장 가까운 시행예정판, 예정판도 없으면 가장 최근 구법을 고른다', () => {
  const routeKey = {law_key: 'test-law', article_no: '0025'};
  const future2027 = {
    routeKey,
    timeState: 'future_effective',
    effectiveFrom: '2027-01-01T00:00:00+09:00',
  };
  const future2028 = {
    ...future2027,
    effectiveFrom: '2028-01-01T00:00:00+09:00',
  };
  const historical2024 = {
    routeKey,
    timeState: 'historical',
    effectiveFrom: '2024-01-01T00:00:00+09:00',
  };
  const historical2025 = {
    ...historical2024,
    effectiveFrom: '2025-01-01T00:00:00+09:00',
  };
  assert.equal(
    selectAuthorityReadingForRoute([future2028, future2027], 'test-law', '0025'),
    future2027,
  );
  assert.equal(
    selectAuthorityReadingForRoute(
      [historical2024, historical2025],
      'test-law',
      '0025',
    ),
    historical2025,
  );
  assert.equal(
    selectCanonicalAuthorityReadings([future2028, future2027]).length,
    1,
  );
});

test('서로 다른 ISO 시간대도 문자열이 아니라 실제 시행시각으로 정렬한다', () => {
  const routeKey = {law_key: 'test-law', article_no: '0025'};
  const closerFuture = {
    routeKey,
    timeState: 'future_effective',
    effectiveFrom: '2027-01-01T00:30:00+09:00',
  };
  const laterFuture = {
    ...closerFuture,
    effectiveFrom: '2026-12-31T16:00:00Z',
  };
  assert.ok(Date.parse(closerFuture.effectiveFrom) < Date.parse(laterFuture.effectiveFrom));
  assert.equal(
    selectAuthorityReadingForRoute(
      [laterFuture, closerFuture],
      'test-law',
      '0025',
    ),
    closerFuture,
  );

  const olderHistorical = {...closerFuture, timeState: 'historical'};
  const newerHistorical = {...laterFuture, timeState: 'historical'};
  assert.equal(
    selectAuthorityReadingForRoute(
      [olderHistorical, newerHistorical],
      'test-law',
      '0025',
    ),
    newerHistorical,
  );
});

test('정본 페이지는 동일 공용 카드와 데이터 기반 static params·metadata·notFound를 재사용한다', async () => {
  const [route, sitemap] = await Promise.all([
    readFile(path.join(
      appRoot,
      'app',
      'ko',
      'authorities',
      '[law-key]',
      '[article-no]',
      'page.tsx',
    ), 'utf8'),
    readFile(path.join(appRoot, 'app', 'sitemap.ts'), 'utf8'),
  ]);
  assert.match(route, /authorityRouteParams\(await listAuthorityReadingUnits\(\)\)/);
  assert.match(route, /export const dynamicParams = false/);
  assert.match(route, /findAuthorityReadingUnit\(route\['law-key'\], route\['article-no'\]\)/);
  assert.match(route, /if \(!view\) notFound\(\)/);
  assert.match(route, /alternates: \{canonical\}/);
  assert.match(route, /<AuthorityReadingSection/);
  assert.doesNotMatch(route, /source_coordinate_id|authority\.test|0025|0034/);
  assert.match(sitemap, /listAuthorityReadingUnits\(\)/);
  assert.match(sitemap, /authorityReadingUnits\.map\(unit =>/);
  assert.match(sitemap, /`\$\{site\.url\}\$\{unit\.routeHref\}`/);
});
