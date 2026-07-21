import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {findKnowledgeEntry, knowledgeDetail, listKnowledgeEntries} from '@/lib/publication';

export const dynamic = 'force-static';

type Props = {params: Promise<{slug: string}>};

export async function generateStaticParams() {
  return (await listKnowledgeEntries()).map(entry => ({slug: entry.slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const entry = await findKnowledgeEntry((await params).slug);
  return entry ? {title: entry.title_ko, description: entry.one_line_answer_ko} : {};
}

export default async function KnowledgePage({params}: Props) {
  const {slug} = await params;
  const entry = await findKnowledgeEntry(slug);
  if (!entry) notFound();
  const {rules, scenarios, sources, related} = await knowledgeDetail(entry);
  return (
    <main className="knowledgePage">
      <nav className="breadcrumb"><a href="/">홈</a><span>/</span><span>생활법률 지식</span></nav>
      <header className="knowledgeHero">
        <p className="eyebrow">{contentTypeLabel(entry.content_type)}</p>
        <h1>{entry.title_ko}</h1>
        <p>{entry.one_line_answer_ko}</p>
        <span className="audienceBadge">{entry.audience_situation_ko}</span>
      </header>

      <section className="knowledgeLayout">
        <div>
          <section className="knowledgeSection">
            <p className="eyebrow">적용 법리</p>
            <h2>먼저 기준을 확인합니다.</h2>
            <div className="ruleStack">
              {rules.map(rule => (
                <article className="ruleCard" key={rule.rule_id}>
                  <h3>{rule.title_ko}</h3>
                  <p>{rule.proposition_ko}</p>
                  <dl className="normSlots">
                    <div><dt>누가</dt><dd>{rule.norm.actor_ko}</dd></div>
                    <div><dt>어떤 때</dt><dd>{rule.norm.conditions_ko}</dd></div>
                    <div><dt>결과</dt><dd>{rule.norm.legal_effect_ko}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          {scenarios.length ? (
            <section className="knowledgeSection">
              <p className="eyebrow">결론을 가르는 사실</p>
              <h2>내 상황은 어느 쪽입니까?</h2>
              <div className="branchStack">
                {scenarios.map(branch => (
                  <article className="branchCard" key={branch.scenario_id}>
                    <h3>{branch.question_ko}</h3>
                    <p className="decisionFact">확인할 사실 · {branch.decision_fact_ko}</p>
                    <div className="branchOutcomes">
                      <p><b>해당하면</b>{branch.when_true_ko}</p>
                      <p><b>해당하지 않으면</b>{branch.when_false_ko}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="knowledgeAside">
          {entry.concierge_entry ? (
            <section className="conciergePanel">
              <p className="eyebrow">개별 사실 검토</p>
              <h2>{entry.concierge_entry.question_ko}</h2>
              <ul>{entry.concierge_entry.decision_facts_ko.map(fact => <li key={fact}>{fact}</li>)}</ul>
              <a href={entry.concierge_entry.href}>룰링크 컨시어지에서 이어서 검토 <span aria-hidden="true">→</span></a>
            </section>
          ) : null}
          <section className="knowledgeSources">
            <h2>공식 근거</h2>
            {sources.map(source => (
              <a href={source.official_url} key={source.coordinate_id} rel="noreferrer" target="_blank">
                공식 원문 보기 <span aria-hidden="true">↗</span>
              </a>
            ))}
          </section>
        </aside>
      </section>

      {related.length ? (
        <section className="relatedSection">
          <h2>같이 확인할 내용</h2>
          <div className="relatedGrid">
            {related.map(item => <a href={`/ko/knowledge/${item.slug}`} key={item.content_id}><strong>{item.title_ko}</strong><span>내용 보기 →</span></a>)}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function contentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    law_change: '법령 변경',
    doctrine_explainer: '법리 해설',
    fact_branch: '사실 분기',
    precedent_doctrine: '판례 법리',
    similar_case_comparison: '유사사례 비교',
    misconception_correction: '오해 바로잡기',
    procedure_evidence: '절차와 증거',
    recurring_issue_generalization: '반복 쟁점',
  };
  return labels[type] ?? '생활법률 지식';
}
