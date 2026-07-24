import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {buildChangeBriefStructuredData} from '../src/lib/change-brief-structured-data.ts';

const input = {
  articleNo: '제25조',
  dateModified: '2026-07-24T00:00:00Z',
  description: '법령변화의 시행시점과 영향을 설명합니다.',
  lawNameKo: '예시법',
  officialSourceUrls: ['https://www.law.go.kr/법령/예시법/제25조', 'https://www.law.go.kr/법령/예시법/제25조'],
  pageUrl: 'https://example.test/ko/changes/example',
  siteName: 'RuleLink',
  siteUrl: 'https://example.test',
  title: '예시 법령변화',
};

test('법령변화 Article과 화면 경로에 일치하는 BreadcrumbList를 함께 만든다', () => {
  const value = buildChangeBriefStructuredData(input);
  assert.equal(value['@context'], 'https://schema.org');
  assert.deepEqual(value['@graph'].map(item => item['@type']), ['Article', 'BreadcrumbList']);
  const [article, breadcrumb] = value['@graph'];
  assert.equal(article.headline, input.title);
  assert.equal(article.breadcrumb['@id'], breadcrumb['@id']);
  assert.deepEqual(article.isBasedOn, ['https://www.law.go.kr/법령/예시법/제25조']);
  assert.deepEqual(
    breadcrumb.itemListElement.map(item => [item.position, item.name, item.item]),
    [
      [1, '홈', 'https://example.test'],
      [2, '법령 변화', 'https://example.test/ko/changes'],
      [3, input.title, input.pageUrl],
    ],
  );
});

test('사이트 URL을 입력으로만 받아 새 운영 도메인을 하드코딩하지 않는다', async () => {
  const source = await readFile(path.resolve('src/lib/change-brief-structured-data.ts'), 'utf8');
  assert.doesNotMatch(source, /rulelink\.lolphysical\.xyz/u);
  const other = buildChangeBriefStructuredData({
    ...input,
    pageUrl: 'https://new.example/ko/changes/example',
    siteUrl: 'https://new.example',
  });
  assert.equal(other['@graph'][1].itemListElement[0].item, 'https://new.example');
  const trailingSlash = buildChangeBriefStructuredData({
    ...input,
    siteUrl: 'https://new.example/',
  });
  assert.equal(trailingSlash['@graph'][1].itemListElement[0].item, 'https://new.example');
});

test('법령변화 페이지는 공용 구조화 데이터 도우미를 사용한다', async () => {
  const source = await readFile(path.resolve('app/ko/changes/[slug]/page.tsx'), 'utf8');
  assert.match(source, /buildChangeBriefStructuredData/u);
  assert.doesNotMatch(source, /'@type': 'Article'/u);
});
