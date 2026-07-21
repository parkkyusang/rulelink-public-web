import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const moduleFiles = [
  'src/components/site-search.module.css',
  'src/components/knowledge-explorer.module.css',
  'src/components/knowledge-source-library.module.css',
  'src/components/knowledge-action-workspace.module.css',
];
const [globals, contract, ...modules] = await Promise.all([
  readFile(path.join(root, 'app/globals.css'), 'utf8'),
  readFile(path.join(repositoryRoot, 'docs/DESIGN_SYSTEM_KO.md'), 'utf8'),
  ...moduleFiles.map(file => readFile(path.join(root, file), 'utf8')),
]);

test('공개 웹의 기초 시각값은 전역 디자인 토큰으로 정의한다', () => {
  for (const token of [
    '--font-body',
    '--font-display',
    '--line-strong',
    '--line-hover',
    '--surface-evidence',
    '--radius-pill',
    '--shadow-card-soft',
    '--focus-field',
  ]) assert.match(globals, new RegExp(token));
  assert.match(globals, /font-family: var\(--font-body\)/);
  assert.match(globals, /font-family: var\(--font-display\)/);
});

test('검색·지식·근거·확인 목록은 기초 색상을 임의로 복제하지 않는다', () => {
  const duplicatedFoundation = /#(?:fff|ffffff|dce5df|145c3f|14231c|5b6b63|b9c8c0|9bb8a8|f5f8f6)\b/i;
  for (const [index, source] of modules.entries()) {
    assert.doesNotMatch(source, duplicatedFoundation, moduleFiles[index]);
    assert.match(source, /var\(--(?:green|line|white|muted|surface-soft)/, moduleFiles[index]);
  }
});

test('디자인 계약은 화면 역할과 애셋 생성 조건을 함께 고정한다', () => {
  assert.match(contract, /화면 유형별 우선순위/);
  assert.match(contract, /애셋 원칙/);
  assert.match(contract, /별도 시각 감사 세션/);
  assert.match(contract, /자동검증과 제작 빌드를 모두 통과/);
});
