import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {KnowledgeActionWorkspace} from '@/components/knowledge-action-workspace';
import {KnowledgeReadingPath} from '@/components/knowledge-reading-path';
import {LegalConceptLayer, LegalConceptText} from '@/components/legal-concept-text';
import {OfficialSourceJump} from '@/components/official-source-jump';
import {knowledgeContentTypeLabel} from '@/lib/content-labels';
import {browserOfficialSourceUrl} from '@/lib/official-source-url';
import {findKnowledgeEntry, knowledgeDetail, listKnowledgeEntries} from '@/lib/publication';
import {shouldShowPublicRuleProposition} from '@/lib/public-rule-presentation';
import {site} from '@/lib/site';
import {buildKnowledgePageStructuredData} from '@/lib/public-structured-data';
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
  const {concepts, rules, scenarios, scenarioRules, sources, hubs, readingPathSections} = await knowledgeDetail(entry);
  const canonicalUrl = `${site.url}/ko/knowledge/${entry.slug}`;
  const officialSources = sources.flatMap(source => {
    const url = browserOfficialSourceUrl(source) ?? source.official_url;
    return url ? [{name: sourceLabel(source), url}] : [];
  });
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
          expiresAt: entry.expires_at,
          officialSources,
          pageUrl: canonicalUrl,
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
      <nav className="breadcrumb">
        <a href="/">홈</a><span>/</span><a href="/ko/knowledge">생활법률 지식</a>
        {hubs[0] ? <><span>/</span><a href={`/ko/hubs/${hubs[0].slug}`}>{hubs[0].title_ko}</a></> : null}
      </nav>
      <header className="knowledgeHero">
        <p className="eyebrow">{knowledgeContentTypeLabel(entry.content_type)}</p>
        <h1>{entry.title_ko}</h1>
        <p><LegalConceptText concepts={concepts} text={entry.one_line_answer_ko} /></p>
        <span className="audienceBadge">{entry.audience_situation_ko}</span>
        <div aria-label="콘텐츠 기준일" className={styles.trust}>
          <span><b>기준 확인</b>{formatDate(entry.reviewed_at)}</span>
          <span><b>다음 점검</b>{formatDate(entry.expires_at)}</span>
          <span><b>공식 근거</b>{sources.length}건 연결</span>
        </div>
        {hubs.length ? (
          <nav aria-label="소속 주제" className={styles.hubTrail}>
            <span>이 글이 속한 주제</span>
            {hubs.map(hub => <a href={`/ko/hubs/${hub.slug}`} key={hub.hub_id}>{hub.title_ko} →</a>)}
          </nav>
        ) : null}
      </header>

      <nav aria-label="이 글 안에서 이동" className="knowledgeSectionNav">
        <span>이 글에서</span>
        <a href="#summary">핵심 정리</a>
        {concepts.length ? <a href="#concepts">용어 해설</a> : null}
        <a href="#rules">적용 법리</a>
        {scenarios.length ? <a href="#scenarios">결론 사실</a> : null}
        <a href="#actions">할 일과 자료</a>
        {readingPathSections.length ? <a href="#reading-path">다음 읽기</a> : null}
        <OfficialSourceJump targetId="sources" />
      </nav>

      <section className="knowledgeLayout">
        <div>
          <section className="knowledgeSection" id="summary">
            <p className="eyebrow">핵심 정리</p>
            <h2>무엇부터 확인해야 하나요?</h2>
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

          <section className="knowledgeSection" id="rules">
            <p className="eyebrow">적용 법리</p>
            <h2>먼저 기준을 확인합니다.</h2>
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

          {scenarios.length ? (
            <section className="knowledgeSection" id="scenarios">
              <p className="eyebrow">결론을 가르는 사실</p>
              <h2>내 상황은 어느 쪽입니까?</h2>
              <div className="branchStack">
                {scenarios.map(branch => {
                  const linkedRules = scenarioRules[branch.scenario_id] ?? [];
                  return (
                    <article className="branchCard" key={branch.scenario_id}>
                      <h3><LegalConceptText concepts={concepts} text={branch.question_ko} /></h3>
                      <p className="decisionFact">확인할 사실 · <LegalConceptText concepts={concepts} text={branch.decision_fact_ko} /></p>
                      <div className="branchOutcomes">
                        <p><b>해당하면</b><LegalConceptText concepts={concepts} text={branch.when_true_ko} /></p>
                        <p><b>해당하지 않으면</b><LegalConceptText concepts={concepts} text={branch.when_false_ko} /></p>
                      </div>
                      {linkedRules.length ? (
                        <div aria-label="이 사실분기에 연결된 법리" className={styles.branchRules}>
                          <span className={styles.branchRulesLabel}>연결 법리</span>
                          {linkedRules.map(rule => (
                            <a href={`#${rule.rule_id}`} key={rule.rule_id}>
                              {rule.title_ko} <span aria-hidden="true">↑</span>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="knowledgeSection" id="actions">
            <p className="eyebrow">지금 할 일과 자료</p>
            <h2>다음 순서로 준비합니다.</h2>
            <KnowledgeActionWorkspace
              actionSteps={entry.action_steps_ko}
              contentId={entry.content_id}
              factsToCheck={entry.facts_to_check_ko}
              revisionKey={entry.reviewed_at}
            />
            <p><b>주의할 점</b> · {entry.caution_ko}</p>
          </section>
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
          <section className="knowledgeSources" id="sources">
            <h2>공식 근거</h2>
            <p className={styles.sourcesIntro}>원문 주소와 마지막 확인일을 함께 표시합니다.</p>
            {sources.map(source => (
              <a className={styles.sourceLink} href={browserOfficialSourceUrl(source) ?? source.official_url} key={source.coordinate_id} rel="noreferrer" target="_blank">
                <span>{sourceLabel(source)} 원문 <span aria-hidden="true">↗</span></span>
                <small>원문 확인 {formatDate(source.last_verified_at)}</small>
              </a>
            ))}
          </section>
        </aside>
      </section>

      <KnowledgeReadingPath currentTitle={entry.title_ko} sections={readingPathSections} />
      </main>
    </LegalConceptLayer>
  );
}

function sourceLabel(source: import('@/types/publication').PublicKnowledgeSource): string {
  if (source.source_kind === 'precedent' || source.source_kind === 'official_document') return source.title_ko;
  return `${source.law_name_ko} ${source.article_no}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
