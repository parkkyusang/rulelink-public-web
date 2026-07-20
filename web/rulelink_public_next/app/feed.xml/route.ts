import {listChangeBriefs} from '@/lib/publication';
import {site} from '@/lib/site';

export const dynamic = 'force-static';

export async function GET() {
  const briefs = await listChangeBriefs();
  const items = briefs.map(brief => {
    const url = `${site.url}/ko/changes/${brief.slug}`;
    return [
      '<item>',
      `<title>${escapeXml(brief.title_ko)}</title>`,
      `<link>${escapeXml(url)}</link>`,
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `<description>${escapeXml(brief.summary_ko)}</description>`,
      `<category>${escapeXml(brief.law_name_ko)}</category>`,
      `<pubDate>${new Date(brief.reviewed_at).toUTCString()}</pubDate>`,
      '</item>',
    ].join('');
  }).join('');
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(site.name)} 새로 바뀌는 법</title>`,
    `<link>${escapeXml(site.url)}</link>`,
    `<atom:link href="${escapeXml(`${site.url}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    `<description>${escapeXml('시행 예정·최근 시행 법령의 구법·신법 차이와 생활상황 영향')}</description>`,
    '<language>ko-KR</language>',
    items,
    '</channel>',
    '</rss>',
  ].join('');
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
