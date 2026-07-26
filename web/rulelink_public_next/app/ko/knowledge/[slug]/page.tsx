import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {AuthorityReadingSection} from '@/components/authority-reading-section';
import {EditorialAttribution} from '@/components/editorial-attribution';
import {KnowledgeActionWorkspace} from '@/components/knowledge-action-workspace';
import {KnowledgeFollowUpQuestions} from '@/components/knowledge-follow-up-questions';
import {KnowledgeReadingDepthNav} from '@/components/knowledge-reading-depth-nav';
import {KnowledgeReadingPath} from '@/components/knowledge-reading-path';
import {KnowledgeScenarioDecision} from '@/components/knowledge-scenario-decision';
import {
  KnowledgeSourceEvidence,
  type PublicKnowledgeSourceView,
} from '@/components/knowledge-source-evidence';
import {LegalConceptLayer, LegalConceptText} from '@/components/legal-concept-text';
import {OfficialSourceJump} from '@/components/official-source-jump';
import {PublicAdvertisingPlaceholder} from '@/components/public-advertising-placeholder';
import {ScenarioHandoffFocus} from '@/components/scenario-handoff-focus';
import {ScenarioRuleLinks} from '@/components/scenario-rule-links';
import {VerifiedLegalAnswerCard} from '@/components/verified-legal-answer-card';
import {changeLifecycleLabel} from '@/lib/change-lifecycle';
import {knowledgeContentTypeLabel} from '@/lib/content-labels';
import {formatKoreanLegalDate} from '@/lib/legal-date';
import {buildKnowledgeLaunchJourney} from '@/lib/knowledge-launch-journey';
import {browserOfficialSourceUrl} from '@/lib/official-source-url';
import {loadPublicLegalAnswerForContent} from '@/lib/public-legal-answer-loader';
import {
  findKnowledgeEntry,
  knowledgeDetail,
  listKnowledgeEntries,
  relatedChangeBriefsForKnowledgeEntry,
} from '@/lib/publication';
import {shouldShowPublicRuleProposition} from '@/lib/public-rule-presentation';
import {site} from '@/lib/site';
import {buildKnowledgePageStructuredData} from '@/lib/public-structured-data';
import {
  resolveApprovedEditorialAttribution,
  resolvePublicTrustConfig,
} from '@/lib/public-trust';
import {serializeStructuredData} from '@/lib/structured-data';

import styles from './knowledge-trust.module.css';

export const dynamic = 'force-static';

type Props = {params: Promise<{slug: string}>};

