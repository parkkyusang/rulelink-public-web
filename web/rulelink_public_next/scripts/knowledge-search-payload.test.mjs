import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {buildKnowledgeSearchDocuments} from '../src/lib/knowledge-search.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(await readFile(path.resolve(appRoot, '..', '..', 'artifacts/publication/current/bundle.json'), 'utf8'));
const documents = buildKnowledgeSearchDocuments(bundle.knowledge);

test('검색 목록에는 카드 표시 필드만 남기고 상세 본문 객체를 직렬화하지 않는다', () => {
  const allowedKeys = [
    'audience_situation_ko',
    'content_id',
    'content_type',
    'expires_at',
    'hub_ids',
    'one_line_answer_ko',
    'reviewed_at',
    'search_intents_ko',
    'slug',
    'title_ko',
  ];
  for (const document of documents) {
    assert.deepEqual(Object.keys(document.entry).sort(), allowedKeys);
    assert.equal('body_sections' in document.entry, false);
    assert.equal('action_steps_ko' in document.entry, false);
    assert.equal('facts_to_check_ko' in document.entry, false);
  }
});

test('검색 투영 직렬화 크기는 전체 상세 객체를 중복 전달할 때의 65퍼센트 이하이다', () => {
  const fullEntryById = new Map(bundle.knowledge.content_entries.map(entry => [entry.content_id, entry]));
  const legacyDocuments = documents.map(document => ({
    ...document,
    entry: fullEntryById.get(document.entry.content_id),
    search_terms_ko: [
      document.entry.title_ko,
      document.entry.one_line_answer_ko,
      document.entry.audience_situation_ko,
      ...document.search_terms_ko,
    ],
  }));
  const compactBytes = Buffer.byteLength(JSON.stringify(documents));
  const legacyBytes = Buffer.byteLength(JSON.stringify(legacyDocuments));
  assert.ok(compactBytes <= legacyBytes * 0.65, `${compactBytes} / ${legacyBytes}`);
});

test('운영 023 검색 payload는 본문·법리·사실분기를 제거한 350KB 예산 안에 있다', () => {
  const compactBytes = Buffer.byteLength(JSON.stringify(documents));
  const termCount = documents.reduce(
    (total, document) => total + document.search_terms_ko.length,
    0,
  );
  assert.ok(compactBytes <= 350_000, `${compactBytes} bytes`);
  assert.ok(termCount <= 3_000, `${termCount} terms`);
});

test('모든 공개 지식은 검색 카드와 근거 역색인을 유지한다', () => {
  assert.equal(documents.length, bundle.knowledge.content_entries.length);
  assert.equal(new Set(documents.map(document => document.entry.content_id)).size, documents.length);
  assert.ok(documents.every(document => document.search_terms_ko.length > 0));
  assert.ok(documents.every(document => document.evidence_labels_ko.length > 0));
});
