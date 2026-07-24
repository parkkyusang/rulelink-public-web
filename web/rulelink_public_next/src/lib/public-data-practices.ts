import {
  identityValueError,
} from './public-identity-validation.ts';
import {
  resolvePublicTrustConfig,
  type PublicTrustConfig,
  type PublicTrustEnvironment,
} from './public-trust.ts';

export type PublicDataCategory =
  | 'essential'
  | 'functional'
  | 'analytics'
  | 'advertising';

export type PublicDataActivationMode =
  | 'page-request'
  | 'after-user-action'
  | 'denied';

export type PublicDataTransfer = {
  description: string;
  processingRegions: string[];
  serverTransmission: boolean;
  thirdPartyTransmission: boolean;
};

export type PublicDataPractice = {
  activationMode: PublicDataActivationMode;
  category: PublicDataCategory;
  dataTypes: string[];
  id: string;
  provider: string;
  purpose: string;
  retention: string;
  status: 'active' | 'disabled';
  storageKeys: string[];
  transfer: PublicDataTransfer;
};

export type PublicPrivacyEnvironment = PublicTrustEnvironment & {
  RULELINK_PUBLIC_ADVERTISING_ENABLED?: string;
  RULELINK_PUBLIC_ANALYTICS_ENABLED?: string;
  RULELINK_PUBLIC_CERTIFIED_CMP_PROVIDER?: string;
  RULELINK_PUBLIC_HOSTING_DATA_TYPES_JSON?: string;
  RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON?: string;
  RULELINK_PUBLIC_HOSTING_PROVIDER?: string;
  RULELINK_PUBLIC_HOSTING_PURPOSE?: string;
  RULELINK_PUBLIC_HOSTING_RETENTION?: string;
  RULELINK_PUBLIC_HOSTING_TRANSFER_DESCRIPTION?: string;
  RULELINK_PUBLIC_HOSTING_TRANSFER_THIRD_PARTY?: string;
  RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE?: string;
  RULELINK_PUBLIC_PRIVACY_ENABLED?: string;
  RULELINK_PUBLIC_PRIVACY_VERSION?: string;
  RULELINK_PUBLIC_PRIVACY_WITHDRAWAL?: string;
};

export type PublicPrivacyConfig = {
  effectiveDate: string;
  inventory: PublicDataPractice[];
  trust: PublicTrustConfig;
  version: string;
  withdrawal: string;
};

const checklistPractice: PublicDataPractice = {
  activationMode: 'after-user-action',
  category: 'functional',
  dataTypes: ['사용자가 체크한 사실·행동 항목의 내부 식별자'],
  id: 'device-checklist',
  provider: '사용자의 현재 브라우저',
  purpose: '상세 글의 확인자료와 다음 행동 진행 상태를 현재 기기에서 복원',
  retention: '사용자가 초기화하거나 브라우저 저장소를 삭제할 때까지',
  status: 'active',
  storageKeys: ['rulelink-checklist-v1:{content_id}:{revision_key}'],
  transfer: {
    description: '서버 또는 제3자에게 전송하지 않고 현재 브라우저에만 저장',
    processingRegions: ['사용자 기기'],
    serverTransmission: false,
    thirdPartyTransmission: false,
  },
};

const deniedPractices: PublicDataPractice[] = [
  {
    activationMode: 'denied',
    category: 'analytics',
    dataTypes: [],
    id: 'analytics-disabled',
    provider: '없음',
    purpose: '방문 분석을 사용하지 않음',
    retention: '저장하지 않음',
    status: 'disabled',
    storageKeys: [],
    transfer: {
      description: '수집·저장·전송하지 않음',
      processingRegions: [],
      serverTransmission: false,
      thirdPartyTransmission: false,
    },
  },
  {
    activationMode: 'denied',
    category: 'advertising',
    dataTypes: [],
    id: 'advertising-disabled',
    provider: '없음',
    purpose: '맞춤형·행동기반 광고를 사용하지 않음',
    retention: '저장하지 않음',
    status: 'disabled',
    storageKeys: [],
    transfer: {
      description: '수집·저장·전송하지 않음',
      processingRegions: [],
      serverTransmission: false,
      thirdPartyTransmission: false,
    },
  },
];

export function resolvePublicDataPractices(
  environment: PublicPrivacyEnvironment =
    process.env as PublicPrivacyEnvironment,
): PublicDataPractice[] {
  const privacy = resolvePublicPrivacyConfig(environment);
  return privacy?.inventory ?? [
    checklistPractice,
    ...deniedPractices,
  ];
}

export function resolvePublicPrivacyConfig(
  environment: PublicPrivacyEnvironment =
    process.env as PublicPrivacyEnvironment,
): PublicPrivacyConfig | null {
  if (environment.RULELINK_PUBLIC_PRIVACY_ENABLED !== 'true') return null;
  if (validatePublicPrivacyConfiguration(environment).length) return null;
  const trust = resolvePublicTrustConfig(environment)!;
  const dataTypes = parseStringArray(
    environment.RULELINK_PUBLIC_HOSTING_DATA_TYPES_JSON!,
  ).value;
  const processingRegions = parseStringArray(
    environment.RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON!,
  ).value;
  const thirdPartyTransmission =
    environment.RULELINK_PUBLIC_HOSTING_TRANSFER_THIRD_PARTY === 'true';
  const hostingPractice: PublicDataPractice = {
    activationMode: 'page-request',
    category: 'essential',
    dataTypes,
    id: 'hosting-request-logs',
    provider: environment.RULELINK_PUBLIC_HOSTING_PROVIDER!.trim(),
    purpose: environment.RULELINK_PUBLIC_HOSTING_PURPOSE!.trim(),
    retention: environment.RULELINK_PUBLIC_HOSTING_RETENTION!.trim(),
    status: 'active',
    storageKeys: [],
    transfer: {
      description:
        environment.RULELINK_PUBLIC_HOSTING_TRANSFER_DESCRIPTION!.trim(),
      processingRegions,
      serverTransmission: true,
      thirdPartyTransmission,
    },
  };
  return {
    effectiveDate:
      environment.RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE!.trim(),
    inventory: [
      hostingPractice,
      checklistPractice,
      ...deniedPractices,
    ],
    trust,
    version: environment.RULELINK_PUBLIC_PRIVACY_VERSION!.trim(),
    withdrawal:
      environment.RULELINK_PUBLIC_PRIVACY_WITHDRAWAL!.trim(),
  };
}

