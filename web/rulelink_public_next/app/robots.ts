import type {MetadataRoute} from 'next';

import {site} from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: site.indexing
      ? {userAgent: '*', allow: '/'}
      : {userAgent: '*', disallow: '/'},
    sitemap: site.indexing ? `${site.url}/sitemap.xml` : undefined,
  };
}
