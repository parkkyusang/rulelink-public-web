type SiteIndexingEnv = {
  NEXT_PUBLIC_RULELINK_INDEXING?: string;
  VERCEL_ENV?: string;
};

export function resolveSiteIndexing(env: SiteIndexingEnv = {
  NEXT_PUBLIC_RULELINK_INDEXING: process.env.NEXT_PUBLIC_RULELINK_INDEXING,
  VERCEL_ENV: process.env.VERCEL_ENV,
}): boolean {
  if (env.NEXT_PUBLIC_RULELINK_INDEXING !== undefined && env.NEXT_PUBLIC_RULELINK_INDEXING !== '') {
    return env.NEXT_PUBLIC_RULELINK_INDEXING === 'true';
  }
  return env.VERCEL_ENV === 'production';
}

export const site = {
  name: process.env.NEXT_PUBLIC_RULELINK_SITE_NAME || 'RuleLink',
  url: process.env.NEXT_PUBLIC_RULELINK_SITE_URL || 'https://rulelink.lolphysical.xyz',
  indexing: resolveSiteIndexing(),
  description: '내 상황에서 출발해 확인할 권리와 다음 행동을 찾는 생활법률 정보 서비스',
};
