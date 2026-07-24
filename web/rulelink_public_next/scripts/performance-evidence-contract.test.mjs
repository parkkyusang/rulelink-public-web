import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expectedPerformanceCases,
  performanceCaseKey,
  resolvePerformanceCases,
} from '../e2e/performance/support/performance-cases.mjs';
import {
  compareEvidence,
  extractBuildAssetPaths,
  performanceBudgets,
  validateLighthouseSummaries,
  validatePerformanceCases,
} from '../e2e/performance/support/performance-evidence.mjs';

const fixture = {
  snapshot_id: 'snapshot.fixture',
  change_briefs: [
    {
      change_brief_id: 'change.a',
      slug: 'change-a',
      changed_points: ['a'],
      action_checklist: [],
    },
    {
      change_brief_id: 'change.b',
      slug: 'change-b',
      changed_points: ['a', 'b'],
      action_checklist: ['c'],
    },
  ],
  knowledge: {
    topic_hubs: [
      {hub_id: 'hub.a', slug: 'hub-a', content_ids: ['content.a']},
      {
        hub_id: 'hub.b',
        slug: 'hub-b',
        content_ids: ['content.b', 'content.c'],
      },
    ],
    content_entries: [
      {
        content_id: 'content.a',
        slug: 'entry-a',
        search_intents_ko: ['질문 가'],
      },
      {
        content_id: 'content.b',
        slug: 'entry-b',
        body_sections: [{heading_ko: '가'}],
        related_content_ids: ['content.c'],
        search_intents_ko: ['질문 나'],
      },
      {
        content_id: 'content.c',
        slug: 'entry-c',
        authority_binding_ids: ['binding.c'],
      },
    ],
  },
};

test('대표 경로·검색어·workload는 공개 데이터에서 결정론적으로 고른다', () => {
  const result = resolvePerformanceCases(fixture);
  assert.equal(result.query, '질문 나');
  assert.deepEqual(result.workload, {
    authorityZeroContentId: 'content.a',
    changeBriefId: 'change.b',
    hubId: 'hub.b',
    knowledgeContentId: 'content.b',
    query: '질문 나',
  });
  assert.equal(result.routes.find(item => item.id === 'hub').route, '/ko/hubs/hub-b');
  assert.equal(
    result.routes.find(item => item.id === 'knowledge').route,
    '/ko/knowledge/entry-b',
  );
  assert.equal(
    result.routes.find(item => item.id === 'change-detail').route,
    '/ko/changes/change-b',
  );
  assert.equal(
    result.routes.find(item => item.id === 'authority-zero').route,
    '/ko/knowledge/entry-a',
  );
});

test('7개 상태를 390·1440 두 폭의 14개 증거로 닫는다', () => {
  const expected = expectedPerformanceCases(fixture);
  assert.equal(expected.length, 14);
  assert.deepEqual(
    [...new Set(expected.map(item => item.width))],
    [390, 1440],
  );
});

test('현재 실행의 exact 사례만 허용하고 stale·누락·초과를 거부한다', () => {
  const runId = 'performance-current';
  const runStartedAt = '2026-07-24T09:00:00.000Z';
  const expected = expectedPerformanceCases(fixture);
  const cases = expected.map(item => validCase(item, runId));
  assert.deepEqual(
    validatePerformanceCases({
      cases,
      expected,
      runId,
      runStartedAt,
    }).map(performanceCaseKey),
    [...cases].sort(
      (left, right) => performanceCaseKey(left)
        .localeCompare(performanceCaseKey(right)),
    ).map(performanceCaseKey),
  );
  assert.throws(() => validatePerformanceCases({
    cases: cases.slice(1),
    expected,
    runId,
    runStartedAt,
  }), /누락:/u);
  assert.throws(() => validatePerformanceCases({
    cases: [...cases, {...cases[0], id: 'stale-extra'}],
    expected,
    runId,
    runStartedAt,
  }), /초과:/u);
  assert.throws(() => validatePerformanceCases({
    cases: [{...cases[0], runId: 'old-run'}, ...cases.slice(1)],
    expected,
    runId,
    runStartedAt,
  }), /다른 실행/u);
  assert.throws(() => validatePerformanceCases({
    cases: [{...cases[0], totalTransferredBytes: Number.NaN}, ...cases.slice(1)],
    expected,
    runId,
    runStartedAt,
  }), /유효하지 않은 성능 지표/u);
});

test('초기 HTML의 실제 Next JS/CSS 참조만 중복 없이 추출한다', () => {
  const html = [
    '<script src="/_next/static/chunks/a.js"></script>',
    '<link rel="stylesheet" href="/_next/static/css/b.css?x=1">',
    '<script src="/_next/static/chunks/a.js"></script>',
    '<img src="/_next/static/media/logo.svg">',
  ].join('');
  assert.deepEqual(extractBuildAssetPaths(html), [
    '/_next/static/chunks/a.js',
    '/_next/static/css/b.css',
  ]);
});

