import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterAndRankKnowledgeSourceDocuments,
  knowledgeSourceKind,
  normalizeKnowledgeSourceSearchText,
} from '../src/lib/knowledge-source-ranking.ts';

test('공식 근거 자체가 검색어와 맞는 문서를 관련 콘텐츠에서만 맞는 문서보다 먼저 둔다', () => {
  const directStatute = statuteDocument({
    label: '민법 제1026조',
    lawName: '민법',
    articleNo: '제1026조',
    relatedTerms: ['상속 승인'],
  });
  const relatedPrecedent = precedentDocument({
    label: '대법원 2020다12345',
    relatedTerms: ['민법 제1026조 한정승인'],
  });

  const ranked = filterAndRankKnowledgeSourceDocuments(
    [relatedPrecedent, directStatute],
    {filter: 'all', query: '민법 제1026조'},
  );

  assert.deepEqual(ranked.map(document => document.label_ko), ['민법 제1026조', '대법원 2020다12345']);
});

test('여러 검색어는 공식 근거와 연결 콘텐츠를 합친 문맥에서 모두 일치해야 한다', () => {
  const documents = [
    statuteDocument({label: '민법 제1026조', lawName: '민법', articleNo: '제1026조', relatedTerms: ['상속 승인']}),
    statuteDocument({label: '민법 제1019조', lawName: '민법', articleNo: '제1019조', relatedTerms: ['한정승인 3개월']}),
  ];

  const ranked = filterAndRankKnowledgeSourceDocuments(documents, {filter: 'all', query: '민법 한정승인'});
  assert.deepEqual(ranked.map(document => document.label_ko), ['민법 제1019조']);
});

test('근거 유형 필터와 기본 정렬 계약을 함께 지킨다', () => {
  const statute = statuteDocument({label: '민법 제750조', lawName: '민법', articleNo: '제750조'});
  const precedent = precedentDocument({label: '대법원 2013다3520'});
  const official = officialDocument({label: '민법 일부개정법률'});
  const documents = [statute, official, precedent];

  assert.equal(knowledgeSourceKind(statute), 'statute');
  assert.equal(knowledgeSourceKind(precedent), 'precedent');
  assert.equal(knowledgeSourceKind(official), 'official_document');
  assert.deepEqual(
    filterAndRankKnowledgeSourceDocuments(documents, {filter: 'all', query: ''}).map(document => document.label_ko),
    ['대법원 2013다3520', '민법 일부개정법률', '민법 제750조'],
  );
  assert.deepEqual(
    filterAndRankKnowledgeSourceDocuments(documents, {filter: 'precedent', query: ''}).map(document => document.label_ko),
    ['대법원 2013다3520'],
  );
});

test('검색어 정규화는 폭·대소문자·연속 공백 차이를 제거한다', () => {
  assert.equal(normalizeKnowledgeSourceSearchText('  ＡBC   제  3 조  '), 'abc 제 3 조');
});

function statuteDocument({label, lawName, articleNo, relatedTerms = []}) {
  return document({
    label,
    relatedTerms,
    source: {
      coordinate_id: `coord.${label}`,
      source_id: `source.${label}`,
      law_name_ko: lawName,
      article_no: articleNo,
    },
  });
}

function precedentDocument({label, relatedTerms = []}) {
  return document({
    label,
    relatedTerms,
    source: {
      coordinate_id: `coord.${label}`,
      source_id: `source.${label}`,
      source_kind: 'precedent',
      title_ko: label,
      case_number: label.replace('대법원 ', ''),
      decision_date: '2026-01-01',
    },
  });
}

function officialDocument({label, relatedTerms = []}) {
  return document({
    label,
    relatedTerms,
    source: {
      coordinate_id: `coord.${label}`,
      source_id: `source.${label}`,
      source_kind: 'official_document',
      title_ko: label,
      document_kind: '개정법률',
      promulgation_number: '법률 제1호',
      effective_date: '2026-01-01',
    },
  });
}

function document({label, relatedTerms, source}) {
  return {
    source,
    source_coordinate_ids: [source.coordinate_id],
    label_ko: label,
    search_terms_ko: relatedTerms,
    entries: [],
    concepts: [],
  };
}
