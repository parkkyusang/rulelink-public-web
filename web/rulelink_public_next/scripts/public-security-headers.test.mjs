import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  publicContentSecurityPolicy,
  publicSecurityHeaderRules,
  publicSecurityResponseHeaders,
} from '../src/lib/public-security-headers.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('모든 공개 응답에 최소 보안 헤더를 한 계약으로 적용한다', () => {
  assert.deepEqual(publicSecurityHeaderRules(), [{
    headers: publicSecurityResponseHeaders.map(header => ({...header})),
    source: '/:path*',
  }]);
  assert.deepEqual(
    Object.fromEntries(publicSecurityResponseHeaders.map(
      header => [header.key, header.value],
    )),
    {
      'Content-Security-Policy': publicContentSecurityPolicy,
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  );
});

test('CSP zero-state는 자체 출처만 허용하고 외부 제공자와 프레임을 닫는다', () => {
  const directives = Object.fromEntries(publicContentSecurityPolicy
    .split('; ')
    .map(item => {
      const [name, ...values] = item.split(' ');
      return [name, values];
    }));
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['connect-src'], ["'self'"]);
  assert.deepEqual(directives['frame-src'], ["'none'"]);
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['script-src'], ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(directives['style-src'], ["'self'", "'unsafe-inline'"]);
  assert.equal(publicContentSecurityPolicy.includes('*'), false);
  assert.equal(/https?:|data:.*script|blob:/u.test(
    publicContentSecurityPolicy.replace("img-src 'self' data:", ''),
  ), false);
});

test('Next 설정이 공용 헤더 계약을 소비하고 Vercel 중복 정책을 두지 않는다', async () => {
  const [nextConfig, vercel] = await Promise.all([
    readFile(path.join(root, 'next.config.ts'), 'utf8'),
    readFile(path.join(root, 'vercel.json'), 'utf8'),
  ]);
  assert.match(nextConfig, /publicSecurityHeaderRules/u);
  assert.doesNotMatch(nextConfig, /Content-Security-Policy|X-Frame-Options/u);
  assert.equal(Object.hasOwn(JSON.parse(vercel), 'headers'), false);
});
