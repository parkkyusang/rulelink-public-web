import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {formatKoreanLegalDate} from '../src/lib/legal-date.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('법령 시행일은 시간대로 변환하지 않고 날짜 좌표를 그대로 표시한다', () => {
  assert.equal(formatKoreanLegalDate('2026-07-21'), '2026년 7월 21일 시행');
  assert.equal(formatKoreanLegalDate('2026-06-24'), '2026년 6월 24일 시행');
  assert.equal(formatKoreanLegalDate('2026-06-16'), '2026년 6월 16일 시행');
});

test('홈은 날짜-only 포맷을 사용하고 Date 자정 변환을 되살리지 않는다', async () => {
  const home = await readFile(path.join(appRoot, 'app', 'page.tsx'), 'utf8');
  assert.match(home, /formatKoreanLegalDate\(brief\.effective_date\)/u);
  assert.doesNotMatch(home, /T00:00:00\+09:00/u);
});
