import assert from 'node:assert/strict';
import test from 'node:test';

import {filterFreshPublications, isPublicationFresh} from '../src/lib/publication-freshness.ts';

const now = new Date('2026-07-21T12:00:00+09:00');

test('재검토 기한이 기준시각 뒤면 공개 대상으로 유지한다', () => {
  assert.equal(isPublicationFresh({expires_at: '2026-07-21T12:00:01+09:00'}, now), true);
});

test('재검토 기한이 도래했거나 지났으면 공개 대상에서 제외한다', () => {
  assert.equal(isPublicationFresh({expires_at: '2026-07-21T12:00:00+09:00'}, now), false);
  assert.equal(isPublicationFresh({expires_at: '2026-07-21T11:59:59+09:00'}, now), false);
});

test('재검토 기한이 없거나 날짜 형식이 잘못되면 안전하게 제외한다', () => {
  assert.equal(isPublicationFresh({expires_at: ''}, now), false);
  assert.equal(isPublicationFresh({expires_at: 'not-a-date'}, now), false);
});

test('공통 최신성 필터가 만료된 관련 콘텐츠까지 제외한다', () => {
  const visible = filterFreshPublications([
    {id: 'fresh', expires_at: '2026-07-21T12:00:01+09:00'},
    {id: 'expired', expires_at: '2026-07-21T12:00:00+09:00'},
    {id: 'invalid', expires_at: 'not-a-date'},
  ], now);

  assert.deepEqual(visible.map(item => item.id), ['fresh']);
});
