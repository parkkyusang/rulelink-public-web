import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {publicAdvertisingPlacements} from '../src/lib/public-advertising.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [component, componentCss, knowledgePage] = await Promise.all([
  readFile(
    path.join(root, 'src/components/public-advertising-placeholder.tsx'),
    'utf8',
  ),
  readFile(
    path.join(root, 'src/components/public-advertising-placeholder.module.css'),
    'utf8',
  ),
  readFile(path.join(root, 'app/ko/knowledge/[slug]/page.tsx'), 'utf8'),
]);

test('광고 준비 위치는 행동 안내 뒤와 관련 읽기 뒤 두 곳으로 닫혀 있다', () => {
  assert.deepEqual(Object.keys(publicAdvertisingPlacements), [
    'knowledge-after-actions',
    'knowledge-after-related-reading',
  ]);
  const actions = knowledgePage.indexOf('id="actions"');
  const afterActions = knowledgePage.indexOf(
    'placement="knowledge-after-actions"',
  );
  const readingPath = knowledgePage.indexOf('<KnowledgeReadingPath');
  const afterReading = knowledgePage.indexOf(
    'placement="knowledge-after-related-reading"',
  );
  assert.ok(actions >= 0 && afterActions > actions);
  assert.ok(readingPath >= 0 && afterReading > readingPath);
  assert.ok(afterActions > knowledgePage.indexOf('<KnowledgeActionWorkspace'));
  const renderStart = knowledgePage.indexOf('return (');
  assert.doesNotMatch(
    knowledgePage.slice(renderStart, knowledgePage.indexOf('id="summary"')),
    /PublicAdvertisingPlaceholder/,
  );
});

test('광고 준비 UI는 실제 광고코드 없이 명시 라벨과 의미 경계를 가진다', () => {
  assert.match(component, /<aside/);
  assert.match(component, /aria-label=\{`\$\{contract\.label\} 영역`\}/);
  assert.match(component, /data-ad-placement=\{placement\}/);
  assert.match(component, /광고는 법률정보의 설명·공식 근거·/);
  assert.doesNotMatch(component, /<script|dangerouslySetInnerHTML|iframe|adClient/i);
  assert.match(componentCss, /border: 1px dashed var\(--line-strong\)/);
  assert.match(componentCss, /min-width: 0/);
  assert.doesNotMatch(componentCss, /overflow-x:\s*(?:auto|scroll)/);
});

test('공식근거와 authority 카드 내부에는 광고 컴포넌트가 들어가지 않는다', () => {
  const asideStart = knowledgePage.indexOf(
    '<aside className="knowledgeAside">',
  );
  const asideEnd = knowledgePage.indexOf('</aside>', asideStart);
  const authorityStart = knowledgePage.indexOf('<AuthorityReadingSection');
  const authorityEnd = knowledgePage.indexOf('/>', authorityStart);
  assert.doesNotMatch(
    knowledgePage.slice(asideStart, asideEnd),
    /PublicAdvertisingPlaceholder/,
  );
  assert.doesNotMatch(
    knowledgePage.slice(authorityStart, authorityEnd),
    /PublicAdvertisingPlaceholder/,
  );
});
