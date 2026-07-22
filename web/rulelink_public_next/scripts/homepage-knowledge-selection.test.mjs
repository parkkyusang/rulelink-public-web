import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {selectHomepageKnowledge} from '../src/lib/homepage-knowledge-selection.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function entry(content_id, reviewed_at, hub_ids, title_ko = content_id) {
  return {content_id, reviewed_at, hub_ids, title_ko};
}

test('홈 대표 지식은 최신순 안에서 주제의 폭을 먼저 확보한다', () => {
  const entries = [
    entry('hub-a-old', '2026-07-20T00:00:00Z', ['hub-a']),
    entry('without-hub-newest', '2026-07-24T00:00:00Z', []),
    entry('hub-a-new', '2026-07-23T00:00:00Z', ['hub-a']),
    entry('hub-b-new', '2026-07-22T00:00:00Z', ['hub-b']),
    entry('hub-c-new', '2026-07-21T00:00:00Z', ['hub-c']),
  ];

  assert.deepEqual(
    selectHomepageKnowledge(entries, 3).map(item => item.content_id),
    ['hub-a-new', 'hub-b-new', 'hub-c-new'],
  );
  assert.deepEqual(
    selectHomepageKnowledge(entries, 4).map(item => item.content_id),
    ['hub-a-new', 'hub-b-new', 'hub-c-new', 'without-hub-newest'],
  );
});

test('홈 대표 지식 선택은 원본 순서를 바꾸지 않고 제한값을 지킨다', () => {
  const entries = [
    entry('older', '2026-07-20T00:00:00Z', ['hub-a']),
    entry('newer', '2026-07-21T00:00:00Z', ['hub-a']),
  ];
  const originalOrder = entries.map(item => item.content_id);

  assert.deepEqual(selectHomepageKnowledge(entries, 1).map(item => item.content_id), ['newer']);
  assert.deepEqual(entries.map(item => item.content_id), originalOrder);
  assert.deepEqual(selectHomepageKnowledge(entries, 0), []);
});

test('홈 주제 허브는 횡스크롤 레일이 아니라 전체가 펼쳐지는 반응형 디렉터리다', async () => {
  const [page, component, css] = await Promise.all([
    readFile(path.join(root, 'app', 'page.tsx'), 'utf8'),
    readFile(path.join(root, 'src', 'components', 'knowledge-hub-directory.tsx'), 'utf8'),
    readFile(path.join(root, 'src', 'components', 'knowledge-hub-directory.module.css'), 'utf8'),
  ]);

  assert.match(page, /import \{KnowledgeHubDirectory\}/);
  assert.match(page, /<KnowledgeHubDirectory hubs=\{knowledgeHubs\} \/>/);
  assert.match(component, /주제별로 전체 보기/);
  assert.match(component, /hub\.content_ids\.length/);
  assert.match(component, /aria-label="주제별 생활법률 지식"/);
  assert.match(css, /\.grid\s*\{[^}]*display:\s*grid/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 280px\), 1fr\)\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.title\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*keep-all/s);
  assert.match(css, /\.description\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*keep-all/s);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/);
  assert.doesNotMatch(css, /-webkit-line-clamp|text-overflow:\s*ellipsis/);
});
