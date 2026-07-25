'use client';

import {useEffect, useMemo, useState} from 'react';

import {
  answerUnitSelectionState,
  claimSelectionState,
  selectedClaims,
  type ScenarioAnswerState,
} from '@/lib/legal-answer-journey-state';
import {
  KNOWLEDGE_SCENARIO_CHANGE_EVENT,
  type KnowledgeScenarioChangeDetail,
} from '@/lib/knowledge-scenario-state';
import type {CanonicalLegalAnswerProjection} from '@/types/legal-answer-packet';

export function VerifiedLegalAnswerCard({
  answer,
  authorityTargetIds,
  contentId,
  hasAuthorityReading,
  hasScenarios,
  revisionKey,
}: {
  answer: CanonicalLegalAnswerProjection;
  authorityTargetIds: Record<string, string>;
  contentId: string;
  hasAuthorityReading: boolean;
  hasScenarios: boolean;
  revisionKey: string;
}) {
  const [scenarioAnswers, setScenarioAnswers] = useState<ScenarioAnswerState>({});
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
      setScenarioAnswers(current => {
        const next = {...current};
        if (detail.answer) next[detail.scenarioId] = detail.answer;
        else delete next[detail.scenarioId];
        return next;
      });
    }
    window.addEventListener(KNOWLEDGE_SCENARIO_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(KNOWLEDGE_SCENARIO_CHANGE_EVENT, handleChange);
  }, [contentId, revisionKey]);

  const quickAnswers = useMemo(
    () => answer.quickAnswer.filter(unit => (
      answerUnitSelectionState(answer, unit, scenarioAnswers) === 'active'
    )),
    [answer, scenarioAnswers],
  );
  const pendingQuickAnswers = useMemo(
    () => answer.quickAnswer.filter(unit => (
      answerUnitSelectionState(answer, unit, scenarioAnswers) === 'pending'
    )),
    [answer, scenarioAnswers],
  );
  const activeClaims = useMemo(
    () => selectedClaims(answer, scenarioAnswers),
    [answer, scenarioAnswers],
  );
  const pendingClaims = useMemo(
    () => answer.claims.filter(claim => (
      claimSelectionState(answer, claim, scenarioAnswers) === 'pending'
    )),
    [answer, scenarioAnswers],
  );
  const primaryAnswer = quickAnswers[0];

  return (
    <section
      aria-labelledby="verified-legal-answer-heading"
      className="knowledgeSection"
      data-answer-state={primaryAnswer ? 'active' : 'conditional'}
      data-enhanced={String(enhanced)}
      data-verified-legal-answer
      id="quick-answer"
    >
      <article className="ruleCard">
        <p className="eyebrow">
          {answer.status === 'verified' ? '검증된 일반 답변' : '사실에 따라 달라지는 답변'}
        </p>
        {primaryAnswer ? (
          <h2 id="verified-legal-answer-heading">{primaryAnswer.text_ko}</h2>
        ) : (
          <>
            <h2 id="verified-legal-answer-heading">
              사실 질문을 확인하면 해당 조건의 답을 보여드립니다.
            </h2>
            <p data-answer-boundary>
              아직 확인되지 않은 사실이 있어 개인 사건의 결론으로 단정하지 않습니다.
            </p>
          </>
        )}
        {quickAnswers.slice(1).map(unit => <p key={unit.unit_id}>{unit.text_ko}</p>)}
        {!enhanced && pendingQuickAnswers.map(unit => (
          <p data-static-conditional-answer key={unit.unit_id}>
            <b>조건이 모두 맞는 경우</b>{' '}{unit.text_ko}
          </p>
        ))}
        <p>
          <b>답변 기준일</b>{' '}
          <time dateTime={answer.asOf}>{formatDate(answer.asOf)}</time>
        </p>

        <div className="claimConnectionList" data-claim-connections>
          {activeClaims.map(claim => (
            <article data-active-claim-id={claim.claim_id} key={claim.claim_id}>
              <span>{claimTypeLabel(claim.claim_type)}</span>
              <h3>{claim.statement_ko}</h3>
              <ClaimBindings
                answer={answer}
                authorityTargetIds={authorityTargetIds}
                claim={claim}
              />
            </article>
          ))}
          {pendingClaims.length ? (
            <p data-pending-claim-count>
              사실 확인 뒤 표시할 조건부 법리 {pendingClaims.length}개
            </p>
          ) : null}
        </div>

        <nav
          aria-label="선택한 답의 질문, 근거, 행동으로 이동"
          className="knowledgeSectionNav"
        >
          {hasScenarios ? <a href="#scenarios">사실 질문</a> : null}
          <a href={hasAuthorityReading ? '#statute-reading' : '#sources'}>연결 근거</a>
          <a href="#actions">연결 자료·행동</a>
        </nav>
      </article>
    </section>
  );
}

