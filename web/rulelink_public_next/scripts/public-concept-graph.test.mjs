import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('본문 법률용어가 쉬운 뜻 팝오버와 독립 개념 페이지를 함께 제공한다', async () => {
  const component = await read('src/components/legal-concept-text.tsx');
  const detail = await read('app/ko/knowledge/[slug]/page.tsx');
  assert.match(component, /plain_definition_ko/);
  assert.match(component, /\/ko\/concepts\/\$\{concept\.slug\}/);
  assert.match(component, /role="note"/);
  assert.match(detail, /LegalConceptText/);
  assert.match(detail, /본문 용어 해설/);
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
