import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evidenceCaseKey,
  validateEvidenceCases,
} from '../e2e/accessibility/support/accessibility-evidence-bundle.mjs';

const runId = 'wcag-run-current';
const runStartedAt = '2026-07-24T08:00:00.000Z';
const expectedCases = [
  {
    id: 'home',
    mode: 'default',
    route: '/',
    state: 'ready',
    width: 320,
  },
  {
    id: 'trust-on',
    mode: 'trust',
    route: '/ko/trust',
    state: 'ready',
    width: 390,
  },
];
const currentCases = expectedCases.map(item => ({
  ...item,
  generatedAt: '2026-07-24T08:01:00.000Z',
  runId,
  violations: [],
}));

test('현재 run의 기대 증거 집합만 정확히 허용한다', () => {
  const result = validateEvidenceCases({
    cases: currentCases,
    expectedCases,
    runId,
    runStartedAt,
  });
  assert.deepEqual(result.map(evidenceCaseKey), [
    'default|home|ready|320|/',
    'trust|trust-on|ready|390|/ko/trust',
  ]);
});

test('이전 run의 잔류 증거를 거부한다', () => {
  assert.throws(() => validateEvidenceCases({
    cases: [
      ...currentCases,
      {...currentCases[0], runId: 'wcag-run-stale', width: 390},
    ],
    expectedCases,
    runId,
    runStartedAt,
  }), /다른 실행의 접근성 증거/u);
});

test('기대 사례 누락을 거부한다', () => {
  assert.throws(() => validateEvidenceCases({
    cases: currentCases.slice(0, 1),
    expectedCases,
    runId,
    runStartedAt,
  }), /누락:/u);
});

test('기대 목록 밖의 초과 사례를 거부한다', () => {
  assert.throws(() => validateEvidenceCases({
    cases: [
      ...currentCases,
      {...currentCases[0], id: 'removed-test'},
    ],
    expectedCases,
    runId,
    runStartedAt,
  }), /잔류·초과:/u);
});

test('현재 run 시작 전 생성된 증거를 거부한다', () => {
  assert.throws(() => validateEvidenceCases({
    cases: [
      {...currentCases[0], generatedAt: '2026-07-24T07:59:59.000Z'},
      currentCases[1],
    ],
    expectedCases,
    runId,
    runStartedAt,
  }), /오래된 접근성 증거/u);
});
