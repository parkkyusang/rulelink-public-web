import assert from 'node:assert/strict';
import test from 'node:test';

import {dateWithinPeriod} from './publication-coverage-core.mjs';

test('coverage 유효기간은 날짜와 RFC3339 시각을 같은 날짜 경계로 비교한다', () => {
  assert.equal(
    dateWithinPeriod(
      '2026-07-26',
      '2026-06-02T00:00:00.000Z',
      undefined,
    ),
    true,
  );
  assert.equal(
    dateWithinPeriod(
      '2026-07-26',
      '2026-06-02T09:00:00+09:00',
      '2026-07-27T00:00:00.000Z',
    ),
    true,
  );
  assert.equal(
    dateWithinPeriod(
      '2026-07-27',
      '2026-06-02T00:00:00.000Z',
      '2026-07-27T00:00:00.000Z',
    ),
    false,
  );
});

test('coverage 유효기간은 날짜 접두어만 닮은 임의 문자열을 거부한다', () => {
  assert.equal(
    dateWithinPeriod('2026-07-26', '2026-06-02-not-rfc3339', undefined),
    false,
  );
  assert.equal(
    dateWithinPeriod(
      '2026-07-26',
      '2026-06-02T00:00:00',
      undefined,
    ),
    false,
  );
});