export async function generateStaticParams() {
  return (await listKnowledgeEntries()).map(entry => ({slug: entry.slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const entry = await findKnowledgeEntry((await params).slug);
  if (!entry) return {};
  const canonical = `/ko/knowledge/${entry.slug}`;
  return {
    title: entry.title_ko,
    description: entry.one_line_answer_ko,
    keywords: entry.search_intents_ko,
    alternates: {canonical},
    openGraph: {
      type: 'article',
      title: entry.title_ko,
      description: entry.one_line_answer_ko,
      url: canonical,
      modifiedTime: entry.reviewed_at,
    },
  };
}

export default async function KnowledgePage({params}: Props) {
  const {slug} = await params;
  const entry = await findKnowledgeEntry(slug);
  if (!entry) notFound();
  const {
    authorityAsOf,
    authorityReadingUnits,
    concepts,
    rules,
    scenarios,
    scenarioRules,
    sources,
    hubs,
    readingPathSections,
    maintenance,
    sourceTexts,
  } = await knowledgeDetail(entry);
  const verifiedAnswer = await loadPublicLegalAnswerForContent(entry.content_id);
  const launchJourney = buildKnowledgeLaunchJourney({
    actionSteps: entry.action_steps_ko,
    answer: verifiedAnswer,
    factsToCheck: entry.facts_to_check_ko,
  });
  const relatedChangeBriefs = await relatedChangeBriefsForKnowledgeEntry(entry);
  const trustConfig = resolvePublicTrustConfig();
  const editorialAttribution = resolveApprovedEditorialAttribution(
    entry.editorial_attribution,
    trustConfig,
  );
  const canonicalUrl = `${site.url}/ko/knowledge/${entry.slug}`;
  const officialSources = sources.flatMap(source => {
    const url = browserOfficialSourceUrl(source) ?? source.official_url;
    return url ? [{name: sourceLabel(source), url}] : [];
  });
  const sourceViews = sources.map(publicSourceView);
  const publicSourceTexts = Object.fromEntries(
    Object.entries(sourceTexts).map(([coordinateId, text]) => (
      [coordinateId, text.official_text_ko]
    )),
  );
  return (
    <LegalConceptLayer>
      <main className="knowledgePage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData(buildKnowledgePageStructuredData({
          audience: entry.audience_situation_ko,
          breadcrumbs: [
            {name: '홈', url: site.url},
            {name: '생활법률 지식', url: `${site.url}/ko/knowledge`},
            ...(hubs[0] ? [{name: hubs[0].title_ko, url: `${site.url}/ko/hubs/${hubs[0].slug}`}] : []),
            {name: entry.title_ko, url: canonicalUrl},
          ],
          description: entry.one_line_answer_ko,
          editorialAttribution: editorialAttribution ?? undefined,
          expiresAt: maintenance?.next_check_at ?? entry.expires_at,
          officialSources,
          pageUrl: canonicalUrl,
          publisher: trustConfig ? {
            name: trustConfig.operatorLegalName,
            url: site.url,
          } : undefined,
          reviewedAt: entry.reviewed_at,
          rules: rules.map(rule => ({description: rule.proposition_ko, name: rule.title_ko})),
          scenarios: scenarios.map(scenario => ({
            decisionFact: scenario.decision_fact_ko,
            falseOutcome: scenario.when_false_ko,
            question: scenario.question_ko,
            trueOutcome: scenario.when_true_ko,
          })),
          searchIntents: entry.search_intents_ko,
          siteName: site.name,
          siteUrl: site.url,
          title: entry.title_ko,
        }))}}
        type="application/ld+json"
      />
      <nav aria-label="현재 위치" className="breadcrumb">
        <a href="/">홈</a><span aria-hidden="true">/</span><a href="/ko/knowledge">생활법률 지식</a>
        {hubs[0] ? <><span aria-hidden="true">/</span><a href={`/ko/hubs/${hubs[0].slug}`}>{hubs[0].title_ko}</a></> : null}
      </nav>
      <ScenarioHandoffFocus />
      <header className="knowledgeHero">
        <p className="eyebrow">{knowledgeContentTypeLabel(entry.content_type)}</p>
        <h1>{entry.title_ko}</h1>
        <p><LegalConceptText concepts={concepts} text={entry.one_line_answer_ko} /></p>
        <span className="audienceBadge">{entry.audience_situation_ko}</span>
        <div aria-label="콘텐츠 최신성" className={styles.trust}>
          <span><b>내용 검토</b>{formatDate(entry.reviewed_at)}</span>
          <span>
            <b>다음 점검기한</b>
            {maintenance?.next_check_at
              ? formatDate(maintenance.next_check_at)
              : formatDate(entry.expires_at)}
          </span>
          <span><b>공식 근거</b>{sources.length}건 연결</span>
        </div>
        {editorialAttribution ? (
          <EditorialAttribution
            attribution={editorialAttribution}
            trustHref="/ko/trust"
          />
        ) : null}
        {hubs.length ? (
          <nav aria-label="소속 주제" className={styles.hubTrail}>
            <span>이 글이 속한 주제</span>
            {hubs.map(hub => <a href={`/ko/hubs/${hub.slug}`} key={hub.hub_id}>{hub.title_ko} →</a>)}
          </nav>
        ) : null}
      </header>

      {authorityReadingUnits.length ? (
        <KnowledgeReadingDepthNav
          hasCasePractice={false}
          hasScenarios={Boolean(scenarios.length)}
          hasVerifiedAnswer={Boolean(verifiedAnswer)}
        />
      ) : (
        <nav aria-label="이 글 안에서 이동" className="knowledgeSectionNav">
          <span>이 글에서</span>
          <a href={verifiedAnswer ? '#quick-answer' : '#summary'}>빠른 답</a>
          {verifiedAnswer ? <a href="#summary">답 이해</a> : null}
          {scenarios.length ? <a href="#scenarios">결론 사실</a> : null}
          <a href="#rules">적용 결과와 근거</a>
          <OfficialSourceJump targetId="sources" />
          <a href="#actions">증거·기한·행동</a>
          {scenarios.length ? <a href="#follow-up-questions">추가 질문</a> : null}
          {concepts.length ? <a href="#concepts">용어 해설</a> : null}
          {readingPathSections.length ? <a href="#reading-path">다음 읽기</a> : null}
        </nav>
      )}

      <section className="knowledgeLayout">
        <div>
          <section className="knowledgeSection" id="summary">
            <p className="eyebrow">{verifiedAnswer ? '답을 이해하기' : '빠른 답'}</p>
            <h2>{verifiedAnswer ? '왜 그런지 핵심부터 확인합니다.' : '무엇부터 확인해야 하나요?'}</h2>
            <ul>
              {entry.key_points_ko.map(point => <li key={point}><LegalConceptText concepts={concepts} text={point} /></li>)}
            </ul>
            <div className="ruleStack">
              {entry.body_sections.map(section => (
                <article className="ruleCard" key={section.heading_ko}>
                  <h3>{section.heading_ko}</h3>
                  {section.paragraphs_ko.map(paragraph => <p key={paragraph}><LegalConceptText concepts={concepts} text={paragraph} /></p>)}
                </article>
              ))}
            </div>
          </section>

          {scenarios.length ? (
            <section className="knowledgeSection" id="scenarios">
              <p className="eyebrow">결론을 가르는 사실</p>
              <h2>답을 바꿀 수 있는 사실을 먼저 확인하세요.</h2>
              <p className="knowledgeSectionLead">
                예·아니오·모르겠음 중 하나를 선택하면 출판된 결과 분기만
                보여줍니다. 확인하지 못한 사실이 있으면 결론을 단정하지 않습니다.
              </p>
              <div className="branchStack">
                {scenarios.map((branch, scenarioIndex) => {
                  const linkedRules = scenarioRules[branch.scenario_id] ?? [];
                  return (
                    <article
                      className="branchCard"
                      id={`scenario-${branch.scenario_id}`}
                      key={branch.scenario_id}
                      tabIndex={-1}
                    >
                      <KnowledgeScenarioDecision
                        contentId={entry.content_id}
                        concepts={concepts}
                        decisionFact={branch.decision_fact_ko}
                        falseOutcome={branch.when_false_ko}
                        question={branch.question_ko}
                        revisionKey={entry.reviewed_at}
                        scenarioId={branch.scenario_id}
                        trueOutcome={branch.when_true_ko}
                      />
                      <ScenarioRuleLinks
                        classes={{
                          item: styles.branchRulesItem,
                          label: styles.branchRulesLabel,
                          link: styles.branchRulesLink,
                          list: styles.branchRulesList,
                          root: styles.branchRules,
                        }}
                        rules={linkedRules}
                        scenarioNumber={scenarioIndex + 1}
                        scenarioTitle={branch.question_ko}
                      />
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {verifiedAnswer ? (
            <VerifiedLegalAnswerCard
              answer={verifiedAnswer}
              authorityTargetIds={Object.fromEntries(authorityReadingUnits.map(view => (
                [view.authorityReadingUnitId, view.cardDomId]
              )))}
              contentId={entry.content_id}
              hasAuthorityReading={Boolean(authorityReadingUnits.length)}
              hasScenarios={Boolean(scenarios.length)}
              revisionKey={entry.reviewed_at}
            />
          ) : null}

          <section className="knowledgeSection" id="rules">
            <p className="eyebrow">적용 결과와 기준</p>
            <h2>출판된 법리의 요건과 효과를 확인합니다.</h2>
            <div className="ruleStack">
              {rules.map(rule => {
                const showProposition = shouldShowPublicRuleProposition(rule.proposition_ko, rule.norm.legal_effect_ko);
                return (
                  <article className="ruleCard" id={rule.rule_id} key={rule.rule_id}>
                    <h3>{rule.title_ko}</h3>
                    {showProposition ? <p><LegalConceptText concepts={concepts} text={rule.proposition_ko} /></p> : null}
                    <dl className="normSlots">
                      <div><dt>누가</dt><dd><LegalConceptText concepts={concepts} text={rule.norm.actor_ko} /></dd></div>
                      <div><dt>어떤 때</dt><dd><LegalConceptText concepts={concepts} text={rule.norm.conditions_ko} /></dd></div>
                      <div><dt>결과</dt><dd><LegalConceptText concepts={concepts} text={rule.norm.legal_effect_ko} /></dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>

          <div id="sources">
            {authorityReadingUnits.length ? (
              <AuthorityReadingSection
                answer={verifiedAnswer}
                asOf={authorityAsOf}
                concepts={concepts}
                contentId={entry.content_id}
                revisionKey={entry.reviewed_at}
                views={authorityReadingUnits}
              />
            ) : (
              <KnowledgeSourceEvidence
                answer={verifiedAnswer}
                contentId={entry.content_id}
                revisionKey={entry.reviewed_at}
                sources={sourceViews}
                sourceTexts={publicSourceTexts}
              />
            )}
          </div>

          <section className="knowledgeSection" id="actions">
            <p className="eyebrow">증거·기한·행동</p>
            <h2>확인할 자료와 다음 행동을 한 번에 정리합니다.</h2>
            <KnowledgeActionWorkspace
              actionItems={launchJourney.actionItems}
              contentId={entry.content_id}
              deadlines={launchJourney.deadlines}
              evidenceItems={launchJourney.evidenceItems}
              factsToCheck={launchJourney.factsToCheck}
              revisionKey={entry.reviewed_at}
            />
            <p><b>주의할 점</b> · {entry.caution_ko}</p>
          </section>

          <KnowledgeFollowUpQuestions
            contentId={entry.content_id}
            revisionKey={entry.reviewed_at}
            scenarios={scenarios}
          />
        </div>

        <aside className="knowledgeAside">
          {concepts.length ? (
            <section className={styles.conceptPanel} id="concepts">
              <p className="eyebrow">본문 용어 해설</p>
              <h2>모르는 말은 여기서 이어집니다</h2>
              <p>본문의 점선 용어를 누르거나 키보드로 선택하면 쉬운 뜻이 나타나고, 개념 페이지에서 공식 근거까지 이어집니다.</p>
              {concepts.map(concept => (
                <a href={`/ko/concepts/${concept.slug}`} key={concept.concept_id}>
                  <strong>{concept.preferred_term_ko}</strong>
                  <span>{concept.plain_definition_ko}</span>
                </a>
              ))}
            </section>
          ) : null}
          {entry.lawyer_workspace_entry ? (
            <section className="lawyerWorkspacePanel">
              <p className="eyebrow">변호사 전용 사건 검토</p>
              <h2>{entry.lawyer_workspace_entry.question_ko}</h2>
              <p>아래 사실을 사건에 적용한 결론·전략·서면 방향은 자격이 확인된 변호사 작업공간에서만 다룹니다.</p>
              <ul>{entry.lawyer_workspace_entry.decision_facts_ko.map(fact => <li key={fact}>{fact}</li>)}</ul>
              <a href={entry.lawyer_workspace_entry.href}>왜 변호사만 사용할 수 있나요? <span aria-hidden="true">→</span></a>
            </section>
          ) : null}
        </aside>
      </section>

      {relatedChangeBriefs.length ? (
        <section aria-labelledby="knowledge-change-heading" className={styles.relatedChanges}>
          <div>
            <p className="eyebrow">이 질문과 관련된 법령 변화</p>
            <h2 id="knowledge-change-heading">현재 적용 상태와 달라진 내용을 함께 확인하세요.</h2>
          </div>
          <div className={styles.relatedChangeList}>
            {relatedChangeBriefs.map(brief => (
              <a href={`/ko/changes/${brief.slug}`} key={brief.change_brief_id}>
                <span className={`lifecycle ${brief.lifecycle}`}>{changeLifecycleLabel(brief.lifecycle)}</span>
                <time dateTime={brief.effective_date}>{formatKoreanLegalDate(brief.effective_date)}</time>
                <strong>{brief.title_ko}</strong>
                <small>개정 전후와 적용 경계 보기 <span aria-hidden="true">→</span></small>
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <PublicAdvertisingPlaceholder placement="knowledge-after-sources-and-authority" />
      <KnowledgeReadingPath currentTitle={entry.title_ko} sections={readingPathSections} />
      {readingPathSections.length ? (
        <PublicAdvertisingPlaceholder placement="knowledge-after-related-reading" />
      ) : null}
      </main>
    </LegalConceptLayer>
  );
}

function sourceLabel(source: import('@/types/publication').PublicKnowledgeSource): string {
  if (source.source_kind === 'precedent' || source.source_kind === 'official_document') return source.title_ko;
  return `${source.law_name_ko} ${source.article_no}`;
}

function publicSourceView(
  source: import('@/types/publication').PublicKnowledgeSource,
): PublicKnowledgeSourceView {
  const base = {
    coordinate_id: source.coordinate_id,
    official_url: browserOfficialSourceUrl(source) ?? source.official_url,
    last_verified_at: source.last_verified_at,
  };
  if (source.source_kind === 'precedent') {
    return {
      ...base,
      source_kind: 'precedent',
      title_ko: source.title_ko,
      case_number: source.case_number,
      decision_date: source.decision_date,
    };
  }
  if (source.source_kind === 'official_document') {
    return {
      ...base,
      source_kind: 'official_document',
      title_ko: source.title_ko,
      promulgation_number: source.promulgation_number,
      effective_date: source.effective_date,
    };
  }
  return {
    ...base,
    source_kind: 'statute',
    law_name_ko: source.law_name_ko,
    article_no: source.article_no,
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
