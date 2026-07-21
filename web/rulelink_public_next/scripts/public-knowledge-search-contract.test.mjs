import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [bundle, projectionSource, siteSearchSource, knowledgeExplorerSource] = await Promise.all([
  readFile(path.resolve(root, '..', '..', 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'src', 'lib', 'knowledge-search.ts'), 'utf8'),
  readFile(path.join(root, 'src', 'components', 'site-search.tsx'), 'utf8'),
  readFile(path.join(root, 'src', 'components', 'knowledge-explorer.tsx'), 'utf8'),
]);

test('공개 지식 검색 투영은 콘텐츠에서 사실분기·법리·공식 근거까지 연결한다', () => {
  assert.match(projectionSource, /entry\.scenario_ids/);
  assert.match(projectionSource, /scenario\.rule_ids/);
  assert.match(projectionSource, /rule\.source_coordinate_ids/);
  assert.match(projectionSource, /scenario\.source_coordinate_ids/);
  assert.match(projectionSource, /source\.case_number/);
  assert.match(projectionSource, /source\.article_no/);
  assert.match(projectionSource, /\.\.\.entry\.search_intents_ko/);
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
  for (const source of [siteSearchSource, knowledgeExplorerSource]) {
    assert.match(source, /document\.search_terms_ko/);
    assert.match(source, /document\.evidence_labels_ko/);
    assert.match(source, /연결 근거/);
  }
});
