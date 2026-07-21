import type {Metadata} from 'next';

import {listConceptCards} from '@/lib/publication';

import styles from './concepts.module.css';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '법률용어와 개념',
  description: '어려운 법률용어를 쉬운 설명, 법률상 의미, 요건과 효과, 공식 근거로 나누어 확인합니다.',
  alternates: {canonical: '/ko/concepts'},
};

export default async function ConceptsPage() {
  const concepts = await listConceptCards();
  return (
    <main className={styles.page}>
      <nav className="breadcrumb"><a href="/">홈</a><span>/</span><span>법률용어와 개념</span></nav>
      <header className={styles.hero}>
        <p className="eyebrow">연결되는 법률개념</p>
        <h1>모르는 단어에서 멈추지 않도록</h1>
        <p>
          쉬운 뜻만 보여주고 끝내지 않습니다. 법률상 의미, 성립 요건, 법률효과와 한계,
          그리고 확인할 수 있는 공식 원문을 하나의 개념 페이지에 연결합니다.
        </p>
      </header>
      {concepts.length ? (
        <section className={styles.grid} aria-label="공개 법률개념">
          {concepts.map(concept => (
            <a className={styles.card} href={`/ko/concepts/${concept.slug}`} key={concept.concept_id}>
              <p className="eyebrow">법률개념</p>
              <h2>{concept.preferred_term_ko}</h2>
              <p>{concept.plain_definition_ko}</p>
              <span className={styles.aliases}>
                {concept.aliases_ko.length ? `함께 찾는 말 · ${concept.aliases_ko.join(', ')}` : '근거와 요건 확인 →'}
              </span>
            </a>
          ))}
        </section>
      ) : (
        <p className={styles.empty}>검증된 법률개념을 순차적으로 공개하고 있습니다.</p>
      )}
    </main>
  );
}
