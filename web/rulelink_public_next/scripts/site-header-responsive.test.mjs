import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layoutPath = path.join(root, 'app', 'layout.tsx');
const componentPath = path.join(root, 'src', 'components', 'site-header.tsx');
const cssPath = path.join(root, 'src', 'components', 'site-header.module.css');

test('전역 헤더는 서버 레이아웃에서 독립된 반응형 컴포넌트로 렌더링된다', async () => {
  const [layout, component] = await Promise.all([
    readFile(layoutPath, 'utf8'),
    readFile(componentPath, 'utf8'),
  ]);

  assert.match(layout, /import \{SiteHeader\} from '@\/components\/site-header';/);
  assert.match(layout, /<SiteHeader hasConcepts=\{hasConcepts\} preview=\{preview\} siteName=\{site\.name\} \/>/);
  assert.match(component, /^'use client';/);
  assert.match(component, /aria-label="주요 메뉴" className=\{styles\.desktopNav\}/);
  assert.match(component, /aria-label="전체에서 찾기"[\s\S]*href="\/ko\/search"/);
  assert.match(component, /aria-controls=\{menuId\}/);
  assert.match(component, /aria-expanded=\{menuOpen\}/);
  assert.match(component, /aria-label=\{menuOpen \? '주요 메뉴 닫기' : '주요 메뉴 열기'\}/);
  assert.match(component, /aria-label="모바일 주요 메뉴"/);
});

test('모바일 메뉴는 Escape, 바깥 클릭과 데스크톱 전환에서 닫히며 Escape 후 초점을 복귀한다', async () => {
  const component = await readFile(componentPath, 'utf8');

  assert.match(component, /event\.key !== 'Escape'/);
  assert.match(component, /menuButtonRef\.current\?\.focus\(\)/);
  assert.match(component, /document\.addEventListener\('keydown', closeOnEscape\)/);
  assert.match(component, /document\.addEventListener\('pointerdown', closeOnOutsidePointer\)/);
  assert.match(component, /headerRef\.current\?\.contains\(event\.target as Node\)/);
  assert.match(component, /matchMedia\('\(min-width: 801px\)'\)/);
  assert.match(component, /desktopQuery\.addEventListener\('change', closeOnDesktop\)/);
});

test('320px 이상 모바일 헤더는 한 줄을 유지하고 메뉴 글자를 끊지 않는다', async () => {
  const css = await readFile(cssPath, 'utf8');
  const mobileCss = css.match(/@media \(max-width: 800px\)\s*\{([\s\S]*)\n\}/)?.[1] ?? '';

  assert.match(css, /\.headerRow\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.brand\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.desktopNav a\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(mobileCss, /\.desktopNav\s*\{[^}]*display:\s*none/);
  assert.match(mobileCss, /\.mobileActions\s*\{[^}]*display:\s*flex/);
  assert.match(mobileCss, /\.mobileAction\s*\{[^}]*min-width:\s*48px/);
  assert.match(mobileCss, /\.mobileAction\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(mobileCss, /\.mobilePanel a\s*\{[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(mobileCss, /word-break:\s*break-all/);
  assert.doesNotMatch(mobileCss, /overflow-x:\s*(auto|scroll)/);
});
