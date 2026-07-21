import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  buildKnowledgeHubStructuredData,
  buildKnowledgePageStructuredData,
} from '../src/lib/public-structured-data.ts';
import {serializeStructuredData} from '../src/lib/structured-data.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [knowledgePage, hubPage, layout] = await Promise.all([
  readFile(path.join(root, 'app/ko/knowledge/[slug]/page.tsx'), 'utf8'),
  readFile(path.join(root, 'app/ko/hubs/[slug]/page.tsx'), 'utf8'),
  readFile(path.join(root, 'app/layout.tsx'), 'utf8'),
]);

test('생활법률 상세 구조화 데이터는 기준일·공식 근거·법리·사실분기와 현재 위치를 연결한다', () => {
  const result = buildKnowledgePageStructuredData({
    audience: '임대차 보증금을 돌려받지 못한 사람',
    breadcrumbs: [
      {name: '홈', url: 'https://rulelink.example'},
      {name: '생활법률 지식', url: 'https://rulelink.example/ko/knowledge'},
      {name: '보증금 반환', url: 'https://rulelink.example/ko/knowledge/deposit'},
    ],
    description: '보증금 반환 절차를 확인합니다.',
    expiresAt: '2026-10-21T00:00:00Z',
    officialSources: [
      {name: '주택임대차보호법 제3조의3', url: 'https://law.example/statute'},
      {name: '중복 근거', url: 'https://law.example/statute'},
    ],
    pageUrl: 'https://rulelink.example/ko/knowledge/deposit',
    reviewedAt: '2026-07-21T00:00:00Z',
    rules: [{name: '임차권등기명령', description: '요건을 갖추면 신청할 수 있습니다.'}],
    scenarios: [{
      decisionFact: '임대차가 종료되었는지',
      falseOutcome: '종료 요건을 먼저 확인합니다.',
      question: '임대차가 끝났나요?',
      trueOutcome: '반환 및 등기 절차를 확인합니다.',
    }],
    searchIntents: ['보증금 반환'],
    siteName: 'RuleLink',
    siteUrl: 'https://rulelink.example/',
    title: '보증금을 돌려받지 못했다면',
  });
  const [page, breadcrumb] = result['@graph'];
  assert.equal(page['@type'], 'WebPage');
  assert.equal(page.lastReviewed, '2026-07-21T00:00:00Z');
  assert.equal(page.isBasedOn.length, 1);
  assert.equal(page.isBasedOn[0].name, '주택임대차보호법 제3조의3');
  assert.equal(page.about[0].name, '임차권등기명령');
  assert.match(page.hasPart[0].text, /해당하면:/);
  assert.equal(page.isPartOf['@id'], 'https://rulelink.example/#website');
  assert.equal(breadcrumb['@type'], 'BreadcrumbList');
  assert.deepEqual(breadcrumb.itemListElement.map(item => item.position), [1, 2, 3]);
  assert.doesNotMatch(serializeStructuredData({...result, unsafe: '<script>'}), /<script>/);
});

test('지식 허브 구조화 데이터는 순서 있는 글 목록과 최신 기준일을 제공한다', () => {
  const result = buildKnowledgeHubStructuredData({
    breadcrumbs: [
      {name: '홈', url: 'https://rulelink.example'},
      {name: '상속', url: 'https://rulelink.example/ko/hubs/inheritance'},
    ],
    description: '상속의 주요 갈래를 확인합니다.',
    entries: [
      {dateModified: '2026-07-20', description: '첫 글', name: '승인', url: 'https://rulelink.example/a'},
      {dateModified: '2026-07-21', description: '둘째 글', name: '포기', url: 'https://rulelink.example/b'},
    ],
    pageUrl: 'https://rulelink.example/ko/hubs/inheritance',
    siteName: 'RuleLink',
    siteUrl: 'https://rulelink.example',
    title: '상속',
  });
  const [page, items, breadcrumb] = result['@graph'];
  assert.equal(page['@type'], 'CollectionPage');
  assert.equal(page.dateModified, '2026-07-21');
  assert.equal(page.numberOfItems, 2);
  assert.equal(items['@type'], 'ItemList');
  assert.deepEqual(items.itemListElement.map(item => item.position), [1, 2]);
  assert.equal(items.itemListElement[1].item.name, '포기');
  assert.equal(breadcrumb.itemListElement.at(-1).name, '상속');
});

test('공개 페이지는 공통 생성기를 사용하고 웹사이트 식별자를 공유한다', () => {
  assert.match(knowledgePage, /buildKnowledgePageStructuredData/);
  assert.match(hubPage, /buildKnowledgeHubStructuredData/);
  assert.match(layout, /'@id': `\$\{site\.url\}\/\#website`/);
  assert.doesNotMatch(knowledgePage, /'@type': 'WebPage',\s*'@id': canonicalUrl/);
  assert.doesNotMatch(hubPage, /'@type': 'CollectionPage',\s*'@id': canonicalUrl/);
});
