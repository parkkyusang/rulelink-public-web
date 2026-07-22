import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  buildCollectionSearchHref,
  COLLECTION_QUERY_MAX_LENGTH,
  parseCollectionSearchState,
} from '../src/lib/collection-search-state.ts';
import {
  DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE,
  initialProgressiveResultLimit,
  nextProgressiveResultLimit,
} from '../src/lib/progressive-results.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [siteSearch, knowledgeExplorer, sourceLibrary] = await Promise.all([
  readFile(path.join(root, 'src/components/site-search.tsx'), 'utf8'),
  readFile(path.join(root, 'src/components/knowledge-explorer.tsx'), 'utf8'),
  readFile(path.join(root, 'src/components/knowledge-source-library.tsx'), 'utf8'),
]);

test('검색 상태는 허용된 필터와 200자 검색어만 복원한다', () => {
  assert.deepEqual(
    parseCollectionSearchState({
      allowedFilters: ['all', 'deposit', 'inheritance'],
      defaultFilter: 'all',
      filterParam: 'hub',
      search: '?q=%EB%B3%B4%EC%A6%9D%EA%B8%88&hub=inheritance',
    }),
    {filter: 'inheritance', query: '보증금'},
  );
  assert.deepEqual(
    parseCollectionSearchState({
      allowedFilters: ['all', 'statute'],
      defaultFilter: 'all',
      filterParam: 'type',
      search: `?q=${'가'.repeat(COLLECTION_QUERY_MAX_LENGTH + 10)}&type=unknown`,
    }),
    {filter: 'all', query: '가'.repeat(COLLECTION_QUERY_MAX_LENGTH)},
  );
});

test('공유 주소는 검색 조건만 정규화하고 기본값은 생략한다', () => {
  assert.equal(
    buildCollectionSearchHref({
      defaultFilter: 'all',
      filter: 'inheritance',
      filterParam: 'hub',
      hash: '#results',
      pathname: '/ko/knowledge',
      query: '  보증금 반환  ',
    }),
    '/ko/knowledge?q=%EB%B3%B4%EC%A6%9D%EA%B8%88+%EB%B0%98%ED%99%98&hub=inheritance#results',
  );
  assert.equal(
    buildCollectionSearchHref({
      defaultFilter: 'all',
      filter: 'all',
      filterParam: 'type',
      pathname: '/ko/sources',
      query: '   ',
    }),
    '/ko/sources',
  );
});

test('세 검색 화면은 같은 주소 상태 계약을 사용한다', () => {
  assert.match(siteSearch, /parseCollectionSearchState/);
  assert.match(siteSearch, /filterParam: 'type'/);
  assert.match(knowledgeExplorer, /parseCollectionSearchState/);
  assert.match(knowledgeExplorer, /filterParam: 'hub'/);
  assert.match(sourceLibrary, /parseCollectionSearchState/);
  assert.match(sourceLibrary, /filterParam: 'type'/);
  for (const source of [siteSearch, knowledgeExplorer, sourceLibrary]) {
    assert.match(source, /buildCollectionSearchHref/);
    assert.match(source, /sanitizeCollectionQuery/);
  }
});

test('지식 보관함은 전체 검색을 유지하면서 24건씩 점진적으로 펼친다', () => {
  assert.equal(DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE, 24);
  assert.equal(initialProgressiveResultLimit(173), 24);
  assert.equal(initialProgressiveResultLimit(12), 12);
  assert.equal(nextProgressiveResultLimit(173, 24), 48);
  assert.equal(nextProgressiveResultLimit(50, 48), 50);
  assert.equal(nextProgressiveResultLimit(0, 24), 0);
  assert.equal(nextProgressiveResultLimit(50, Number.NaN), 24);

  assert.match(knowledgeExplorer, /visibleDocuments\.slice\(0, visibleLimit\)/);
  assert.match(knowledgeExplorer, /setVisibleLimit\(DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE\)/);
  assert.match(knowledgeExplorer, /controlsId="knowledge-result-grid"/);
  assert.match(knowledgeExplorer, /검색과 주제 필터는 아직 펼치지 않은 지식에도/);
});

test('공식 근거 보관함도 같은 점진 표시 계약으로 전체 검색과 초기 렌더링을 분리한다', () => {
  assert.match(sourceLibrary, /visibleDocuments\.slice\(0, visibleLimit\)/);
  assert.match(sourceLibrary, /setVisibleLimit\(DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE\)/);
  assert.match(sourceLibrary, /controlsId="knowledge-source-result-grid"/);
  assert.match(sourceLibrary, /아직 펼치지 않은 공식 근거에도/);
});
