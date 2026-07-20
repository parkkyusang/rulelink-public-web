'use client';

import {useMemo, useState} from 'react';

import type {LegalIssueCard, PublicTopic} from '@/types/publication';

type Props = {
  cards: LegalIssueCard[];
  topics: PublicTopic[];
  initialTopicId?: string;
};

export function IssueExplorer({cards, topics, initialTopicId = 'all'}: Props) {
  const [query, setQuery] = useState('');
  const [topicId, setTopicId] = useState(initialTopicId);
  const normalizedQuery = normalize(query);
  const visibleCards = useMemo(() => {
    const selectedTopic = topics.find(topic => topic.topic_id === topicId);
    const allowedIds = selectedTopic ? new Set(selectedTopic.issue_card_ids) : null;
    const topicTerms = selectedTopic?.search_terms_ko ?? [];
    return cards.filter(card => {
      if (allowedIds && !allowedIds.has(card.issue_card_id)) return false;
      if (!normalizedQuery) return true;
      const searchText = normalize([
        card.title_ko,
        card.audience_situation_ko,
        ...card.entry_signals,
        ...card.urgency_signals,
        ...card.branch_questions,
        ...topicTerms,
      ].join(' '));
      return searchText.includes(normalizedQuery);
    });
  }, [cards, normalizedQuery, topicId, topics]);

  return (
    <div className="explorer">
      <div className="searchBox">
        <label htmlFor="issue-search">내 상황을 짧게 적어보세요</label>
        <div className="searchInputRow">
          <span aria-hidden="true">⌕</span>
          <input
            id="issue-search"
            onChange={event => setQuery(event.target.value)}
            placeholder="예: 보증금 못 받고 이사, 집이 경매에 넘어감"
            type="search"
            value={query}
          />
        </div>
      </div>

      {topics.length ? (
        <div aria-label="법률 주제" className="topicFilters" role="group">
          <button aria-pressed={topicId === 'all'} className={topicId === 'all' ? 'active' : ''} onClick={() => setTopicId('all')} type="button">전체</button>
          {topics.map(topic => (
            <button
              aria-pressed={topicId === topic.topic_id}
              className={topicId === topic.topic_id ? 'active' : ''}
              key={topic.topic_id}
              onClick={() => setTopicId(topic.topic_id)}
              type="button"
            >
              {topic.title_ko}
            </button>
          ))}
        </div>
      ) : null}

      <p aria-live="polite" className="resultCount">확인할 수 있는 문제카드 {visibleCards.length}개</p>
      {visibleCards.length ? (
        <div className="cardGrid">
          {visibleCards.map(card => <IssueCard card={card} key={card.issue_card_id} />)}
        </div>
      ) : (
        <div className="searchEmpty">
          <strong>맞는 문제카드를 찾지 못했습니다.</strong>
          <p>더 짧은 표현으로 다시 검색하거나 전체 주제에서 확인해 주세요.</p>
        </div>
      )}
    </div>
  );
}

function IssueCard({card}: {card: LegalIssueCard}) {
  return (
    <a className="issueCard" href={`/ko/issues/${card.slug}`}>
      <span className="cardMeta">검토 {formatDate(card.reviewed_at)}</span>
      <h3>{card.title_ko}</h3>
      <p>{card.audience_situation_ko}</p>
      <span className="cardLink">확인할 내용과 다음 행동 보기 <span aria-hidden="true">→</span></span>
    </a>
  );
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
