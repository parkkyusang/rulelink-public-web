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
    NEXT_PUBLIC_RULELINK_SITE_URL: 'https://identity-switch.invalid/',
  }), {
    englishName: 'IdentitySwitch', indexing: true, name: '교체검증브랜드',
    operatorName: '교체검증운영자', url: 'https://identity-switch.invalid',
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

test('공개 런타임의 브랜드와 공개 원점 하드코딩은 설정 기본값 한 곳에만 있다', async () => {
  const files = await sourceFiles(['app', 'src']);
  const findings = [];
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    if (file === 'src/lib/site.ts') continue;
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
});

async function sourceFiles(directories) {
  const results = [];
  for (const directory of directories) await walk(directory, results);
  return results.filter(file => /\.(?:ts|tsx)$/u.test(file));
}

async function walk(relative, results) {
  for (const entry of await readdir(path.join(root, relative), {withFileTypes: true})) {
    const child = path.join(relative, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) await walk(child, results);
    else results.push(child);
  }
}
