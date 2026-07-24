import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {resolveSiteIdentity} from '../src/lib/site.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('설정 누락은 현재 공개 정본 정체성을 그대로 유지한다', () => {
  assert.deepEqual(resolveSiteIdentity({}), {
    englishName: 'RuleLink', indexing: false, name: 'RuleLink',
    operatorName: '리알레', url: 'https://rulelink.lolphysical.xyz',
  });
});

test('이름과 원점을 한 묶음으로 교체할 수 있다', () => {
  assert.deepEqual(resolveSiteIdentity({
    NEXT_PUBLIC_RULELINK_INDEXING: 'true',
    NEXT_PUBLIC_RULELINK_OPERATOR_NAME: '교체검증운영자',
    NEXT_PUBLIC_RULELINK_SITE_ENGLISH_NAME: 'IdentitySwitch',
    NEXT_PUBLIC_RULELINK_SITE_NAME: '교체검증브랜드',
    NEXT_PUBLIC_RULELINK_SITE_URL: 'https://identity-switch.lolphysical.xyz/',
  }), {
    englishName: 'IdentitySwitch', indexing: true, name: '교체검증브랜드',
    operatorName: '교체검증운영자', url: 'https://identity-switch.lolphysical.xyz',
  });
});

test('제공된 정체성 값이 잘못되면 현재값으로 조용히 대체하지 않는다', () => {
  assert.throws(() => resolveSiteIdentity({
    NEXT_PUBLIC_RULELINK_SITE_URL: 'http://unsafe.invalid',
  }), /https URL/);
  assert.throws(() => resolveSiteIdentity({
    NEXT_PUBLIC_RULELINK_SITE_URL: 'https://safe.invalid/path',
  }), /https 원점/);
  assert.throws(() => resolveSiteIdentity({
    NEXT_PUBLIC_RULELINK_SITE_NAME: 'TODO brand',
  }), /시험·예시·미정/);
  assert.throws(() => resolveSiteIdentity({
    NEXT_PUBLIC_RULELINK_SITE_NAME: '   ',
  }), /비어 있을 수 없습니다/);
  assert.throws(() => resolveSiteIdentity({
    NEXT_PUBLIC_RULELINK_OPERATOR_NAME: '<b>운영자</b>',
  }), /HTML 제어문자/);
});

test('공개 IPv4·IPv6는 허용하고 DNS 예약 호스트와 특수목적 IP는 차단한다', () => {
  assert.equal(
    resolveSiteIdentity({NEXT_PUBLIC_RULELINK_SITE_URL: 'https://8.8.8.8'}).url,
    'https://8.8.8.8',
  );
  assert.equal(
    resolveSiteIdentity({
      NEXT_PUBLIC_RULELINK_SITE_URL: 'https://[2001:4860:4860::8888]',
    }).url,
    'https://[2001:4860:4860::8888]',
  );
  for (const origin of [
    'https://identity.invalid',
    'https://identity.test',
    'https://localhost',
    'https://service.internal',
  ]) {
    assert.throws(
      () => resolveSiteIdentity({NEXT_PUBLIC_RULELINK_SITE_URL: origin}),
      /시험·예시·미정|예약·내부 호스트/,
    );
  }
  for (const origin of [
    'https://0.0.0.0',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://169.254.1.1',
    'https://224.0.0.1',
    'https://192.0.2.1',
    'https://240.0.0.1',
    'https://[::]',
    'https://[::1]',
    'https://[fc00::1]',
    'https://[fe80::1]',
    'https://[fec0::1]',
    'https://[ff02::1]',
    'https://[100:0:0:1::1]',
    'https://[2001:1::3]',
    'https://[2001:30::1]',
    'https://[2001:db8::1]',
    'https://[3fff::1]',
  ]) {
    assert.throws(
      () => resolveSiteIdentity({NEXT_PUBLIC_RULELINK_SITE_URL: origin}),
      /특수목적·예약 IP/,
    );
  }
});

test('공개 런타임과 운영 도구의 브랜드·원점 하드코딩은 설정 기본값 한 곳에만 있다', async () => {
  const files = await sourceFiles(['app', 'src', 'scripts']);
  const findings = [];
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    if (
      file === 'src/lib/site.ts'
      || file.startsWith('scripts/fixtures/')
      || file.endsWith('.test.mjs')
    ) continue;
    for (const expression of [
      /['"`]RuleLink/gu,
      /룰링크/gu,
      /https:\/\/rulelink\.lolphysical\.xyz/gu,
    ]) {
      if (expression.test(source)) findings.push(file);
    }
  }
  assert.deepEqual(findings, []);
});

test('별도 변호사 작업공간 주소는 공개 사이트 원점 치환 대상과 분리한다', async () => {
  const source = await readFile(
    path.join(root, 'app/ko/lawyer-workspace/page.tsx'), 'utf8',
  );
  assert.match(source, /href="https:\/\/liale-review\.lolphysical\.xyz"/);
  assert.match(source, /\{site\.name\}/);
  assert.match(source, /\{site\.operatorName\}/);
  const files = await sourceFiles(['app', 'src', 'scripts']);
  const owners = [];
  for (const file of files) {
    if (file.endsWith('.test.mjs')) continue;
    const text = await readFile(path.join(root, file), 'utf8');
    if (text.includes('https://liale-review.lolphysical.xyz')) owners.push(file);
  }
  assert.deepEqual(owners, ['app/ko/lawyer-workspace/page.tsx']);
});

async function sourceFiles(directories) {
  const results = [];
  for (const directory of directories) await walk(directory, results);
  return results.filter(file => /\.(?:ts|tsx|mjs)$/u.test(file));
}

async function walk(relative, results) {
  for (const entry of await readdir(path.join(root, relative), {withFileTypes: true})) {
    const child = path.join(relative, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) await walk(child, results);
    else results.push(child);
  }
}
