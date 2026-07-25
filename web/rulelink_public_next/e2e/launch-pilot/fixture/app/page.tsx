import {AuthorityReadingSection} from '@/components/authority-reading-section';
import {KnowledgeActionWorkspace} from '@/components/knowledge-action-workspace';
import {KnowledgeScenarioDecision} from '@/components/knowledge-scenario-decision';
import {ScenarioHandoffFocus} from '@/components/scenario-handoff-focus';
import {VerifiedLegalAnswerCard} from '@/components/verified-legal-answer-card';
import {resolveAuthorityReadingForEntry} from '@/lib/authority-reading';
import {buildKnowledgeLaunchJourney} from '@/lib/knowledge-launch-journey';
import type {CanonicalLegalAnswerProjection} from '@/types/legal-answer-packet';
import type {RuleLinkLegalAnswerPacket} from '@/types/legal-answer-packet';
import type {PublicKnowledgeEntry, PublishedBundle} from '@/types/publication';

import {validLegalAnswerFixture} from '../../../../scripts/legal-answer-test-fixture.mjs';

export default function PilotPage() {
  const fixture = validLegalAnswerFixture() as {
    bundle: PublishedBundle;
    packetSet: {packets: RuleLinkLegalAnswerPacket[]};
  };
  const packet = fixture.packetSet.packets[0];
  const quickIds = new Set(packet.answer.quick_answer_unit_ids);
  const baseAnswer: CanonicalLegalAnswerProjection = {
    actions: packet.actions,
    answerUnits: packet.answer.units,
    asOf: packet.as_of,
    branches: packet.branches,
    canonicalContentIds: packet.retrieval.canonical_content_ids,
    claims: packet.claims,
    deadlines: packet.deadlines,
    evidence: packet.evidence_requirements,
    facts: packet.facts,
    packetId: packet.packet_id,
    quickAnswer: packet.answer.units.filter(unit => quickIds.has(unit.unit_id)),
    status: packet.status as CanonicalLegalAnswerProjection['status'],
  };
  const answer = addPilotDeadline(baseAnswer);
  const contentId = answer.canonicalContentIds[0];
  const knowledge = fixture.bundle.knowledge;
  if (!knowledge) throw new Error('launch_pilot_knowledge_required');
  const entry = knowledge.content_entries.find(
    candidate => candidate.content_id === contentId,
  ) as PublicKnowledgeEntry;
  const views = resolveAuthorityReadingForEntry(knowledge, entry);
  const authorityTargetIds = Object.fromEntries(
    views.map(view => [view.authorityReadingUnitId, view.cardDomId]),
  );
  const journey = buildKnowledgeLaunchJourney({
    actionSteps: [],
    answer,
    factsToCheck: [],
  });
  const factById = new Map(answer.facts.map(fact => [fact.fact_id, fact]));
  return (
    <main style={{margin: '0 auto', maxWidth: 1080, padding: 16}}>
      <ScenarioHandoffFocus />
      <h1>공개 법률답변 024 화면 계약 파일럿</h1>
      <section id="scenarios">
        {answer.branches.map((branch, index) => (
          <article id={`scenario-${branch.scenario_id}`} key={branch.branch_id} tabIndex={-1}>
            <KnowledgeScenarioDecision
              concepts={[]}
              contentId={contentId}
              decisionFact={factById.get(branch.decision_fact_id)?.statement_ko ?? branch.decision_fact_id}
              falseOutcome={`분기 ${index + 1}의 아니오 결과`}
              question={`결론을 바꾸는 사실 ${index + 1}`}
              revisionKey={answer.asOf}
              scenarioId={branch.scenario_id}
              trueOutcome={`분기 ${index + 1}의 예 결과`}
            />
          </article>
        ))}
      </section>
      <VerifiedLegalAnswerCard
        answer={answer}
        authorityTargetIds={authorityTargetIds}
        contentId={contentId}
        hasAuthorityReading
        hasScenarios
        revisionKey={answer.asOf}
      />
      <AuthorityReadingSection
        answer={answer}
        asOf={answer.asOf}
        concepts={[]}
        contentId={contentId}
        revisionKey={answer.asOf}
        views={views}
      />
      <section id="actions">
        <KnowledgeActionWorkspace
          actionItems={journey.actionItems}
          contentId={contentId}
          deadlines={journey.deadlines}
          evidenceItems={journey.evidenceItems}
          factsToCheck={journey.factsToCheck}
          revisionKey={answer.asOf}
        />
      </section>
    </main>
  );
}

function addPilotDeadline(
  answer: CanonicalLegalAnswerProjection,
): CanonicalLegalAnswerProjection {
  const targetClaim = answer.claims.find(claim => claim.conditions.branch_ids.length);
  if (!targetClaim) throw new Error('launch_pilot_conditional_claim_required');
  const deadlineId = `${answer.packetId}.pilot-deadline`;
  return {
    ...answer,
    claims: answer.claims.map(claim => (
      claim.claim_id === targetClaim.claim_id
        ? {...claim, deadline_ids: [...claim.deadline_ids, deadlineId]}
        : claim
    )),
    deadlines: [
      ...answer.deadlines,
      {
        basis_claim_ids: [targetClaim.claim_id],
        calculation_kind: 'not_calculable',
        deadline_id: deadlineId,
        label_ko: '파일럿 사실 확인 뒤 계산할 기한',
        status: 'needs_trigger_fact',
        timezone: 'Asia/Seoul',
        trigger_fact_id: answer.facts[0].fact_id,
      },
    ],
  };
}
