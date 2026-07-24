import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expectedPerformanceCases,
  performanceCaseKey,
  resolvePerformanceCases,
} from '../e2e/performance/support/performance-cases.mjs';
import {
  compareEvidence,
  validatePerformanceCases,
} from '../e2e/performance/support/performance-evidence.mjs';

const fixture = {
  change_briefs: [
    {slug: 'change-a', changed_points: ['a'], action_checklist: []},
    {
      slug: 'change-b',
      changed_points: ['a', 'b'],
      action_checklist: ['c'],
    },
  ],
  knowledge: {
    topic_hubs: [
      {slug: 'hub-a', content_ids: ['content.a']},
      {slug: 'hub-b', content_ids: ['content.b', 'content.c']},
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

test('대표 경로와 검색어는 공개 데이터의 풍부도에서 결정론적으로 고른다', () => {
  const result = resolvePerformanceCases(fixture);
  assert.equal(result.query, '질문 나');
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
  const cases = expected.map(item => ({
    ...item,
    generatedAt: '2026-07-24T09:01:00.000Z',
    runId,
  }));
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
});

test('before/after는 같은 사례의 전송량과 검색 인덱스 차이만 계산한다', () => {
  const routeCase = expectedPerformanceCases(fixture)[0];
  const common = {
    ...routeCase,
    cssTransferredBytes: 10,
    initialHtmlBytes: 100,
    jsTransferredBytes: 20,
    requestCount: 3,
    longTaskDurationMs: 4,
    cls: 0,
    lcpApproxMs: 5,
  };
  const comparison = compareEvidence(
    {
      runId: 'before-run',
      cases: [{
        ...common,
        totalTransferredBytes: 130,
        searchIndex: {bytes: 0, requests: 0},
      }],
    },
    {
      cases: [{
        ...common,
        totalTransferredBytes: 140,
        searchIndex: {bytes: 8, requests: 1},
      }],
    },
  );
  assert.equal(comparison.baselineRunId, 'before-run');
  assert.equal(comparison.cases[0].deltas.totalTransferredBytes, 10);
  assert.equal(comparison.cases[0].deltas.searchIndexBytes, 8);
  assert.equal(comparison.cases[0].deltas.searchIndexRequests, 1);
});
