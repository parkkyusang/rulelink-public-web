import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = path.join(root, 'app', 'ko', 'knowledge', '[slug]', 'page.tsx');
const cssPath = path.join(root, 'app', 'globals.css');

test('긴 생활법률 상세 화면은 핵심 법리부터 공식 근거까지 바로 이동할 수 있다', async () => {
  const [page, css] = await Promise.all([
    readFile(pagePath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(page, /aria-label="이 글 안에서 이동"/);
  for (const section of ['summary', 'rules', 'scenarios', 'actions', 'sources']) {
    assert.match(page, new RegExp(`href="#${section}"`), `바로가기 누락: ${section}`);
    assert.match(page, new RegExp(`id="${section}"`), `대상 구역 누락: ${section}`);
  }
  assert.match(css, /\.knowledgeSectionNav\s*\{/);
  assert.match(css, /\.knowledgeSection[^}]*scroll-margin-top:/);
  assert.match(css, /\.knowledgeAside[^}]*position:\s*sticky/);
  assert.match(css, /\.ruleCard\[id\][^}]*scroll-margin-top:/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*\.knowledgeAside\s*\{position:\s*static;/);
});
