import {publicationNow} from '@/lib/publication-freshness';
import {loadSiteSearchDocuments} from '@/lib/site-search-publication';

import type {SiteSearchIndexPayload} from '@/lib/site-search-discovery';

export const dynamic = 'force-static';

export async function GET() {
  const payload: SiteSearchIndexPayload = {
    schema: 'rulelink_public_search_index_v1',
    generated_at: publicationNow().toISOString(),
    documents: await loadSiteSearchDocuments(),
  };
  return Response.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
