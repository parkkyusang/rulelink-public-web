import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {buildKnowledgeSourceDocuments} from '../src/lib/knowledge-search.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const bundle = JSON.parse(await readFile(path.join(repoRoot, 'artifacts/publication/current/bundle.json'), 'utf8'));
const knowledge = bundle.knowledge;
const documents = buildKnowledgeSourceDocuments(knowledge);

test('공식 근거 보관함은 상세 콘텐츠와 개념의 경량 연결 정보만 전달한다', () => {
  for (const document of documents) {
    for (const entry of document.entries) {
      assert.deepEqual(Object.keys(entry).sort(), ['content_id', 'content_type', 'slug', 'title_ko']);
    }
    for (const concept of document.concepts) {
      assert.deepEqual(Object.keys(concept).sort(), ['concept_id', 'preferred_term_ko', 'slug']);
    }
  }
});

test('경량 투영은 모든 연결과 근거 좌표를 보존하면서 반복 상세 본문을 제거한다', () => {
  const entryById = new Map(knowledge.content_entries.map(entry => [entry.content_id, entry]));
  const conceptById = new Map((knowledge.concept_cards ?? []).map(concept => [concept.concept_id, concept]));
  const expandedDocuments = documents.map(document => ({
    ...document,
    entries: document.entries.map(entry => entryById.get(entry.content_id)),
    concepts: document.concepts.map(concept => conceptById.get(concept.concept_id)),
  }));
  const compactBytes = Buffer.byteLength(JSON.stringify(documents));
  const expandedBytes = Buffer.byteLength(JSON.stringify(expandedDocuments));

  assert.equal(new Set(documents.flatMap(document => document.source_coordinate_ids)).size, knowledge.sources.length);
  assert(documents.flatMap(document => document.entries).every(entry => entryById.has(entry.content_id)));
  assert(documents.flatMap(document => document.concepts).every(concept => conceptById.has(concept.concept_id)));
  assert(compactBytes < expandedBytes * 0.35, `경량 ${compactBytes}바이트 / 전체 참조 ${expandedBytes}바이트`);
});

test('근거 검색어는 문서별로 중복되지 않고 상세 페이지 전체 문장을 복제하지 않는다', () => {
  for (const document of documents) {
    assert.equal(new Set(document.search_terms_ko).size, document.search_terms_ko.length, document.label_ko);
  }
  const searchTermCount = documents.reduce((count, document) => count + document.search_terms_ko.length, 0);
  const linkCount = documents.reduce((count, document) => count + document.entries.length + document.concepts.length, 0);
  assert(searchTermCount < linkCount * 18, `검색어 ${searchTermCount}개 / 연결 ${linkCount}개`);
});
