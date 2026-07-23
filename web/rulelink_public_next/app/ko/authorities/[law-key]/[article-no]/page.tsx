import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {AuthorityReadingSection} from '@/components/authority-reading-section';
import {LegalConceptLayer} from '@/components/legal-concept-text';
import {
  authorityPublicationAsOf,
  findAuthorityReadingUnit,
  listAuthorityReadingUnits,
  listConceptCards,
} from '@/lib/publication';
import {authorityRouteParams} from '@/lib/authority-reading';

import styles from './authority.module.css';

export const dynamic = 'force-static';
export const dynamicParams = false;

type Props = {
  params: Promise<{
    'article-no': string;
    'law-key': string;
  }>;
};

export async function generateStaticParams() {
  return authorityRouteParams(await listAuthorityReadingUnits()).map(params => ({
    'article-no': params.articleNo,
    'law-key': params.lawKey,
  }));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const route = await params;
  const view = await findAuthorityReadingUnit(route['law-key'], route['article-no']);
  if (!view) return {};
  const canonical = view.routeHref;
  return {
    title: view.titleKo,
    description: view.summaryKo,
    alternates: {canonical},
    openGraph: {
      type: 'article',
      title: view.titleKo,
      description: view.summaryKo,
      url: canonical,
    },
  };
}

export default async function AuthorityPage({params}: Props) {
  const route = await params;
  const view = await findAuthorityReadingUnit(route['law-key'], route['article-no']);
  if (!view) notFound();
  const [asOf, concepts] = await Promise.all([
    authorityPublicationAsOf(),
    listConceptCards(),
  ]);

  return (
    <LegalConceptLayer>
      <main className={styles.page}>
        <nav className="breadcrumb">
          <a href="/">홈</a>
          <span>/</span>
          <a href="/ko/knowledge">생활법률 지식</a>
          <span>/</span>
          <span>조문 읽기</span>
        </nav>
        <header className={styles.hero}>
          <p className="eyebrow">조문 읽기 정본</p>
          <h1>{view.titleKo}</h1>
          <p>{view.summaryKo}</p>
          <a href="#statute-reading">쉬운 조문 지도부터 읽기</a>
        </header>
        <AuthorityReadingSection
          asOf={asOf}
          concepts={concepts}
          views={[view]}
        />
      </main>
    </LegalConceptLayer>
  );
}
