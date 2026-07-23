import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('조문 카드는 모바일 1열·태블릿 이상 최대 2열이며 가로 넘침을 만들지 않는다', async () => {
  const css = await readFile(path.join(
    appRoot,
    'src',
    'components',
    'authority-reading-section.module.css',
  ), 'utf8');
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /\.card\s*\{[^}]*min-width: 0/s);
  assert.match(css, /white-space: normal/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /scroll-margin-top:/);
  assert.doesNotMatch(css, /overflow-x:\s*(?:auto|scroll)/);
  assert.doesNotMatch(css, /line-clamp|text-overflow:\s*ellipsis/);
  assert.doesNotMatch(css, /grid-auto-flow:\s*column|scroll-snap|carousel/i);
});

test('긴 한국어 제목·원문과 320·390·768·1280·1440 계약을 소스에서 고정한다', async () => {
  const [css, card, tree] = await Promise.all([
    readFile(path.join(
      appRoot,
      'src',
      'components',
      'authority-reading-section.module.css',
    ), 'utf8'),
    readFile(path.join(appRoot, 'src', 'components', 'authority-reading-card.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src', 'components', 'authority-clause-tree.tsx'), 'utf8'),
  ]);
  assert.match(css, /\.card\[data-primary='true'\][\s\S]*grid-column: 1 \/ -1/);
  assert.match(css, /\.card:has\(\.cardDisclosure\[open\]\)[\s\S]*grid-column: 1 \/ -1/);
  assert.match(card, /<h3>\{view\.titleKo\}<\/h3>/);
  assert.doesNotMatch(card, /<summary[^>]*tabIndex=\{-1\}/);
  assert.match(tree, /\{anchor\.officialTextKo\}/);
  assert.match(tree, /tabIndex=\{-1\}/);
  for (const width of [320, 390, 768, 1280, 1440]) {
    assert.ok(
      width < 768
        ? css.includes('@media (max-width: 767px)')
        : css.includes('@media (min-width: 768px)'),
      `${width}px 반응형 계약이 필요합니다.`,
    );
  }
});
