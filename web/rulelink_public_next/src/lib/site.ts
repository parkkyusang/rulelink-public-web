import {BlockList, isIP} from 'node:net';

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

const specialPurposeIpv4Ranges = new BlockList();
const specialPurposeIpv6Ranges = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  specialPurposeIpv4Ranges.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['100:0:0:1::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['2620:4f:8000::', 48],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  specialPurposeIpv6Ranges.addSubnet(network, prefix, 'ipv6');
}

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
  const hostError = publicDeploymentHostError(parsed.hostname);
  if (hostError) {
    throw new Error(`NEXT_PUBLIC_RULELINK_SITE_URL: ${hostError}`);
  }
  return parsed.origin;
}

export function publicDeploymentHostError(
  rawHostname: string,
): string | null {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/gu, '');
  const ipVersion = isIP(hostname);
  if (ipVersion) {
    const blocked = ipVersion === 4
      ? specialPurposeIpv4Ranges.check(hostname, 'ipv4')
      : specialPurposeIpv6Ranges.check(hostname, 'ipv6');
    return blocked
      ? '특수목적·예약 IP 주소를 공개 원점으로 사용할 수 없습니다.'
      : null;
  }
  if (
    !hostname.includes('.')
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || ['.invalid', '.test', '.example', '.local', '.internal', '.home', '.lan']
      .some(suffix => hostname.endsWith(suffix))
  ) {
    return '공개 배포가 불가능한 예약·내부 호스트를 사용할 수 없습니다.';
  }
  return null;
}

const identity = resolveSiteIdentity();

export const site = {
  ...identity,
  description: '내 상황에서 출발해 확인할 권리와 다음 행동을 찾는 생활법률 정보 서비스',
};
