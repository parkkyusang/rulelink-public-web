import type {SourceCoordinate} from '@/types/publication';

const OFFICIAL_HOSTS = new Set(['law.go.kr', 'www.law.go.kr']);

/**
 * 국가법령정보센터의 수집용 API 주소와 폐기된 lawView 주소를
 * 일반 사용자가 열 수 있는 공개 법령·조문 주소로 바꾼다.
 */
export function browserOfficialSourceUrl(
  source: Pick<SourceCoordinate, 'official_url' | 'article_no' | 'law_name_ko'>,
  fallbackLawNameKo = '',
): string | undefined {
  const original = source.official_url?.trim();
  if (!original) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(original);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' || !OFFICIAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    return original;
  }
  if (parsed.pathname.startsWith('/법령/') || parsed.pathname.startsWith('/%EB%B2%95%EB%A0%B9/')) {
    return original;
  }

  const lawNameKo = (source.law_name_ko || fallbackLawNameKo).trim();
  if (lawNameKo) {
    const segments = ['법령', lawNameKo];
    if (source.article_no?.trim()) segments.push(source.article_no.trim());
    return `https://www.law.go.kr/${segments.map(encodeURIComponent).join('/')}`;
  }

  // 수집용 DRF 주소와 현재 404인 lawView 주소는 공개 링크로 내보내지 않는다.
  if (parsed.pathname.startsWith('/DRF/') || parsed.pathname.endsWith('/lawView.do')) {
    return undefined;
  }
  return original;
}
