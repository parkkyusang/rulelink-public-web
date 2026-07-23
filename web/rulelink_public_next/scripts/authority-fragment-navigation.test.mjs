import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  authorityAnchorDetailsId,
  authorityAnchorDomId,
  authorityCardDetailsId,
  authorityFragmentPlan,
  decodeAuthorityFragment,
} from '../src/lib/authority-fragment.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routeKey = {law_key: 'test-law', article_no: '0025'};
const anchors = [
  {
    anchorId: 'article',
    domId: authorityAnchorDomId(routeKey, 'article'),
    detailsId: authorityAnchorDetailsId(routeKey, 'article'),
  },
  {
    anchorId: 'paragraph-1',
    parentAnchorId: 'article',
    domId: authorityAnchorDomId(routeKey, 'p1'),
    detailsId: authorityAnchorDetailsId(routeKey, 'p1'),
  },
  {
    anchorId: 'item-1',
    parentAnchorId: 'paragraph-1',
    domId: authorityAnchorDomId(routeKey, 'p1-i1'),
    detailsId: authorityAnchorDetailsId(routeKey, 'p1-i1'),
  },
];

test('항·호 직접 fragment는 카드부터 대상까지 조상 details를 바깥 순서로 연다', () => {
  assert.deepEqual(
    authorityFragmentPlan(routeKey, anchors, '#authority-test-law-0025-p1-i1'),
    {
      targetId: 'authority-test-law-0025-p1-i1',
      ancestorDetailsIds: [
        authorityCardDetailsId(routeKey),
        authorityAnchorDetailsId(routeKey, 'article'),
        authorityAnchorDetailsId(routeKey, 'p1'),
        authorityAnchorDetailsId(routeKey, 'p1-i1'),
      ],
    },
  );
  assert.equal(authorityFragmentPlan(routeKey, anchors, '#summary'), null);
  assert.equal(decodeAuthorityFragment('#authority-%E0%A4%A'), null);
});

test('same-route version fragments remain scoped to their own card and clause', () => {
  const currentVersion = '2026-current';
  const futureVersion = '2027-future';
  const versionAnchors = versionKey => [{
    anchorId: 'article',
    domId: authorityAnchorDomId(routeKey, 'article', versionKey),
    detailsId: authorityAnchorDetailsId(routeKey, 'article', versionKey),
  }];
  const currentTarget = authorityAnchorDomId(routeKey, 'article', currentVersion);
  const futureTarget = authorityAnchorDomId(routeKey, 'article', futureVersion);
  const currentPlan = authorityFragmentPlan(
    routeKey,
    versionAnchors(currentVersion),
    `#${currentTarget}`,
    currentVersion,
  );
  const futurePlan = authorityFragmentPlan(
    routeKey,
    versionAnchors(futureVersion),
    `#${futureTarget}`,
    futureVersion,
  );

  assert.equal(currentPlan?.targetId, currentTarget);
  assert.equal(futurePlan?.targetId, futureTarget);
  assert.notDeepEqual(currentPlan?.ancestorDetailsIds, futurePlan?.ancestorDetailsIds);
  assert.equal(
    authorityFragmentPlan(
      routeKey,
      versionAnchors(currentVersion),
      `#${futureTarget}`,
      currentVersion,
    ),
    null,
  );
});

test('클라이언트 제어기는 hashchange와 direct focus·새 탭 복귀 문맥을 보존한다', async () => {
  const controller = await readFile(path.join(
    appRoot,
    'src',
    'components',
    'authority-fragment-controller.tsx',
  ), 'utf8');
  assert.match(controller, /details\.reverse\(\)/);
  assert.match(controller, /disclosure\.open = true/);
  assert.match(controller, /window\.requestAnimationFrame/);
  assert.match(controller, /target\.focus\(\{preventScroll: true\}\)/);
  assert.match(controller, /target\.scrollIntoView/);
  assert.match(controller, /addEventListener\('hashchange'/);
  assert.match(controller, /history\.replaceState/);
  assert.match(controller, /data-authority-official-link/);
  assert.match(controller, /authorityCard\?\.contains\(currentTarget\)\) return/);
});
