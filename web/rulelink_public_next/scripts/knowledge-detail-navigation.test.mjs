import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = path.join(root, 'app', 'ko', 'knowledge', '[slug]', 'page.tsx');
const cssPath = path.join(root, 'app', 'globals.css');
const sourceJumpPath = path.join(root, 'src', 'components', 'official-source-jump.tsx');
const conceptTextPath = path.join(root, 'src', 'components', 'legal-concept-text.tsx');
const conceptTextCssPath = path.join(root, 'src', 'components', 'legal-concept-text.module.css');

test('긴 생활법률 상세 화면은 핵심 법리부터 공식 근거까지 바로 이동할 수 있다', async () => {
  const [page, css, sourceJump] = await Promise.all([
    readFile(pagePath, 'utf8'),
    readFile(cssPath, 'utf8'),
    readFile(sourceJumpPath, 'utf8'),
  ]);

  assert.match(page, /aria-label="이 글 안에서 이동"/);
  for (const section of ['summary', 'rules', 'scenarios', 'actions']) {
    assert.match(page, new RegExp(`href="#${section}"`), `바로가기 누락: ${section}`);
    assert.match(page, new RegExp(`id="${section}"`), `대상 구역 누락: ${section}`);
  }
  assert.match(page, /OfficialSourceJump targetId="sources"/);
  assert.match(page, /id="sources"/);
  assert.match(sourceJump, /matchMedia\('\(max-width: 800px\)'\)/);
  assert.match(sourceJump, /scrollIntoView/);
  assert.match(sourceJump, /classList\.add\('sourceAttention'\)/);
  assert.match(css, /\.knowledgeSectionNav\s*\{/);
  const knowledgeSectionNavRule = css.match(/\.knowledgeSectionNav\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(knowledgeSectionNavRule, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(knowledgeSectionNavRule, /overflow-x:\s*auto/);
  assert.match(css, /\.knowledgeSection[^}]*scroll-margin-top:/);
  assert.match(css, /\.knowledgeAside[^}]*position:\s*sticky/);
  assert.match(css, /\.ruleCard\[id\][^}]*scroll-margin-top:/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*\.knowledgeAside\s*\{position:\s*static;/);
});

test('모바일 상세 목차는 가로 넘김 없이 모든 항목을 여러 줄로 보여준다', async () => {
  const css = await readFile(cssPath, 'utf8');
  const mobileCss = css.match(/@media \(max-width: 800px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  const knowledgeNavRule = mobileCss.match(/\.knowledgeSectionNav\s*\{([^}]*)\}/)?.[1] ?? '';
  const issueNavRule = mobileCss.match(/\.sectionNav\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.match(knowledgeNavRule, /position:\s*static/);
  assert.doesNotMatch(knowledgeNavRule, /overflow-x:\s*auto/);
  assert.match(mobileCss, /\.knowledgeSectionNav a, \.knowledgeSectionNav button\s*\{[^}]*flex:\s*1 1 calc\(33\.333% - 5px\)/);
  assert.match(issueNavRule, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(issueNavRule, /overflow-x:\s*auto/);
});

test('법률용어 해설은 마우스 전용이 아니며 클릭·탭·키보드에서 뜻과 독립 페이지를 함께 제공한다', async () => {
  const [page, component, css] = await Promise.all([
    readFile(pagePath, 'utf8'),
    readFile(conceptTextPath, 'utf8'),
    readFile(conceptTextCssPath, 'utf8'),
  ]);

  assert.match(component, /^'use client';/);
  assert.match(component, /<button[\s\S]*aria-controls=\{popoverId\}[\s\S]*aria-expanded=\{isOpen\}/);
  assert.match(component, /onClick=\{\(\) => setOpenTermKey/);
  assert.match(component, /event\.key !== 'Escape'/);
  assert.match(component, /document\.addEventListener\('pointerdown'/);
  assert.match(component, /href=\{`\/ko\/concepts\/\$\{concept\.slug\}`\}/);
  assert.match(component, /role="group"/);
  assert.match(css, /\.term\[data-open='true'\] \.popover/);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*position:\s*fixed/);
  assert.match(page, /누르거나 키보드로 선택하면 쉬운 뜻이 나타나고/);
});
