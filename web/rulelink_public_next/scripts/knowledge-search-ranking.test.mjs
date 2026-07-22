import assert from 'node:assert/strict';
import test from 'node:test';

import {filterAndRankKnowledgeDocuments} from '../src/lib/knowledge-search-ranking.ts';

test('검색어가 제목에 직접 있는 지식을 본문에서만 일치하는 지식보다 먼저 보여준다', () => {
  const ranked = filterAndRankKnowledgeDocuments([
    document('content.body', '상속 선택 안내', {terms: ['보증금 반환 절차']}),
    document('content.title', '보증금 반환 절차', {terms: ['상속 선택 안내']}),
  ], {hubId: 'all', query: '보증금 반환'});
  assert.deepEqual(ranked.map(item => item.entry.content_id), ['content.title', 'content.body']);
});

test('여러 검색어는 모두 존재해야 하고 공식 근거 일치도 순위에 반영한다', () => {
  const ranked = filterAndRankKnowledgeDocuments([
    document('content.partial', '단순승인 안내', {terms: ['민법']}),
    document('content.evidence', '상속재산 처분', {evidence: ['민법 제1026조']}),
  ], {hubId: 'all', query: '민법 1026조'});
  assert.deepEqual(ranked.map(item => item.entry.content_id), ['content.evidence']);
});

test('주제 선택은 검색 관련도 계산 전에 해당 허브의 지식만 남긴다', () => {
  const ranked = filterAndRankKnowledgeDocuments([
    document('content.inheritance', '상속 포기', {hubIds: ['hub.inheritance']}),
    document('content.lease', '임대차 해지', {hubIds: ['hub.lease']}),
  ], {hubId: 'hub.lease', query: ''});
  assert.deepEqual(ranked.map(item => item.entry.content_id), ['content.lease']);
});

test('검색어가 없으면 검토일과 제목 순서가 안정적인 기본 정렬이 된다', () => {
  const ranked = filterAndRankKnowledgeDocuments([
    document('content.old', '이전 지식', {reviewedAt: '2026-07-20T00:00:00+00:00'}),
    document('content.new-b', '새 지식 나', {reviewedAt: '2026-07-22T00:00:00+00:00'}),
    document('content.new-a', '새 지식 가', {reviewedAt: '2026-07-22T00:00:00+00:00'}),
  ], {hubId: 'all', query: ''});
  assert.deepEqual(ranked.map(item => item.entry.content_id), ['content.new-a', 'content.new-b', 'content.old']);
});

function document(contentId, title, {
  evidence = [],
  hubIds = ['hub.all'],
  reviewedAt = '2026-07-22T00:00:00+00:00',
  terms = [],
} = {}) {
  return {
    entry: {
      content_id: contentId,
      content_type: 'doctrine_explainer',
      slug: contentId.replace('content.', ''),
      title_ko: title,
      one_line_answer_ko: `${title}의 핵심을 설명합니다.`,
      audience_situation_ko: `${title}이 궁금한 사람`,
      reviewed_at: reviewedAt,
      hub_ids: hubIds,
    },
    evidence_labels_ko: evidence,
    search_terms_ko: terms,
  };
}
