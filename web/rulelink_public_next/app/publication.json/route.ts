import {loadPublishedBundle} from '@/lib/publication';

export const dynamic = 'force-static';
export const revalidate = 3600;

export async function GET() {
  const bundle = await loadPublishedBundle();
  const cards = bundle?.cards ?? [];
  const changeBriefs = bundle?.change_briefs ?? [];
  const knowledgeEntries = bundle?.knowledge?.content_entries ?? [];
  const reviewDates = [
    ...cards.map(card => card.reviewed_at),
    ...changeBriefs.map(brief => brief.reviewed_at),
    ...knowledgeEntries.map(entry => entry.reviewed_at),
  ];
  const expiryDates = [
    ...cards.map(card => card.expires_at),
    ...changeBriefs.map(brief => brief.expires_at),
    ...knowledgeEntries.map(entry => entry.expires_at),
  ];
  const published = bundle?.schema === 'rulelink_published_bundle_v1';

  return Response.json({
    schema: 'rulelink_publication_status_v1',
    status: published ? 'published' : bundle ? 'preview' : 'empty',
    snapshot_id: published ? bundle.snapshot_id : null,
    built_at: published ? bundle.built_at : null,
    counts: {
      issue_cards: cards.length,
      change_briefs: changeBriefs.length,
      knowledge_entries: knowledgeEntries.length,
      knowledge_hubs: bundle?.knowledge?.topic_hubs.length ?? 0,
      public_topics: bundle?.catalog?.topics.length ?? 0,
    },
    latest_reviewed_at: extremeDate(reviewDates, 'latest'),
    earliest_expires_at: extremeDate(expiryDates, 'earliest'),
  }, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function extremeDate(values: string[], direction: 'earliest' | 'latest'): string | null {
  if (!values.length) return null;
  return values.reduce((selected, candidate) => {
    const selectedTime = new Date(selected).getTime();
    const candidateTime = new Date(candidate).getTime();
    return direction === 'earliest'
      ? candidateTime < selectedTime ? candidate : selected
      : candidateTime > selectedTime ? candidate : selected;
  });
}
