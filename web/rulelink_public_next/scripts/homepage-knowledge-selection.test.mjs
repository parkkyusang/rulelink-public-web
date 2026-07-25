import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {selectHomepageKnowledge} from '../src/lib/homepage-knowledge-selection.ts';
import {
  filterKnowledgeHubDirectoryCategories,
} from '../src/lib/knowledge-hub-directory.ts';
import {
  buildKnowledgeHubDirectoryCategories,
  KNOWLEDGE_HUB_TAXONOMY,
} from '../src/lib/knowledge-hub-taxonomy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(await readFile(
  path.resolve(root, '..', '..', 'artifacts/publication/current/bundle.json'),
  'utf8',
));

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

test('홈 상황별 법률 주제는 초기 HTML의 28개 링크를 보존하는 디렉터리다', async () => {
  const [page, component, css] = await Promise.all([
    readFile(path.join(root, 'app', 'page.tsx'), 'utf8'),
    readFile(path.join(root, 'src', 'components', 'knowledge-hub-directory.tsx'), 'utf8'),
    readFile(path.join(root, 'src', 'components', 'knowledge-hub-directory.module.css'), 'utf8'),
  ]);

  assert.match(page, /import \{KnowledgeHubDirectory\}/);
  assert.match(page, /<KnowledgeHubDirectory hubs=\{knowledgeHubs\} \/>/);
  assert.match(page, /<form action="\/ko\/search"[^>]*method="get"[^>]*role="search"/);
  assert.match(page, /name="q"/);
  assert.match(page, /무슨 일이 있었는지 평소 말로 적어보세요/);
  assert.doesNotMatch(page, /세 가지 시작점|법이 바뀌었나요\?/u);
  assert.ok(
    page.indexOf('<KnowledgeHubDirectory') < page.indexOf('className="changeSection"'),
    '법령변화 모음은 상황별 주제 뒤의 보조 구역이어야 합니다.',
  );
  assert.match(component, /^'use client';/);
  assert.match(component, /보조 탐색/);
  assert.match(component, /생활영역에서 고르기/);
  assert.match(component, /상황별 주제 검색/);
  assert.match(component, /hub\.content_ids\.length/);
  assert.match(component, /관련 안내/);
  assert.match(component, /aria-label="생활영역별 법률 안내"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /categories\.map\(category =>/);
  assert.match(component, /category\.hubs\.map\(hub =>/);
  assert.match(component, /hidden=\{enhanced && !visibleHubIds\.has\(hub\.hub_id\)\}/);
  assert.match(component, /<noscript>/);
  assert.doesNotMatch(component, /핵심|자주 찾는|인기|주제 허브|data-core-topic|전체 주제 보기/u);
  assert.match(css, /\.categories\s*\{[^}]*display:\s*grid/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.links strong\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*keep-all/s);
  assert.match(css, /\.links p\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*keep-all/s);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/);
  assert.doesNotMatch(css, /-webkit-line-clamp|text-overflow:\s*ellipsis/);
});

test('명시적 생활영역 taxonomy는 운영 허브 28개를 중복 없이 7개 영역으로 닫는다', () => {
  const hubs = bundle.knowledge.topic_hubs;
  const categories = buildKnowledgeHubDirectoryCategories(hubs);
  assert.equal(categories.length, 7);
  assert.deepEqual(
    categories.map(category => category.title_ko),
    ['주거·부동산', '돈·채권·재판', '일·사업', '가족·상속·안전', '사고·범죄피해', '소비·행정', '법률 길잡이'],
  );
  assert.deepEqual(
    categories.flatMap(category => category.hubs.map(hub => hub.hub_id)),
    KNOWLEDGE_HUB_TAXONOMY.flatMap(category => [...category.hub_ids]),
  );
  assert.equal(
    new Set(categories.flatMap(category => category.hubs.map(hub => hub.hub_id))).size,
    28,
  );
  assert.ok(
    categories.find(category => category.category_id === 'accident-crime-victim')
      .hubs.some(hub => hub.hub_id === 'hub.voice-phishing-refund'),
  );
  assert.ok(
    !categories.find(category => category.category_id === 'money-debt-litigation')
      .hubs.some(hub => hub.hub_id === 'hub.voice-phishing-refund'),
  );
  assert.throws(
    () => buildKnowledgeHubDirectoryCategories(hubs.slice(1)),
    /정본에 없는 매핑/u,
  );
  assert.throws(
    () => buildKnowledgeHubDirectoryCategories([
      ...hubs,
      {...hubs[0], hub_id: 'hub.unclassified'},
    ]),
    /분류되지 않은 주제/u,
  );
});

test('주제 검색은 영역·제목·설명의 실제 문구만 사용하고 원본 순서를 바꾸지 않는다', () => {
  const hubs = bundle.knowledge.topic_hubs;
  const originalIds = hubs.map(hub => hub.hub_id);
  const categories = buildKnowledgeHubDirectoryCategories(hubs);
  assert.deepEqual(
    filterKnowledgeHubDirectoryCategories(categories, '  주거  ').map(category => category.title_ko),
    ['주거·부동산'],
  );
  assert.deepEqual(
    filterKnowledgeHubDirectoryCategories(categories, '보이스피싱')
      .flatMap(category => category.hubs.map(hub => hub.hub_id)),
    ['hub.voice-phishing-refund'],
  );
  assert.equal(
    filterKnowledgeHubDirectoryCategories(categories, '없는 검색어').length,
    0,
  );
  assert.deepEqual(hubs.map(hub => hub.hub_id), originalIds);
});
