import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {GET, dynamic} from '../app/ads.txt/route.ts';

test('승인된 게시자 계정의 판매자 한 줄만 일반 텍스트로 반환한다', async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(await response.text(), 'google.com, pub-9819985404574274, DIRECT, f08c47fec0942fa0\n');
  assert.equal(dynamic, 'force-static');
});

test('응답은 페이지·광고 코드가 아니며 중복 판매자나 가짜 식별자를 포함하지 않는다', async () => {
  const text = await GET().text();
  assert.equal(text.trim().split(/\r?\n/u).length, 1);
  assert.match(text, /^google\.com, pub-\d{16}, DIRECT, f08c47fec0942fa0\n$/u);
  assert.doesNotMatch(text, /<|>|ca-pub|script|RESELLER|placeholder/iu);
});

test('루트 응답 경로는 광고 스크립트를 실행하거나 외부 자료를 요청하지 않는다', async () => {
  const route = await readFile(new URL('../app/ads.txt/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /fetch\s*\(|<script|adsbygoogle|googlesyndication/iu);
});
