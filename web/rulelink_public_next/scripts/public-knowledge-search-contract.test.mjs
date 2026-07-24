import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [bundle, projectionSource, rankingSource, siteSearchSource, siteSearchPublicationSource, searchPageSource, searchRouteSource, knowledgeExplorerSource] = await Promise.all([
  readFile(path.resolve(root, '..', '..', 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'src', 'lib', 'knowledge-search.ts'), 'utf8'),
  readFile(path.join(root, 'src', 'lib', 'knowledge-search-ranking.ts'), 'utf8'),
  readFile(path.join(root, 'src', 'components', 'site-search.tsx'), 'utf8'),
  readFile(path.join(root, 'src', 'lib', 'site-search-publication.ts'), 'utf8'),
  readFile(path.join(root, 'app', 'ko', 'search', 'page.tsx'), 'utf8'),
  readFile(path.join(root, 'app', 'search-index.json', 'route.ts'), 'utf8'),
  readFile(path.join(root, 'src', 'components', 'knowledge-explorer.tsx'), 'utf8'),
]);

test('공개 지식 검색 투영은 짧은 의미 필드와 공식 근거만 연결한다', () => {
  assert.match(projectionSource, /resolveKnowledgeEntryGraph/);
  assert.match(projectionSource, /createKnowledgeEntryResolver/);
  assert.match(projectionSource, /search_intents_ko: entry\.search_intents_ko/);
  assert.match(projectionSource, /evidence_labels_ko/);
  assert.doesNotMatch(projectionSource, /\.\.\.entry\.body_sections/u);
  assert.doesNotMatch(projectionSource, /\.\.\.graph\.rules\.flatMap\(ruleTerms\)/u);
  assert.doesNotMatch(projectionSource, /\.\.\.graph\.scenarios\.flatMap\(scenarioTerms\)/u);
});

test('사건번호와 조문번호 근거가 연결된 공개 콘텐츠가 실제 번들에 존재한다', () => {
  const knowledge = bundle.knowledge;
  const precedent = knowledge.sources.find(source => source.case_number === '2013다73520');
  assert(precedent, '2013다73520 판례 근거가 필요합니다.');
  const entry = knowledge.content_entries.find(candidate => candidate.content_id === 'content.estate-disposal-before-renunciation');
  assert(entry?.source_coordinate_ids.includes(precedent.coordinate_id), '상속재산 처분 콘텐츠가 판례 근거를 직접 참조해야 합니다.');
  const statute = knowledge.sources.find(source => source.law_name_ko === '민법' && source.article_no === '제1026조');
  assert(statute, '민법 제1026조 근거가 필요합니다.');
  assert(entry.source_coordinate_ids.includes(statute.coordinate_id), '상속재산 처분 콘텐츠가 민법 제1026조를 직접 참조해야 합니다.');
});

test('통합검색과 지식 보관함은 검색 투영과 연결 근거 표지를 사용한다', () => {
  assert.match(siteSearchPublicationSource, /buildSiteSearchDocuments/);
  assert.match(siteSearchSource, /rankSiteSearchDocuments/);
  assert.match(siteSearchSource, /fetch\(indexHref/);
  assert.match(siteSearchSource, /rulelink_public_search_index_v1/);
  assert.match(siteSearchSource, /matchReasons/);
  for (const source of [siteSearchSource, rankingSource]) assert.match(source, /evidence_labels_ko|evidenceLabels/u);
  assert.match(rankingSource, /document\.search_terms_ko/);
  for (const source of [siteSearchSource, knowledgeExplorerSource]) assert.match(source, /연결 근거/);
});

test('지식 보관함은 검색 관련도 정렬과 압축된 주제 선택을 사용한다', () => {
  assert.match(knowledgeExplorerSource, /filterAndRankKnowledgeDocuments/);
  assert.match(knowledgeExplorerSource, /id="knowledge-hub-filter"/);
  assert.match(knowledgeExplorerSource, /<select/);
  assert.doesNotMatch(knowledgeExplorerSource, /className=\{styles\.filters\}/);
  assert.match(projectionSource, /카드 표시 필드만 전달한다/);
  assert.doesNotMatch(projectionSource, /entry:\s*entry,/);
});

test('통합검색은 전체 검색 투영을 유지하고 화면 카드만 점진적으로 표시한다', () => {
  assert.match(siteSearchSource, /const visibleResults = useMemo/);
  assert.match(siteSearchSource, /const displayedResults = visibleResults\.slice\(0, visibleLimit\)/);
  assert.match(siteSearchSource, /ProgressiveResultFooter/);
  assert.match(siteSearchSource, /nextProgressiveResultLimit\(total, current\)/);
  assert.match(searchPageSource, /slice\(0, initialProgressiveResultLimit\(documents\.length\)\)/);
  assert.match(searchPageSource, /hasPart: initialParts\.map/);
  assert.match(searchRouteSource, /documents: await loadSiteSearchDocuments\(\)/);
});