function ClaimBindings({
  answer,
  authorityTargetIds,
  claim,
}: {
  answer: CanonicalLegalAnswerProjection;
  authorityTargetIds: Record<string, string>;
  claim: CanonicalLegalAnswerProjection['claims'][number];
}) {
  const evidence = answer.evidence.filter(item => (
    claim.evidence_requirement_ids.includes(item.evidence_id)
  ));
  const actions = answer.actions.filter(item => claim.action_ids.includes(item.action_id));
  const deadlines = answer.deadlines.filter(item => claim.deadline_ids.includes(item.deadline_id));
  return (
    <dl>
      {claim.authority_refs.length ? (
        <div>
          <dt>근거</dt>
          <dd>{claim.authority_refs.map(reference => (
            <a
              data-claim-authority-id={reference.source_coordinate_id}
              href={`#${
                authorityTargetIds[reference.authority_reading_unit_id ?? '']
                ?? `source-summary-${reference.source_coordinate_id}`
              }`}
              key={`${reference.source_coordinate_id}:${reference.support_role}`}
            >
              {locatorLabel(reference.locator)}
            </a>
          ))}</dd>
        </div>
      ) : null}
      {evidence.length ? (
        <div><dt>자료</dt><dd>{evidence.map(item => (
          <a
            data-claim-evidence-id={item.evidence_id}
            href={`#packet-evidence-${item.evidence_id}`}
            key={item.evidence_id}
          >
            {item.label_ko}
          </a>
        ))}</dd></div>
      ) : null}
      {actions.length ? (
        <div><dt>행동</dt><dd>{actions.map(item => (
          <a
            data-claim-action-id={item.action_id}
            href={`#packet-action-${item.action_id}`}
            key={item.action_id}
          >
            {item.label_ko}
          </a>
        ))}</dd></div>
      ) : null}
      {deadlines.length ? (
        <div><dt>기한</dt><dd>{deadlines.map(item => (
          <a
            data-claim-deadline-id={item.deadline_id}
            href={`#packet-deadline-${item.deadline_id}`}
            key={item.deadline_id}
          >
            {item.label_ko}
          </a>
        ))}</dd></div>
      ) : null}
    </dl>
  );
}

function locatorLabel(
  locator: CanonicalLegalAnswerProjection['claims'][number]['authority_refs'][number]['locator'],
): string {
  if (locator.locator_kind === 'statute') {
    return [
      `제${Number(locator.article_no)}조`,
      locator.paragraph_no ? `제${Number(locator.paragraph_no)}항` : '',
      locator.item_no ? `제${Number(locator.item_no)}호` : '',
      locator.subitem_no ? `제${Number(locator.subitem_no)}목` : '',
    ].filter(Boolean).join(' ');
  }
  if (locator.locator_kind === 'adjudication') {
    return locator.case_number ?? locator.source_id;
  }
  return locator.document_number ?? locator.source_id;
}

function claimTypeLabel(kind: string): string {
  return {
    action: '행동',
    application: '적용',
    deadline: '기한',
    evidence: '증거',
    exception: '예외',
    limitation: '범위',
    procedure: '절차',
    rule: '기준',
  }[kind] ?? kind;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(
    new Date(`${value}T00:00:00Z`),
  );
}