export function validatePublicPrivacyConfiguration(
  environment: PublicPrivacyEnvironment,
): string[] {
  const errors: string[] = [];
  validateBoolean(
    environment.RULELINK_PUBLIC_PRIVACY_ENABLED,
    'RULELINK_PUBLIC_PRIVACY_ENABLED',
    errors,
  );
  validateBoolean(
    environment.RULELINK_PUBLIC_ANALYTICS_ENABLED,
    'RULELINK_PUBLIC_ANALYTICS_ENABLED',
    errors,
  );
  validateBoolean(
    environment.RULELINK_PUBLIC_ADVERTISING_ENABLED,
    'RULELINK_PUBLIC_ADVERTISING_ENABLED',
    errors,
  );

  for (const [field, enabled] of [
    ['RULELINK_PUBLIC_ANALYTICS_ENABLED', environment.RULELINK_PUBLIC_ANALYTICS_ENABLED],
    ['RULELINK_PUBLIC_ADVERTISING_ENABLED', environment.RULELINK_PUBLIC_ADVERTISING_ENABLED],
  ] as const) {
    if (enabled !== 'true') continue;
    if (identityValueError(environment.RULELINK_PUBLIC_CERTIFIED_CMP_PROVIDER)) {
      errors.push(`${field}=true에는 검증된 RULELINK_PUBLIC_CERTIFIED_CMP_PROVIDER가 필요합니다.`);
    }
    errors.push(`${field}=true는 현재 공개사이트에서 지원하지 않습니다.`);
  }

  if (environment.RULELINK_PUBLIC_PRIVACY_ENABLED !== 'true') return errors;
  const trust = resolvePublicTrustConfig(environment);
  if (!trust) {
    errors.push('개인정보 처리방침을 공개하려면 완전한 공개 신뢰 설정이 필요합니다.');
  }
  for (const [field, value] of [
    ['RULELINK_PUBLIC_PRIVACY_VERSION', environment.RULELINK_PUBLIC_PRIVACY_VERSION],
    ['RULELINK_PUBLIC_HOSTING_PROVIDER', environment.RULELINK_PUBLIC_HOSTING_PROVIDER],
    ['RULELINK_PUBLIC_HOSTING_PURPOSE', environment.RULELINK_PUBLIC_HOSTING_PURPOSE],
    ['RULELINK_PUBLIC_HOSTING_RETENTION', environment.RULELINK_PUBLIC_HOSTING_RETENTION],
    ['RULELINK_PUBLIC_HOSTING_TRANSFER_DESCRIPTION', environment.RULELINK_PUBLIC_HOSTING_TRANSFER_DESCRIPTION],
    ['RULELINK_PUBLIC_PRIVACY_WITHDRAWAL', environment.RULELINK_PUBLIC_PRIVACY_WITHDRAWAL],
  ] as const) {
    const error = identityValueError(value);
    if (error) errors.push(`${field}: ${error}`);
  }
  const effectiveDate =
    environment.RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE?.trim() ?? '';
  const parsedEffectiveDate = Date.parse(`${effectiveDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(effectiveDate)
    || Number.isNaN(parsedEffectiveDate)
    || new Date(parsedEffectiveDate).toISOString().slice(0, 10) !== effectiveDate
  ) {
    errors.push('RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE는 유효한 YYYY-MM-DD여야 합니다.');
  }
  for (const [field, value] of [
    ['RULELINK_PUBLIC_HOSTING_DATA_TYPES_JSON', environment.RULELINK_PUBLIC_HOSTING_DATA_TYPES_JSON],
    ['RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON', environment.RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON],
  ] as const) {
    const parsed = parseStringArray(value);
    if (parsed.error) errors.push(`${field}: ${parsed.error}`);
  }
  validateBoolean(
    environment.RULELINK_PUBLIC_HOSTING_TRANSFER_THIRD_PARTY,
    'RULELINK_PUBLIC_HOSTING_TRANSFER_THIRD_PARTY',
    errors,
    true,
  );
  return errors;
}

function parseStringArray(value: string | undefined): {
  error: string | null;
  value: string[];
} {
  try {
    const parsed = JSON.parse(value?.trim() ?? '');
    if (
      !Array.isArray(parsed)
      || parsed.length === 0
      || parsed.some(item => identityValueError(item))
    ) {
      return {error: '자리표시자가 아닌 문자열 1개 이상의 JSON 배열이어야 합니다.', value: []};
    }
    return {error: null, value: parsed.map(item => item.trim())};
  } catch {
    return {error: '유효한 JSON 배열이어야 합니다.', value: []};
  }
}

function validateBoolean(
  value: string | undefined,
  field: string,
  errors: string[],
  required = false,
) {
  if (value === undefined && !required) return;
  if (!['true', 'false'].includes(value ?? '')) {
    errors.push(`${field}는 true 또는 false여야 합니다.`);
  }
}
