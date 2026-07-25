'use client';

import {useEffect, useMemo, useState} from 'react';

import {
  KNOWLEDGE_SCENARIO_CHANGE_EVENT,
  type KnowledgeScenarioAnswer,
  type KnowledgeScenarioChangeDetail,
} from '@/lib/knowledge-scenario-state';
import type {PublicScenarioBranch} from '@/types/publication';

import styles from './knowledge-follow-up-questions.module.css';

type AnswerState = Record<string, KnowledgeScenarioAnswer>;

export function KnowledgeFollowUpQuestions({
  contentId,
  revisionKey,
  scenarios,
}: {
  contentId: string;
  revisionKey: string;
  scenarios: readonly Pick<PublicScenarioBranch, 'question_ko' | 'scenario_id'>[];
}) {
  const [answers, setAnswers] = useState<AnswerState>({});
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    setEnhanced(true);
    function handleChange(event: Event) {
      const detail = (event as CustomEvent<KnowledgeScenarioChangeDetail>).detail;
      if (
        !detail
        || detail.contentId !== contentId
        || detail.revisionKey !== revisionKey
      ) return;
      setAnswers(current => {
        const next = {...current};
        if (detail.answer) next[detail.scenarioId] = detail.answer;
        else delete next[detail.scenarioId];
        return next;
      });
    }
    window.addEventListener(KNOWLEDGE_SCENARIO_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(KNOWLEDGE_SCENARIO_CHANGE_EVENT, handleChange);
  }, [contentId, revisionKey]);

  const pending = useMemo(
    () => scenarios.filter(scenario => (
      !answers[scenario.scenario_id]
      || answers[scenario.scenario_id] === 'unknown'
    )),
    [answers, scenarios],
  );

  if (!scenarios.length) return null;
  return (
    <section
      aria-labelledby="follow-up-questions-heading"
      className={styles.root}
      data-enhanced={String(enhanced)}
      data-follow-up-questions
      id="follow-up-questions"
    >
      <p className="eyebrow">추가로 확인할 질문</p>
      <h2 id="follow-up-questions-heading">
        {enhanced && !pending.length
          ? '현재 화면의 사실 질문을 모두 확인했습니다.'
          : '아직 확인하지 못한 사실이 있나요?'}
      </h2>
      <p>
        이 목록은 결론을 새로 만들지 않습니다. 위 사실분기의 출판된 질문으로
        돌아가 확인할 항목만 보여드립니다.
      </p>
      <ul aria-live="polite">
        {(enhanced ? pending : scenarios).map(scenario => (
          <li key={scenario.scenario_id}>
            <a href={`#scenario-${scenario.scenario_id}`}>
              {scenario.question_ko}
              {enhanced && answers[scenario.scenario_id] === 'unknown'
                ? <span>아직 모름</span>
                : null}
            </a>
          </li>
        ))}
      </ul>
      {enhanced && !pending.length ? (
        <a className={styles.nextAction} href="#sources">근거를 다시 확인하기</a>
      ) : null}
      <noscript>
        <p>자바스크립트 없이 모든 사실 질문 링크를 표시합니다.</p>
      </noscript>
    </section>
  );
}
