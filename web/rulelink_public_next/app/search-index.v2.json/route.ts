import {publicationNow} from '@/lib/publication-freshness';
import {loadSiteSearchDocuments} from '@/lib/site-search-publication';
import {encodeSiteSearchIndex} from '@/lib/site-search-index';

export const dynamic = 'force-static';

export async function GET() {
  const payload = encodeSiteSearchIndex(
    await loadSiteSearchDocuments(),
    publicationNow().toISOString(),
  );
  return Response.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
