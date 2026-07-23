import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

import {splitTextByConceptTerms} from '../src/lib/concept-terms.ts';

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
  assert.match(page, /<LegalConceptLayer>[\s\S]*<main className="knowledgePage">/);
  assert.match(component, /createContext<ConceptLayerContextValue/);
  assert.match(component, /activePopoverId: string \| null/);
  assert.match(component, /setActivePopoverId\(popoverId\)/);
  assert.match(component, /setActivePopoverId\(current => current === popoverId \? null : current\)/);
  assert.match(component, /useHover\(context, \{[\s\S]*safePolygon[\s\S]*mouseOnly: true/);
  assert.match(component, /useFocus\(context, \{visibleOnly: true\}\)/);
  assert.match(component, /useClick\(context, \{event: 'click', stickIfOpen: true, toggle: true\}\)/);
  assert.match(component, /useDismiss\(context, \{[\s\S]*escapeKey: true[\s\S]*outsidePress: true[\s\S]*outsidePressEvent: 'pointerdown'/);
  assert.match(component, /reason === 'escape-key'/);
  assert.match(component, /requestAnimationFrame\(\(\) => triggerRef\.current\?\.focus\(\)\)/);
  assert.match(component, /'aria-controls': popoverId/);
  assert.match(component, /'aria-expanded': isOpen/);
  assert.match(component, /href=\{`\/ko\/concepts\/\$\{concept\.slug\}`\}/);
  assert.match(component, /role: 'dialog'/);
  assert.match(component, /'aria-haspopup': 'dialog'/);
  assert.match(component, /'aria-labelledby': titleId/);
  assert.match(component, /'aria-describedby': descriptionId/);
  assert.match(component, /closeAndRestoreFocus/);
  assert.match(component, /<FloatingPortal id=\{conceptLayerId\}>/);
  assert.match(component, /<FloatingFocusManager[^>]*initialFocus=\{-1\}[^>]*modal=\{false\}[^>]*returnFocus=\{false\}/);
  assert.match(component, /tabIndex: -1/);
  assert.match(component, /strategy: 'fixed'/);
  assert.match(component, /flip\(\{fallbackAxisSideDirection: 'start', padding: 12\}\)/);
  assert.match(component, /shift\(\{crossAxis: true, padding: 12\}\)/);
  assert.match(component, /whileElementsMounted: autoUpdate/);
  assert.match(css, /\.popover\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*1000/s);
  assert.doesNotMatch(css, /\.popover\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.popover\[data-layout='sheet'\][\s\S]*bottom: max\(12px, env\(safe-area-inset-bottom\)\)[\s\S]*left: 12px[\s\S]*right: 12px/);
  assert.match(page, /누르거나 키보드로 선택하면 쉬운 뜻이 나타나고/);
});

test('운영 상속 문구의 React 장식 fixture는 한 토큰에 한 버튼만 만들고 부분 문자열을 중첩하지 않는다', () => {
  const fixtures = [
    {
      expected: ['피상속인', '법정상속인'],
      terms: ['상속인', '법정상속인', '피상속인'],
      text: '피상속인의 법정상속인이 될 수 있는 친족',
    },
    {
      expected: ['공동상속인', '단독상속인'],
      terms: ['상속인', '공동상속인', '단독상속인'],
      text: '배우자는 직계비속 또는 직계존속과 동순위 공동상속인이 되고 그들이 없으면 단독상속인이 된다.',
    },
  ];

  for (const fixture of fixtures) {
    const termSet = new Set(fixture.terms);
    const parts = splitTextByConceptTerms(fixture.text, fixture.terms);
    const decorated = parts.filter(part => termSet.has(part));
    const markup = renderToStaticMarkup(createElement(
      'span',
      {'data-testid': 'concept-text-fixture'},
      ...parts.map((part, index) => termSet.has(part)
        ? createElement('button', {'data-concept-term': part, key: `${part}-${index}`}, part)
        : part),
    ));

    assert.deepEqual(decorated, fixture.expected);
    assert.equal((markup.match(/<button\b/gu) ?? []).length, fixture.expected.length);
    assert.equal((markup.match(/data-concept-term="상속인"/gu) ?? []).length, 0);
    assert.equal(markup.replace(/<[^>]+>/gu, ''), fixture.text);
  }
});
