'use client';

import {useEffect, useMemo, useState} from 'react';

import {LegalConceptText} from '@/components/legal-concept-text';
import type {PublicConceptCard} from '@/types/publication';

import styles from './knowledge-scenario-decision.module.css';

type ScenarioAnswer = 'yes' | 'no' | 'unknown';

type Props = {
  contentId: string;
  concepts: PublicConceptCard[];
  decisionFact: string;
  falseOutcome: string;
  question: string;
  revisionKey: string;
  scenarioId: string;
  trueOutcome: string;
};

export function KnowledgeScenarioDecision({
  contentId,
  concepts,
  decisionFact,
  falseOutcome,
  question,
  revisionKey,
  scenarioId,
  trueOutcome,
}: Props) {
  const storageKey = useMemo(
    () => ['rulelink-scenario-v1', contentId, revisionKey, scenarioId].join(':'),
    [contentId, revisionKey, scenarioId],
  );
  const [answer, setAnswer] = useState<ScenarioAnswer | null>(null);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setAnswer(isScenarioAnswer(saved) ? saved : null);
    } catch {
      setAnswer(null);
    } finally {
      setEnhanced(true);
    }
  }, [storageKey]);

  function choose(next: ScenarioAnswer) {
    setAnswer(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // 저장소가 차단되어도 현재 화면의 선택 기능은 유지합니다.
    }
  }

  function clear() {
    setAnswer(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // 저장소가 차단되어도 현재 화면의 초기화는 유지합니다.
    }
  }

  return (
    <div
      className={styles.root}
      data-enhanced={String(enhanced)}
      data-scenario-answer={answer ?? 'unanswered'}
      data-scenario-id={scenarioId}
    >
      <h3><LegalConceptText concepts={concepts} text={question} /></h3>
      <p className={styles.decisionFact}>
        확인할 사실 · <LegalConceptText concepts={concepts} text={decisionFact} />
      </p>
      {enhanced ? (
        <div aria-label={`${question} 답변`} className={styles.controls} role="group">
          <button aria-pressed={answer === 'yes'} onClick={() => choose('yes')} type="button">예</button>
          <button aria-pressed={answer === 'no'} onClick={() => choose('no')} type="button">아니오</button>
          <button aria-pressed={answer === 'unknown'} onClick={() => choose('unknown')} type="button">모르겠음</button>
          {answer ? <button className={styles.clear} onClick={clear} type="button">선택 지우기</button> : null}
        </div>
      ) : null}

      <div aria-live="polite" className={styles.outcome}>
        {!enhanced ? (
          <div className={styles.fallbackOutcomes}>
            <p><b>해당하면</b><LegalConceptText concepts={concepts} text={trueOutcome} /></p>
            <p><b>해당하지 않으면</b><LegalConceptText concepts={concepts} text={falseOutcome} /></p>
          </div>
        ) : answer === 'yes' ? (
          <p data-selected-outcome="true">
            <b>예를 선택한 경우</b><LegalConceptText concepts={concepts} text={trueOutcome} />
          </p>
        ) : answer === 'no' ? (
          <p data-selected-outcome="false">
            <b>아니오를 선택한 경우</b><LegalConceptText concepts={concepts} text={falseOutcome} />
          </p>
        ) : answer === 'unknown' ? (
          <p data-selected-outcome="unknown">
            <b>아직 결론을 고르지 않습니다</b>
            이 사실을 확인하기 전에는 어느 결과가 적용되는지 단정할 수 없습니다.
          </p>
        ) : (
          <p className={styles.prompt}>답을 선택하면 이 질문에 연결된 검토 결과만 보여드립니다.</p>
        )}
      </div>
      <p className={styles.privacy}>선택은 서버로 전송되지 않고 현재 기기에만 저장됩니다.</p>
    </div>
  );
}

function isScenarioAnswer(value: string | null): value is ScenarioAnswer {
  return value === 'yes' || value === 'no' || value === 'unknown';
}
