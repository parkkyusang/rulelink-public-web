import {publicationNow} from '@/lib/publication-freshness';
import {loadSiteSearchDocuments} from '@/lib/site-search-publication';
import {projectLegacySiteSearchDocuments} from '@/lib/site-search-index';

export const dynamic = 'force-static';

export async function GET() {
  const payload = {
    schema: 'rulelink_public_search_index_v1' as const,
    generated_at: publicationNow().toISOString(),
    documents: projectLegacySiteSearchDocuments(await loadSiteSearchDocuments()),
  };
  return Response.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
