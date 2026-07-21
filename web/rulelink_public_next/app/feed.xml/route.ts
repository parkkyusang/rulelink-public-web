import {listChangeBriefs, listKnowledgeEntries} from '@/lib/publication';
import {site} from '@/lib/site';

export const dynamic = 'force-static';
export const revalidate = 3600;

export async function GET() {
  const [briefs, knowledgeEntries] = await Promise.all([listChangeBriefs(), listKnowledgeEntries()]);
  const changeItems = briefs.map(brief => {
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
  });
  const knowledgeItems = knowledgeEntries.map(entry => {
    const url = `${site.url}/ko/knowledge/${entry.slug}`;
    return [
      '<item>',
      `<title>${escapeXml(entry.title_ko)}</title>`,
      `<link>${escapeXml(url)}</link>`,
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `<description>${escapeXml(entry.one_line_answer_ko)}</description>`,
      '<category>연결된 법률지식</category>',
      `<pubDate>${new Date(entry.reviewed_at).toUTCString()}</pubDate>`,
      '</item>',
    ].join('');
  });
  const items = [...changeItems, ...knowledgeItems].join('');
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(site.name)} 법률지식 업데이트</title>`,
    `<link>${escapeXml(site.url)}</link>`,
    `<atom:link href="${escapeXml(`${site.url}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    `<description>${escapeXml('구법·현행법 변화, 법리, 사실분기와 생활상황별 확인사항')}</description>`,
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
