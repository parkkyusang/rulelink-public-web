import type {MetadataRoute} from 'next';

import {site} from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: site.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f4ed',
    theme_color: '#17231f',
    lang: 'ko',
  };
}
