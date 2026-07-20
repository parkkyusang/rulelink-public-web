import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {IssueExplorer} from '@/components/issue-explorer';
import {cardsForTopic, findPublishedTopic, listPublishedTopics} from '@/lib/publication';

type PageProps = {params: Promise<{slug: string}>};

export async function generateStaticParams() {
  return (await listPublishedTopics()).map(topic => ({slug: topic.slug}));
}

export async function generateMetadata({params}: PageProps): Promise<Metadata> {
  const topic = await findPublishedTopic((await params).slug);
  if (!topic) return {};
  const path = `/ko/topics/${topic.slug}`;
  return {
    title: topic.title_ko,
    description: topic.description_ko,
    alternates: {canonical: path},
    openGraph: {title: topic.title_ko, description: topic.description_ko, url: path},
  };
}

export default async function TopicPage({params}: PageProps) {
  const topic = await findPublishedTopic((await params).slug);
  if (!topic) notFound();
  const cards = await cardsForTopic(topic);
  return (
    <main className="topicPage">
      <nav aria-label="현재 위치" className="breadcrumb"><a href="/">홈</a><span aria-hidden="true">/</span><span aria-current="page">{topic.title_ko}</span></nav>
      <header className="topicHero">
        <p className="eyebrow">상황별 생활법률</p>
        <h1>{topic.title_ko}</h1>
        <p>{topic.description_ko}</p>
      </header>
      <IssueExplorer cards={cards} initialTopicId={topic.topic_id} topics={[topic]} />
    </main>
  );
}
