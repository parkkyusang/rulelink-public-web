import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  inlineTermsForConcept,
  splitTextByConceptTerms,
  validateConceptTermRelations,
} from '../src/lib/concept-terms.ts';
import {resolveKnowledgeEntryGraph} from '../src/lib/knowledge-search.ts';

const root = process.cwd();

test('본문 법률용어가 쉬운 뜻 팝오버와 독립 개념 페이지를 함께 제공한다', async () => {
  const component = await read('src/components/legal-concept-text.tsx');
  const detail = await read('app/ko/knowledge/[slug]/page.tsx');
  assert.match(component, /plain_definition_ko/);
  assert.match(component, /inlineTermsForConcept/);
  assert.doesNotMatch(component, /\.\.\.concept\.aliases_ko/);
  assert.match(component, /\/ko\/concepts\/\$\{activePart\.concept\.slug\}/);
  assert.match(component, /aria-expanded=\{isOpen\}/);
  assert.match(component, /role="group"/);
  assert.match(component, /개념 페이지에서 근거와 요건 보기/);
  assert.match(detail, /LegalConceptText/);
  assert.match(detail, /본문 용어 해설/);
});

test('검색 관련어는 근거 있는 완전 동의어·약어·표기변형만 같은 본문 해설을 쓴다', () => {
  const terms = inlineTermsForConcept({
    preferred_term_ko: '상속인',
    term_relations: [
      {term_ko: '법정상속인', relation: 'narrower', source_coordinate_ids: ['source.1000']},
      {term_ko: '공동상속인', relation: 'related', source_coordinate_ids: ['source.1003']},
      {term_ko: '상속권자', relation: 'exact_synonym', source_coordinate_ids: ['source.1005']},
      {term_ko: '상속자', relation: 'exact_synonym', source_coordinate_ids: []},
    ],
  });

  assert.deepEqual(terms, ['상속인', '상속권자']);
});

test('짧은 개념어는 긴 복합 법률용어 안에서 부분 일치하지 않는다', () => {
  const sentence = '피상속인과 법정상속인·공동상속인을 확인한 상속인은 기간을 지킨다.';
  const genericParts = splitTextByConceptTerms(sentence, ['상속인']);

  assert.equal(genericParts.join(''), sentence);
  assert.equal(genericParts.filter(part => part === '상속인').length, 1);
  assert.ok(genericParts.some(part => part.includes('피상속인과 법정상속인·공동상속인을')));

  const distinctParts = splitTextByConceptTerms(
    sentence,
    ['상속인', '법정상속인', '공동상속인'],
  );
  assert.equal(distinctParts.filter(part => part === '법정상속인').length, 1);
  assert.equal(distinctParts.filter(part => part === '공동상속인').length, 1);
  assert.equal(distinctParts.filter(part => part === '상속인').length, 1);
});

test('용어 관계 계약은 관계 미분류·근거 누락·본문 자동 해설 중복을 차단한다', () => {
  const sources = [
    {coordinate_id: 'source.1000'},
    {coordinate_id: 'source.1003'},
    {coordinate_id: 'source.1005'},
  ];
  const valid = {
    concept_id: 'concept.heir',
    preferred_term_ko: '상속인',
    aliases_ko: ['법정상속인', '공동상속인', '상속권자'],
    term_relations: [
      {term_ko: '법정상속인', relation: 'narrower', source_coordinate_ids: ['source.1000']},
      {term_ko: '공동상속인', relation: 'related', source_coordinate_ids: ['source.1003']},
      {term_ko: '상속권자', relation: 'exact_synonym', source_coordinate_ids: ['source.1005']},
    ],
  };

  assert.doesNotThrow(() => validateConceptTermRelations([valid], sources));
  assert.throws(
    () => validateConceptTermRelations([{...valid, term_relations: valid.term_relations.slice(0, 2)}], sources),
    /관계 분류가 없습니다/,
  );
  assert.throws(
    () => validateConceptTermRelations([
      valid,
      {
        concept_id: 'concept.second',
        preferred_term_ko: '다른 개념',
        aliases_ko: ['상속권자'],
        term_relations: [
          {term_ko: '상속권자', relation: 'exact_synonym', source_coordinate_ids: ['source.1005']},
        ],
      },
    ], sources),
    /여러 개념에 중복되었습니다/,
  );
});

test('법률용어 팝오버는 카드 overflow와 무관한 충돌 회피 포털에 표시된다', async () => {
  const [component, popover] = await Promise.all([
    read('src/components/legal-concept-text.tsx'),
    read('src/components/legal-concept-text.module.css'),
  ]);
  assert.match(component, /FloatingPortal/);
  assert.match(component, /strategy: 'fixed'/);
  assert.match(component, /flip\(/);
  assert.match(component, /shift\(/);
  assert.match(component, /size\(/);
  assert.match(component, /refs\.setFloating/);
  assert.match(popover, /\.popover \{[^}]*position: fixed;[^}]*z-index: 1000;/s);
  assert.doesNotMatch(popover, /\.popover \{[^}]*position: absolute;/s);
});

test('개념 생산 계약은 후보 수집부터 근거·관계 검증과 축적 우선순위를 고정한다', async () => {
  const contract = await read('../../docs/PUBLIC_CONCEPT_TERM_RELATION_CONTRACT_KO.md');
  for (const phrase of ['검색 표현과 본문 자동 해설의 분리', '생산 절차', '축적 우선순위', '잘못된 설명보다 미표시가 우선']) {
    assert.match(contract, new RegExp(phrase));
  }
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
  const [layout, header] = await Promise.all([
    read('app/layout.tsx'),
    read('src/components/site-header.tsx'),
  ]);
  const sitemap = await read('app/sitemap.ts');
  const feed = await read('app/feed.xml/route.ts');
  const smoke = await read('scripts/smoke-public-build.mjs');
  assert.match(layout, /<SiteHeader/);
  assert.match(header, /\/ko\/concepts/);
  assert.match(sitemap, /listConceptCards/);
  assert.match(feed, /conceptItems/);
  assert.match(smoke, /concept_cards/);
});

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}
