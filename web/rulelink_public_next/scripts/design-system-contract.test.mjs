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
const [globals, contract, hubDirectory, conceptPopover, ...modules] = await Promise.all([
  readFile(path.join(root, 'app/globals.css'), 'utf8'),
  readFile(path.join(repositoryRoot, 'docs/DESIGN_SYSTEM_KO.md'), 'utf8'),
  readFile(path.join(root, 'src/components/knowledge-hub-directory.module.css'), 'utf8'),
  readFile(path.join(root, 'src/components/legal-concept-text.module.css'), 'utf8'),
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

test('홈 주제 디렉터리는 좁은 화면에서도 가로 스크롤 없는 유동 격자를 사용한다', () => {
  assert.match(hubDirectory, /grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 280px\), 1fr\)\)/);
  assert.match(hubDirectory, /\.grid \{[^}]*max-width: 100%;[^}]*min-width: 0;[^}]*width: 100%;/s);
  assert.match(hubDirectory, /\.card \{[^}]*min-width: 0;/s);
  assert.match(hubDirectory, /@media \(max-width: 640px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(hubDirectory, /overflow-x:\s*(?:auto|scroll)/);
});

test('개념 해설은 전역 고정 레이어와 모바일 바텀시트의 폭·스크롤 계약을 가진다', () => {
  assert.match(conceptPopover, /\.popover \{[^}]*max-width: min\(320px, calc\(100vw - 24px\)\);/s);
  assert.match(conceptPopover, /\.popover \{[^}]*overflow-y: auto;[^}]*position: fixed;[^}]*z-index: 1000;/s);
  assert.match(conceptPopover, /overscroll-behavior: contain/);
  assert.match(conceptPopover, /\.popover\[data-layout='sheet'\] \{[^}]*left: 12px;[^}]*max-height: min\(60vh, 420px\);[^}]*right: 12px;/s);
});
