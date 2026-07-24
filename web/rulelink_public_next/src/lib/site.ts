import {identityValueError, publicUrlError} from './public-identity-validation.ts';

type SiteIndexingEnv = {
  NEXT_PUBLIC_RULELINK_INDEXING?: string;
  VERCEL_ENV?: string;
};

export type SiteIdentityEnvironment = SiteIndexingEnv & {
  NEXT_PUBLIC_RULELINK_OPERATOR_NAME?: string;
  NEXT_PUBLIC_RULELINK_SITE_ENGLISH_NAME?: string;
  NEXT_PUBLIC_RULELINK_SITE_NAME?: string;
  NEXT_PUBLIC_RULELINK_SITE_URL?: string;
};

const defaultIdentity = {
  englishName: 'RuleLink',
  name: 'RuleLink',
  operatorName: '리알레',
  url: 'https://rulelink.lolphysical.xyz',
} as const;

export function resolveSiteIndexing(env: SiteIndexingEnv = {
  NEXT_PUBLIC_RULELINK_INDEXING: process.env.NEXT_PUBLIC_RULELINK_INDEXING,
  VERCEL_ENV: process.env.VERCEL_ENV,
}): boolean {
  if (env.VERCEL_ENV === 'production') return true;
  return env.NEXT_PUBLIC_RULELINK_INDEXING === 'true';
}

export function resolveSiteIdentity(
  environment: SiteIdentityEnvironment =
    process.env as SiteIdentityEnvironment,
) {
  const name = resolvedIdentityValue(
    environment.NEXT_PUBLIC_RULELINK_SITE_NAME,
    defaultIdentity.name,
    'NEXT_PUBLIC_RULELINK_SITE_NAME',
  );
  const englishName = resolvedIdentityValue(
    environment.NEXT_PUBLIC_RULELINK_SITE_ENGLISH_NAME,
    environment.NEXT_PUBLIC_RULELINK_SITE_NAME?.trim() || defaultIdentity.englishName,
    'NEXT_PUBLIC_RULELINK_SITE_ENGLISH_NAME',
  );
  const operatorName = resolvedIdentityValue(
    environment.NEXT_PUBLIC_RULELINK_OPERATOR_NAME,
    defaultIdentity.operatorName,
    'NEXT_PUBLIC_RULELINK_OPERATOR_NAME',
  );
  const url = resolvedOrigin(
    environment.NEXT_PUBLIC_RULELINK_SITE_URL,
    defaultIdentity.url,
  );
  return {
    englishName,
    indexing: resolveSiteIndexing(environment),
    name,
    operatorName,
    url,
  };
}

function resolvedIdentityValue(
  candidate: string | undefined,
  fallback: string,
  field: string,
): string {
  if (candidate === undefined) return fallback;
  const value = candidate.trim();
  const error = identityValueError(value);
  if (error) throw new Error(`${field}: ${error}`);
  if (/[<>&]/u.test(value)) {
    throw new Error(`${field}: HTML 제어문자를 사용할 수 없습니다.`);
  }
  if (value.length > 80) throw new Error(`${field}: 80자 이하여야 합니다.`);
  return value;
}

function resolvedOrigin(candidate: string | undefined, fallback: string): string {
  if (candidate === undefined) return fallback;
  const value = candidate.trim();
  const error = publicUrlError(value);
  if (error) throw new Error(`NEXT_PUBLIC_RULELINK_SITE_URL: ${error}`);
  const parsed = new URL(value);
  if (
    parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.port
  ) {
    throw new Error(
      'NEXT_PUBLIC_RULELINK_SITE_URL: 경로·쿼리·fragment·포트가 없는 https 원점이어야 합니다.',
    );
  }
  const hostError = deploymentHostError(parsed.hostname);
  if (hostError) {
    throw new Error(`NEXT_PUBLIC_RULELINK_SITE_URL: ${hostError}`);
  }
  return parsed.origin;
}

function deploymentHostError(rawHostname: string): string | null {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (
    !hostname.includes('.')
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || ['.invalid', '.test', '.example', '.local', '.internal', '.home', '.lan']
      .some(suffix => hostname.endsWith(suffix))
  ) {
    return '공개 배포가 불가능한 예약·내부 호스트를 사용할 수 없습니다.';
  }
  if (privateIpv4(hostname) || privateIpv6(hostname)) {
    return 'loopback·사설·링크 로컬 IP를 공개 원점으로 사용할 수 없습니다.';
  }
  return null;
}

function privateIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) return false;
  const octets = hostname.split('.').map(Number);
  if (octets.some(octet => octet > 255)) return true;
  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && [18, 19].includes(second));
}

function privateIpv6(hostname: string): boolean {
  return hostname === '::'
    || hostname === '::1'
    || /^f[cd]/u.test(hostname)
    || /^fe[89ab]/u.test(hostname);
}

const identity = resolveSiteIdentity();

export const site = {
  ...identity,
  description: '내 상황에서 출발해 확인할 권리와 다음 행동을 찾는 생활법률 정보 서비스',
};
