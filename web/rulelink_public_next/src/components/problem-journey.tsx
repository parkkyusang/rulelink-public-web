'use client';

import {useState} from 'react';
import {ExternalLinkIcon} from './external-link-icon';
import {buildJourneySummary, journeyActionState, type JourneyAnswers, type ProblemJourney as Journey} from '@/lib/problem-journey';
import styles from './problem-journey.module.css';

export function ProblemJourney({journey}: {journey: Journey}) {
  const [routeId, setRouteId] = useState('');
  const [answers, setAnswers] = useState<JourneyAnswers>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const route = journey.routes.find(item => item.id === routeId);
  const summary = route ? buildJourneySummary(journey, route.id, answers, checked) : '';
  const pending = route?.questions.filter(q => !answers[q.scenario_id] || answers[q.scenario_id] === 'unknown') ?? [];

  function reset() {setRouteId(''); setAnswers({}); setChecked([]); setPreview(false); setNotice('선택과 확인 표시를 모두 지웠습니다.');}
  function chooseRoute(id: string) {
    setRouteId(id); setAnswers({}); setChecked([]); setPreview(false); setNotice('');
  }
  async function copySummary() {
    try {await navigator.clipboard.writeText(summary); setNotice('요약을 복사했습니다. 승인된 작업공간의 새 사건에 붙여넣으세요.');}
    catch {setNotice('자동 복사가 허용되지 않았습니다. 아래 요약을 선택해 직접 복사할 수 있습니다.');}
  }
  function download() {
    const url = URL.createObjectURL(new Blob([summary], {type: 'text/plain;charset=utf-8'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '법률정보-확인메모.txt'; anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section aria-labelledby="problem-journey-title" className={styles.root} id="my-situation" data-problem-journey>
      <header>
        <p className="eyebrow">내 상황에 맞춰 보기</p>
        <h2 id="problem-journey-title">{journey.title}</h2>
        <p>{journey.introduction}</p>
        <p className={styles.privacy}>선택 내용은 이 화면에서만 유지됩니다. 저장·자동 전송하지 않으며, 새로고침하면 지워집니다.</p>
      </header>
      <fieldset className={styles.routes}>
        <legend>1. 지금 필요한 안내를 고르세요</legend>
        {journey.routes.map(item => <label key={item.id}>
          <input checked={routeId === item.id} name="problem-route" onChange={() => chooseRoute(item.id)} type="radio" value={item.id} />
          <span>{item.label}</span>
        </label>)}
      </fieldset>
      {!route ? <p>상황을 고르면 사실 확인 → 행동계획 → 근거 문언 → 검토용 요약으로 이어집니다. 아래의 전체 안내는 선택 없이도 읽을 수 있습니다.</p> : <>
        <section aria-labelledby="journey-facts-title" className={styles.section}>
          <h3 id="journey-facts-title">2. 확인한 사실만 표시하세요</h3>
          <p>모르는 사실은 ‘모르겠음’으로 남겨도 다음으로 갈 수 있습니다. 답을 바꾸면 행동계획의 확인 표시도 초기화됩니다. 선택 자체가 사실 확인을 대신하지는 않습니다.</p>
          {!route.questions.length ? <p>이 안내에는 예·아니오로 정해진 질문이 없습니다. 아래 자료와 주의사항을 대조하세요.</p> : null}
          {route.questions.map(question => {
            const answer = answers[question.scenario_id];
            return <fieldset className={styles.question} key={question.scenario_id}>
              <legend>{question.question_ko}</legend>
              <p>확인할 자료·시점: {question.decision_fact_ko}</p>
              <div className={styles.options}>
                {(['yes', 'no', 'unknown'] as const).map(value => <label key={value}>
                  <input checked={answer === value} name={question.scenario_id} onChange={() => {
                    setAnswers(current => ({...current, [question.scenario_id]: value}));
                    // 새 답으로 계획이 달라지면 과거의 완료표시를 승계하지 않습니다.
                    setChecked([]); setNotice('');
                  }} type="radio" value={value} />
                  {value === 'yes' ? '예' : value === 'no' ? '아니오' : '모르겠음'}
                </label>)}
              </div>
              <div aria-live="polite" className={styles.outcome}>
                {answer === 'yes' ? question.when_true_ko : answer === 'no' ? question.when_false_ko : answer === 'unknown' ? '이 사실은 아직 확인하지 못했습니다. 관련 행동의 조건을 확인할 항목으로 남깁니다.' : '선택하면 이 사실이 안내를 어떻게 바꾸는지 보여드립니다.'}
              </div>
            </fieldset>;
          })}
          <a href="#journey-plan">행동계획으로 이동 ↓</a>
        </section>
        <section aria-labelledby="journey-plan-title" className={styles.section} id="journey-plan">
          <h3 id="journey-plan-title">3. 다음 행동을 순서대로 확인하세요</h3>
          <p>선택한 안내의 실행 목록입니다. 신청·권리 유지의 최종 판단은 계약서와 등기 등 원자료 확인이 필요합니다.</p>
          <p aria-live="polite">{pending.length ? `아직 확인할 사실 ${pending.length}개 · 확인 전에는 조건부 행동을 완료할 수 없습니다.` : '표시한 답을 바탕으로 정리했습니다. 표시 자체가 법적 요건 충족을 증명하지는 않습니다.'}</p>
          <ol className={styles.actions}>
            {route.actions.map(action => {
              const state = journeyActionState(action.requires, answers);
              if (state === 'excluded') return null;
              return <li data-action-state={state} key={action.id}>
                <label><input checked={checked.includes(action.id)} disabled={state === 'pending'} onChange={event => setChecked(current => event.target.checked ? [...current, action.id] : current.filter(id => id !== action.id))} type="checkbox" />
                  <span>{action.text}</span></label>
                {state === 'pending' ? <p className={styles.warning}>먼저 확인: {action.requires.filter(c => answers[c.scenarioId] !== c.answer).map(c => route.questions.find(q => q.scenario_id === c.scenarioId)?.question_ko).join(' / ')}</p> : null}
                <a href={action.href}>이 행동의 설명 보기 →</a>
              </li>;
            })}
          </ol>
          <details><summary>준비할 자료와 날짜</summary><ul>{route.facts.map(fact => <li key={fact}>{fact}</li>)}</ul></details>
          <aside className={styles.warning}><strong>기한과 주의사항</strong>
            <p>기산일·송달·절차 단계 등을 확인하지 않은 채 마감일을 계산하지 않습니다. 경매 중이라면 배당요구 종기 등 사건의 실제 기한을 별도로 확인하세요.</p>
            <ul>{route.readings.map(reading => <li key={reading.id}>{reading.caution}</li>)}</ul>
          </aside>
        </section>
        <section aria-labelledby="journey-source-title" className={styles.section}>
          <h3 id="journey-source-title">4. 안내의 근거 문언을 직접 읽어보세요</h3>
          <p>각 근거는 모두 접힌 상태로 시작합니다. 아래 문언은 이 안내와 연결된 저장 원문이며, 실제 사건에 적용할 법령 시점은 별도 확인이 필요합니다.</p>
          {route.sources.map(source => <details className={styles.source} key={source.id}>
            <summary>{source.title}<small>{source.readingTitle ? '함께 읽는 안내의 근거 · ' : ''}{source.text ? '문언 펼치기' : source.explanations?.length ? '주요 내용과 공식 원문 확인' : '공식 원문 링크 확인'}</small></summary>
            {source.readingTitle ? <p>이 근거를 함께 설명하는 안내: <a href={source.readingHref}>{source.readingTitle}</a></p> : null}
            <p>원문 확인: <time dateTime={source.checkedAt}>{new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium', timeZone: 'Asia/Seoul'}).format(new Date(source.checkedAt))}</time></p>
            {source.text && source.effectiveDate ? <p>수록 문언 시행일: <time dateTime={source.effectiveDate}>{source.effectiveDate}</time></p> : null}
            {source.text ? <><h4>조문 문언</h4><blockquote>{source.text}</blockquote></> : null}
            {source.explanations?.length ? <div>
              <h4>안내에서 풀어쓴 주요 내용</h4>
              <p>아래는 원문 인용이 아니라 이 안내의 설명입니다.</p>
              {source.explanations.map(explanation => <div key={explanation.title}><strong>{explanation.title}</strong><p>{explanation.text}</p></div>)}
            </div> : null}
            {!source.text ? <p>정확한 문언은 아래 공식 원문에서 확인하세요. 이 페이지에서는 원문 인용과 설명을 구분합니다.</p> : null}
            <a href={source.href} rel="noopener noreferrer" target="_blank">공식 원문 보기 <ExternalLinkIcon /></a>
          </details>)}
        </section>
        <section aria-labelledby="journey-handoff-title" className={styles.section}>
          <h3 id="journey-handoff-title">5. 내 확인 메모로 정리하기</h3>
          <p>모르는 사실도 그대로 담습니다. 메모를 저장하거나 상담할 변호사에게 보여줄 수 있습니다. 컨시어지는 승인된 변호사 계정의 검토 도구이며, 일반 이용자가 여기서 상담을 신청하거나 답변을 받는 기능은 아닙니다.</p>
          <button aria-expanded={preview} onClick={() => setPreview(!preview)} type="button">{preview ? '요약 접기' : '가져갈 요약 미리보기'}</button>
          {preview ? <div className={styles.preview}>
            <label htmlFor="journey-summary">복사할 내용</label>
            <textarea id="journey-summary" readOnly value={summary} />
            <div className={styles.buttons}>
              <button onClick={copySummary} type="button">이 내용을 복사</button>
              <button onClick={download} type="button">텍스트로 저장</button>
            </div>
            <p>승인된 계정이라면 요약을 복사한 뒤 작업공간에서 ‘새 사건 만들기’에 붙여넣으세요. 이동만으로는 선택이나 사건정보가 전달되지 않습니다.</p>
            <a href="/ko/lawyer-workspace">컨시어지 이용 조건과 작업공간 연결 →</a>
          </div> : null}
          <p aria-live="polite" role="status">{notice}</p>
          <h4>자세한 설명도 이어서 읽기</h4>
          <ul>{route.readings.map(reading => <li key={reading.id}><a href={reading.href}>{reading.title}</a></li>)}</ul>
        </section>
        <button onClick={reset} type="button">선택·확인 표시 모두 지우기</button>
      </>}
      <noscript><p>상황 선택은 자바스크립트가 필요합니다. 아래의 주제별 안내에서 사실·행동·공식 근거를 모두 읽을 수 있습니다.</p></noscript>
    </section>
  );
}
