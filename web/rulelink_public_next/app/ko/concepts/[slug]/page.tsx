import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {browserOfficialSourceUrl} from '@/lib/official-source-url';
import {conceptDetail, findConceptCard, listConceptCards} from '@/lib/publication';
import {site} from '@/lib/site';
import type {PublicConceptAssertion, PublicKnowledgeSource} from '@/types/publication';

import styles from '../concepts.module.css';

export const dynamic = 'force-static';

type Props = {params: Promise<{slug: string}>};

export async function generateStaticParams() {
  return (await listConceptCards()).map(concept => ({slug: concept.slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const concept = await findConceptCard((await params).slug);
  if (!concept) return {};
  const canonical = `/ko/concepts/${concept.slug}`;
  return {
    title: `${concept.preferred_term_ko} 뜻과 법률상 의미`,
    description: concept.plain_definition_ko,
    keywords: [concept.preferred_term_ko, ...concept.aliases_ko],
    alternates: {canonical},
    openGraph: {
      type: 'article',
      title: `${concept.preferred_term_ko} 뜻과 법률상 의미`,
      description: concept.plain_definition_ko,
      url: canonical,
      modifiedTime: concept.reviewed_at,
    },
  };
}

export default async function ConceptPage({params}: Props) {
  const concept = await findConceptCard((await params).slug);
  if (!concept) notFound();
  const {sources, rules, relatedConcepts, relatedEntries} = await conceptDetail(concept);
  const sourceById = new Map(sources.map(source => [source.coordinate_id, source]));
  const pageUrl = `${site.url}/ko/concepts/${concept.slug}`;

  return (
    <main className={styles.page}>
      <script
        dangerouslySetInnerHTML={{__html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'DefinedTerm',
          '@id': `${pageUrl}#concept`,
          name: concept.preferred_term_ko,
          alternateName: concept.aliases_ko,
          description: concept.plain_definition_ko,
          inDefinedTermSet: `${site.url}/ko/concepts`,
          url: pageUrl,
        }).replaceAll('<', '\\u003c')}}
        type="application/ld+json"
      />
      <nav className="breadcrumb">
        <a href="/">홈</a><span>/</span><a href="/ko/concepts">법률용어와 개념</a>
      </nav>
      <header className={styles.hero}>
        <p className="eyebrow">법률개념</p>
        <h1>{concept.preferred_term_ko}</h1>
        <p>{concept.plain_definition_ko}</p>
        <div className={styles.meta}>
          <span>개념판 {concept.version}</span>
          <span>근거 확인 {formatDate(concept.reviewed_at)}</span>
          <span>다음 재검토 {formatDate(concept.expires_at)}</span>
        </div>
      </header>

      <div className={styles.layout}>
        <div>
          <section className={styles.section}>
            <h2>한 문장으로 이해하기</h2>
            <p className={styles.definition}>{concept.plain_definition_ko}</p>
            <p className={styles.legalDefinition}><b>법률상 의미</b> · {concept.legal_definition_ko}</p>
          </section>

          <section className={styles.section}>
            <h2>요건·효과·한계</h2>
            <div className={styles.slotGrid}>
              <ConceptSlot items={concept.elements_ko} title="성립하거나 적용되는 요건" />
              <ConceptSlot items={concept.legal_effects_ko} title="법률상 효과" />
              {concept.judgment_factors_ko.length ? <ConceptSlot items={concept.judgment_factors_ko} title="판단할 때 보는 요소" /> : null}
              <ConceptSlot items={concept.limits_and_counterexamples_ko} title="한계와 주의점" />
              {concept.confused_with_ko.length ? <ConceptSlot items={concept.confused_with_ko} title="헷갈리기 쉬운 개념" /> : null}
              <ConceptSlot items={concept.examples_ko} title="쉽게 보는 예시" />
            </div>
          </section>

          <section className={styles.section}>
            <h2>문장별 공식 근거</h2>
            {concept.assertions.map(assertion => (
              <article className={styles.assertion} key={assertion.assertion_id}>
                <small>{assertionRoleLabel(assertion.role)}</small>
                <p>{assertion.text_ko}</p>
                {assertion.source_coordinate_ids.map(sourceId => {
                  const source = sourceById.get(sourceId);
                  if (!source) return null;
                  return (
                    <a href={browserOfficialSourceUrl(source) ?? source.official_url} key={sourceId} rel="noreferrer" target="_blank">
                      {sourceLabel(source)} 원문 ↗
                    </a>
                  );
                })}
              </article>
            ))}
          </section>
        </div>

        <aside className={styles.aside}>
          {concept.aliases_ko.length ? (
            <section>
              <h2>함께 찾는 말</h2>
              <p>검색 편의를 위해 연결한 표현입니다. 같은 뜻인지, 하위 개념인지, 쉬운 표현인지는 근거와 관계 분류를 따로 확인합니다.</p>
              <p>{concept.aliases_ko.join(', ')}</p>
            </section>
          ) : null}
          {rules.length ? (
            <section>
              <h2>연결 법리</h2>
              {rules.map(rule => <a href={`/ko/search?q=${encodeURIComponent(rule.title_ko)}`} key={rule.rule_id}>{rule.title_ko}</a>)}
            </section>
          ) : null}
          <section>
            <h2>공식 근거</h2>
            {sources.map(source => (
              <a href={browserOfficialSourceUrl(source) ?? source.official_url} key={source.coordinate_id} rel="noreferrer" target="_blank">
                {sourceLabel(source)} ↗
              </a>
            ))}
          </section>
          {relatedConcepts.length ? (
            <section>
              <h2>연결 개념</h2>
              {relatedConcepts.map(related => <a href={`/ko/concepts/${related.slug}`} key={related.concept_id}>{related.preferred_term_ko} →</a>)}
            </section>
          ) : null}
          {relatedEntries.length ? (
            <section>
              <h2>이 개념이 쓰이는 글</h2>
              {relatedEntries.map(entry => <a href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>{entry.title_ko} →</a>)}
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function ConceptSlot({items, title}: {items: string[]; title: string}) {
  if (!items.length) return null;
  return (
    <article className={styles.slot}>
      <h3>{title}</h3>
      <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
    </article>
  );
}

function assertionRoleLabel(role: PublicConceptAssertion['role']): string {
  return {
    plain_definition: '쉬운 설명',
    legal_definition: '법률상 정의',
    elements: '요건',
    legal_effects: '법률효과',
    judgment_factors: '판단기준',
    limits: '한계·반례',
    procedure: '절차',
  }[role];
}

function sourceLabel(source: PublicKnowledgeSource): string {
  if (source.source_kind === 'precedent' || source.source_kind === 'official_document') return source.title_ko;
  return `${source.law_name_ko} ${source.article_no}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
