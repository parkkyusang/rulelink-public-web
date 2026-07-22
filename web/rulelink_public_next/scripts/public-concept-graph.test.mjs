import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {resolveKnowledgeEntryGraph} from '../src/lib/knowledge-search.ts';

const root = process.cwd();

test('본문 법률용어가 쉬운 뜻 팝오버와 독립 개념 페이지를 함께 제공한다', async () => {
  const component = await read('src/components/legal-concept-text.tsx');
  const detail = await read('app/ko/knowledge/[slug]/page.tsx');
  assert.match(component, /plain_definition_ko/);
  assert.match(component, /\/ko\/concepts\/\$\{concept\.slug\}/);
  assert.match(component, /aria-expanded=\{isOpen\}/);
  assert.match(component, /role="group"/);
  assert.match(component, /개념 페이지에서 근거와 요건 보기/);
  assert.match(detail, /LegalConceptText/);
  assert.match(detail, /본문 용어 해설/);
});

test('개념카드가 지정한 관련 콘텐츠는 역방향 필드가 없어도 같은 개념 그래프로 해석된다', async () => {
  const bundle = JSON.parse(await read('../../artifacts/publication/current/bundle.json'));
  const knowledge = bundle.knowledge;
  let checkedLinks = 0;

  for (const concept of knowledge.concept_cards) {
    for (const contentId of concept.related_content_ids) {
      const entry = knowledge.content_entries.find(candidate => candidate.content_id === contentId);
      assert(entry, `개념 ${concept.concept_id}의 관련 콘텐츠가 없습니다: ${contentId}`);
      const graph = resolveKnowledgeEntryGraph(knowledge, entry);
      assert(
        graph.concepts.some(candidate => candidate.concept_id === concept.concept_id),
        `관련 콘텐츠에서 개념을 역해석하지 못했습니다: ${concept.concept_id} -> ${contentId}`,
      );
      checkedLinks += 1;
    }
  }

  assert(checkedLinks > 0, '실제 공개 개념과 콘텐츠 연결을 하나 이상 검사해야 합니다.');
});

test('개념 상세는 요건 효과 한계와 문장별 공식 근거를 노출한다', async () => {
  const detail = await read('app/ko/concepts/[slug]/page.tsx');
  for (const phrase of ['요건·효과·한계', '문장별 공식 근거', 'source_coordinate_ids', '공식 근거']) {
    assert.ok(detail.includes(phrase), `개념 상세에 필수 구역이 없습니다: ${phrase}`);
  }
});

test('개념 경로는 상단 메뉴 사이트맵 RSS와 운영 스모크에 연결된다', async () => {
  const layout = await read('app/layout.tsx');
  const sitemap = await read('app/sitemap.ts');
  const feed = await read('app/feed.xml/route.ts');
  const smoke = await read('scripts/smoke-public-build.mjs');
  assert.match(layout, /\/ko\/concepts/);
  assert.match(sitemap, /listConceptCards/);
  assert.match(feed, /conceptItems/);
  assert.match(smoke, /concept_cards/);
});

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}
