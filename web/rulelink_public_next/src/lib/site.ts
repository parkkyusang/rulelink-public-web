export const site = {
  name: process.env.NEXT_PUBLIC_RULELINK_SITE_NAME || 'RuleLink',
  url: process.env.NEXT_PUBLIC_RULELINK_SITE_URL || 'https://rulelink.lolphysical.xyz',
  indexing: process.env.NEXT_PUBLIC_RULELINK_INDEXING === 'true',
  description: '내 상황에서 출발해 확인할 권리와 다음 행동을 찾는 생활법률 정보 서비스',
};
