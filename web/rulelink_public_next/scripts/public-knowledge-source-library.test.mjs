import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const [bundle, projectionSource, pageSource, componentSource, layoutSource, sitemapSource, localSmoke, liveSmoke] = await Promise.all([
  readFile(path.join(repositoryRoot, 'artifacts/publication/current/bundle.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'src/lib/knowledge-search.ts'), 'utf8'),
  readFile(path.join(root, 'app/ko/sources/page.tsx'), 'utf8'),
  readFile(path.join(root, 'src/components/knowledge-source-library.tsx'), 'utf8'),
  readFile(path.join(root, 'app/layout.tsx'), 'utf8'),
  readFile(path.join(root, 'app/sitemap.ts'), 'utf8'),
  readFile(path.join(root, 'scripts/smoke-public-build.mjs'), 'utf8'),
  readFile(path.join(root, 'scripts/smoke-live-publication.mjs'), 'utf8'),
]);

test('공식 근거 역색인은 동일한 참조 해석기로 공개 콘텐츠를 연결한다', () => {
  assert.match(projectionSource, /buildKnowledgeSourceDocuments/);
  assert.match(projectionSource, /createKnowledgeEntryResolver/);
  assert.match(projectionSource, /graph\.sources\.some/);
  assert.match(projectionSource, /relatedDocuments\.map\(document => document\.entry\)/);
  assert.match(projectionSource, /conceptReferencesSource/);
});

test('현재 공개본의 법령과 판례는 연결 콘텐츠를 가진다', () => {
  const knowledge = bundle.knowledge;
  const sourceIds = new Set(knowledge.sources.map(source => source.coordinate_id));
  const scenarioById = new Map(knowledge.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
  const ruleById = new Map(knowledge.rule_cards.map(rule => [rule.rule_id, rule]));
  const connectedSourceIds = new Set();
  for (const entry of knowledge.content_entries) {
    const scenarios = entry.scenario_ids.map(id => scenarioById.get(id)).filter(Boolean);
    const ruleIds = new Set([...entry.rule_ids, ...scenarios.flatMap(scenario => scenario.rule_ids)]);
    const rules = [...ruleIds].map(id => ruleById.get(id)).filter(Boolean);
    for (const sourceId of [
      ...entry.source_coordinate_ids,
      ...scenarios.flatMap(scenario => scenario.source_coordinate_ids),
      ...rules.flatMap(rule => rule.source_coordinate_ids),
    ]) connectedSourceIds.add(sourceId);
  }
  for (const concept of knowledge.concept_cards ?? []) {
    for (const sourceId of [
      ...concept.source_coordinate_ids,
      ...concept.assertions.flatMap(assertion => assertion.source_coordinate_ids),
    ]) connectedSourceIds.add(sourceId);
  }
  for (const sourceId of sourceIds) {
    assert(connectedSourceIds.has(sourceId), `연결 콘텐츠가 없는 공식 근거: ${sourceId}`);
  }
  assert(knowledge.sources.some(source => source.case_number === '2013다73520'), '판례 사건번호 근거가 필요합니다.');
  assert(knowledge.sources.some(source => source.law_name_ko === '민법' && source.article_no === '제1026조'), '법령 조문 근거가 필요합니다.');
});

test('공식 근거 보관함은 검색·원문·연결 안내와 전체 공개 경로에 포함된다', () => {
  assert.match(pageSource, /공식 근거 보관함/);
  assert.match(componentSource, /document\.search_terms_ko/);
  assert.match(componentSource, /browserOfficialSourceUrl/);
  assert.match(componentSource, /document\.entries/);
  assert.match(componentSource, /document\.concepts/);
  assert.match(layoutSource, /href="\/ko\/sources">공식 근거/);
  assert.match(sitemapSource, /\/ko\/sources/);
  assert.match(localSmoke, /\/ko\/sources/);
  assert.match(liveSmoke, /\/ko\/sources/);
});