test('Lighthouse는 mobile/desktop×home/search 4건과 필수 수치를 요구한다', () => {
  const lighthouse = lighthouseFixture();
  assert.equal(validateLighthouseSummaries(lighthouse).length, 4);
  assert.throws(
    () => validateLighthouseSummaries(lighthouse.slice(1)),
    /Lighthouse 4건/u,
  );
  assert.throws(
    () => validateLighthouseSummaries([
      {...lighthouse[0], performanceScore: Number.NaN},
      ...lighthouse.slice(1),
    ]),
    /점수가 유효하지/u,
  );
  const missingAudit = structuredClone(lighthouse);
  delete missingAudit[0].audits['largest-contentful-paint'];
  assert.throws(
    () => validateLighthouseSummaries(missingAudit),
    /audit 값이 없습니다/u,
  );
});

test('before/after는 동일 snapshot·workload·도구·유효 지표만 비교한다', () => {
  const expected = expectedPerformanceCases(fixture);
  const before = evidenceFixture('before', 'before-run');
  const after = evidenceFixture('after', 'after-run');
  after.cases[0].totalTransferredBytes += 10;
  after.cases.find(item => item.id === 'search-query').searchIndex = {
    bytes: 8,
    requests: 1,
  };
  const comparison = compareEvidence(before, after, expected);
  assert.equal(comparison.baselineRunId, 'before-run');
  assert.equal(comparison.cases[0].deltas.totalTransferredBytes, 10);
  assert.equal(
    comparison.cases.find(item => item.key.startsWith('search-query|'))
      .deltas.searchIndexBytes,
    8,
  );

  const otherSnapshot = structuredClone(before);
  otherSnapshot.provenance.publicationSnapshotId = 'snapshot.other';
  assert.throws(
    () => compareEvidence(otherSnapshot, after, expected),
    /publicationSnapshotId/u,
  );

  const otherQuery = structuredClone(before);
  otherQuery.workload.query = '다른 질문';
  for (const item of otherQuery.cases) {
    if (item.id === 'search-query') item.searchQuery = '다른 질문';
  }
  assert.throws(
    () => compareEvidence(otherQuery, after, expected),
    /workload가 다릅니다/u,
  );

  const invalidMetric = structuredClone(before);
  invalidMetric.cases[0].requestCount = Number.NaN;
  assert.throws(
    () => compareEvidence(invalidMetric, after, expected),
    /유효하지 않은 성능 지표/u,
  );
});

function validCase(routeCase, runId) {
  return {
    ...routeCase,
    schema: 'rulelink_public_performance_case_v1',
    browserVersion: '123.0.0',
    generatedAt: '2026-07-24T09:01:00.000Z',
    runId,
    cls: 0,
    cssTransferredBytes: 10,
    documentAssets: ['/_next/static/chunks/a.js'],
    firstContentfulPaintMs: 1,
    initialHtmlBytes: 100,
    jsTransferredBytes: 20,
    lcpApproxMs: 5,
    longTaskCount: 0,
    longTaskDurationMs: 4,
    navigationTransferredBytes: 100,
    requestCount: 3,
    searchIndex: {bytes: 0, requests: 0},
    searchQuery: routeCase.id === 'search-query' ? '질문 나' : null,
    searchQueryReadyMs: routeCase.id === 'search-query' ? 20 : 0,
    totalTransferredBytes: 130,
  };
}

function lighthouseFixture() {
  const audits = Object.fromEntries([
    'cumulative-layout-shift',
    'first-contentful-paint',
    'largest-contentful-paint',
    'total-blocking-time',
    'total-byte-weight',
  ].map(id => [id, {numericValue: 1, score: 1}]));
  return [
    {formFactor: 'desktop', url: 'http://localhost/', performanceScore: 1, audits},
    {
      formFactor: 'desktop',
      url: 'http://localhost/ko/search',
      performanceScore: 1,
      audits,
    },
    {formFactor: 'mobile', url: 'http://localhost/', performanceScore: 1, audits},
    {
      formFactor: 'mobile',
      url: 'http://localhost/ko/search',
      performanceScore: 1,
      audits,
    },
  ];
}

function evidenceFixture(label, runId) {
  const expected = expectedPerformanceCases(fixture);
  const cases = expected.map(item => validCase(item, runId));
  return {
    schema: 'rulelink_public_performance_evidence_v1',
    label,
    runId,
    runStartedAt: '2026-07-24T09:00:00.000Z',
    caseCount: expected.length,
    expectedCaseCount: expected.length,
    budgets: performanceBudgets,
    comparisonPolicy: {
      requiresEqual: [
        'publicationSnapshotId',
        'publicationBundleSha256',
        'nextVersion',
        'nodeVersion',
        'browserVersion',
        'producerHash',
        'workload',
        'budgets',
      ],
      permitsDifference: ['commitSha', 'buildId', 'buildAssetHash'],
    },
    workload: resolvePerformanceCases(fixture).workload,
    provenance: {
      commitSha: 'a'.repeat(40),
      publicationSnapshotId: 'snapshot.fixture',
      publicationBundleSha256: 'b'.repeat(64),
      nextVersion: '16.2.11',
      nodeVersion: 'v24.0.0',
      browserVersion: '123.0.0',
      buildId: 'fixture-build',
      producerHash: 'c'.repeat(64),
      buildAssetHash: 'd'.repeat(64),
    },
    buildAssets: {
      hash: 'd'.repeat(64),
      assets: [{path: '/_next/static/chunks/a.js'}],
      cases: expected.map(item => ({
        key: performanceCaseKey(item),
        assets: [{path: '/_next/static/chunks/a.js'}],
      })),
    },
    lighthouse: lighthouseFixture(),
    cases,
  };
}
