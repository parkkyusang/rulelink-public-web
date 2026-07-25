import {
  identityValueError,
} from './public-identity-validation.ts';
import {
  publicExternalDestinationError,
  resolveProcessorContactDestination,
  type PublicExternalDestination,
} from './public-external-destinations.ts';
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
  internationalTransfer: boolean;
  processingRegions: string[];
  processingOutsourcing: boolean;
  serverTransmission: boolean;
  thirdPartyProvision: boolean;
};

export type PublicDataPractice = {
  activationMode: PublicDataActivationMode;
  category: PublicDataCategory;
  dataTypes: string[];
  id: string;
  provider: string;
  providerDestination: PublicExternalDestination | null;
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
  RULELINK_PUBLIC_HOSTING_PROVIDER_CONTACT?: string;
  RULELINK_PUBLIC_HOSTING_PROVIDER?: string;
  RULELINK_PUBLIC_HOSTING_PURPOSE?: string;
  RULELINK_PUBLIC_HOSTING_RETENTION?: string;
  RULELINK_PUBLIC_AUTOMATIC_COLLECTION_JSON?: string;
  RULELINK_PUBLIC_DESTRUCTION_METHOD?: string;
  RULELINK_PUBLIC_DESTRUCTION_PROCEDURE?: string;
  RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON?: string;
  RULELINK_PUBLIC_LEGAL_REPRESENTATIVE_RIGHTS?: string;
  RULELINK_PUBLIC_PRIVACY_RESPONSIBLE_ROLE?: string;
  RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE?: string;
  RULELINK_PUBLIC_PRIVACY_ENABLED?: string;
  RULELINK_PUBLIC_PRIVACY_SAFEGUARDS_JSON?: string;
  RULELINK_PUBLIC_PRIVACY_VERSION?: string;
  RULELINK_PUBLIC_PRIVACY_WITHDRAWAL?: string;
  RULELINK_PUBLIC_PROCESSING_OUTSOURCING_JSON?: string;
  RULELINK_PUBLIC_RIGHTS_DESCRIPTION?: string;
  RULELINK_PUBLIC_RIGHTS_EXERCISE_METHOD?: string;
  RULELINK_PUBLIC_THIRD_PARTY_PROVISION_JSON?: string;
};

export type PublicConditionalDisclosure<T> =
  | {enabled: false; statement: string}
  | {details: T; enabled: true};

export type PublicInternationalTransferDetails = {
  countries: string[];
  legalBasis: string;
  practiceIds: string[];
  refusalMethodAndEffect: string;
  timingAndMethod: string;
};

export type PublicOutsourcingDetails = {
  practiceIds: string[];
  safeguards: string;
};

export type PublicThirdPartyProvisionDetails = {
  legalBasis: string;
  practiceIds: string[];
};

export type PublicPrivacyConfig = {
  automaticCollection: PublicConditionalDisclosure<{description: string}>;
  destruction: {
    method: string;
    procedure: string;
  };
  effectiveDate: string;
  internationalTransfer: PublicConditionalDisclosure<PublicInternationalTransferDetails>;
  inventory: PublicDataPractice[];
  privacyResponsibleRole: string;
  processingOutsourcing: PublicConditionalDisclosure<PublicOutsourcingDetails>;
  rights: {
    description: string;
    exerciseMethod: string;
    legalRepresentativeRights: string;
  };
  safeguards: string[];
  thirdPartyProvision: PublicConditionalDisclosure<PublicThirdPartyProvisionDetails>;
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
  providerDestination: null,
  purpose: '상세 글의 확인자료와 다음 행동 진행 상태를 현재 기기에서 복원',
  retention: '사용자가 초기화하거나 브라우저 저장소를 삭제할 때까지',
  status: 'active',
  storageKeys: ['rulelink-checklist-v1:{content_id}:{revision_key}'],
  transfer: {
    description: '서버 또는 제3자에게 전송하지 않고 현재 브라우저에만 저장',
    internationalTransfer: false,
    processingRegions: ['사용자 기기'],
    processingOutsourcing: false,
    serverTransmission: false,
    thirdPartyProvision: false,
  },
};

const scenarioChoicePractice: PublicDataPractice = {
  activationMode: 'after-user-action',
  category: 'functional',
  dataTypes: ['사용자가 선택한 사실분기 답변(예·아니오·모르겠음)'],
  id: 'device-scenario-choice',
  provider: '사용자의 현재 브라우저',
  providerDestination: null,
  purpose: '상세 글의 정본 사실분기 결과를 다시 방문했을 때 복원',
  retention: '사용자가 선택을 지우거나 브라우저 저장소를 삭제할 때까지',
  status: 'active',
  storageKeys: ['rulelink-scenario-v1:{content_id}:{revision_key}:{scenario_id}'],
  transfer: {
    description: '서버 또는 제3자에게 전송하지 않고 현재 브라우저에만 저장',
    internationalTransfer: false,
    processingRegions: ['사용자 기기'],
    processingOutsourcing: false,
    serverTransmission: false,
    thirdPartyProvision: false,
  },
};

const deniedPractices: PublicDataPractice[] = [
  {
    activationMode: 'denied',
    category: 'analytics',
    dataTypes: [],
    id: 'analytics-disabled',
    provider: '없음',
    providerDestination: null,
    purpose: '방문 분석을 사용하지 않음',
    retention: '저장하지 않음',
    status: 'disabled',
    storageKeys: [],
    transfer: {
      description: '수집·저장·전송하지 않음',
      internationalTransfer: false,
      processingRegions: [],
      processingOutsourcing: false,
      serverTransmission: false,
      thirdPartyProvision: false,
    },
  },
  {
    activationMode: 'denied',
    category: 'advertising',
    dataTypes: [],
    id: 'advertising-disabled',
    provider: '없음',
    providerDestination: null,
    purpose: '맞춤형·행동기반 광고를 사용하지 않음',
    retention: '저장하지 않음',
    status: 'disabled',
    storageKeys: [],
    transfer: {
      description: '수집·저장·전송하지 않음',
      internationalTransfer: false,
      processingRegions: [],
      processingOutsourcing: false,
      serverTransmission: false,
      thirdPartyProvision: false,
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
    scenarioChoicePractice,
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
  const automaticCollection = parseConditionalDisclosure<{description: string}>(
    environment.RULELINK_PUBLIC_AUTOMATIC_COLLECTION_JSON!,
    ['description'],
  ).value!;
  const internationalTransfer =
    parseConditionalDisclosure<PublicInternationalTransferDetails>(
      environment.RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON!,
      [
        'countries',
        'legalBasis',
        'practiceIds',
        'refusalMethodAndEffect',
        'timingAndMethod',
      ],
      ['countries', 'practiceIds'],
    ).value!;
  const processingOutsourcing =
    parseConditionalDisclosure<PublicOutsourcingDetails>(
      environment.RULELINK_PUBLIC_PROCESSING_OUTSOURCING_JSON!,
      ['practiceIds', 'safeguards'],
      ['practiceIds'],
    ).value!;
  const thirdPartyProvision =
    parseConditionalDisclosure<PublicThirdPartyProvisionDetails>(
      environment.RULELINK_PUBLIC_THIRD_PARTY_PROVISION_JSON!,
      ['legalBasis', 'practiceIds'],
      ['practiceIds'],
    ).value!;
  const hostingPractice: PublicDataPractice = {
    activationMode: 'page-request',
    category: 'essential',
    dataTypes,
    id: 'hosting-request-logs',
    provider: environment.RULELINK_PUBLIC_HOSTING_PROVIDER!.trim(),
    providerDestination: resolveProcessorContactDestination({
      href: environment.RULELINK_PUBLIC_HOSTING_PROVIDER_CONTACT!.trim(),
      label: `${environment.RULELINK_PUBLIC_HOSTING_PROVIDER!.trim()} 연락처`,
    }),
    purpose: environment.RULELINK_PUBLIC_HOSTING_PURPOSE!.trim(),
    retention: environment.RULELINK_PUBLIC_HOSTING_RETENTION!.trim(),
    status: 'active',
    storageKeys: [],
    transfer: {
      description: transferDescription(
        thirdPartyProvision,
        processingOutsourcing,
        internationalTransfer,
      ),
      internationalTransfer:
        referencesPractice(internationalTransfer, 'hosting-request-logs'),
      processingRegions,
      processingOutsourcing:
        referencesPractice(processingOutsourcing, 'hosting-request-logs'),
      serverTransmission: true,
      thirdPartyProvision:
        referencesPractice(thirdPartyProvision, 'hosting-request-logs'),
    },
  };
  return {
    automaticCollection,
    destruction: {
      method: environment.RULELINK_PUBLIC_DESTRUCTION_METHOD!.trim(),
      procedure: environment.RULELINK_PUBLIC_DESTRUCTION_PROCEDURE!.trim(),
    },
    effectiveDate:
      environment.RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE!.trim(),
    internationalTransfer,
    inventory: [
      hostingPractice,
      checklistPractice,
      scenarioChoicePractice,
      ...deniedPractices,
    ],
    privacyResponsibleRole:
      environment.RULELINK_PUBLIC_PRIVACY_RESPONSIBLE_ROLE!.trim(),
    processingOutsourcing,
    rights: {
      description: environment.RULELINK_PUBLIC_RIGHTS_DESCRIPTION!.trim(),
      exerciseMethod:
        environment.RULELINK_PUBLIC_RIGHTS_EXERCISE_METHOD!.trim(),
      legalRepresentativeRights:
        environment.RULELINK_PUBLIC_LEGAL_REPRESENTATIVE_RIGHTS!.trim(),
    },
    safeguards: parseStringArray(
      environment.RULELINK_PUBLIC_PRIVACY_SAFEGUARDS_JSON!,
    ).value,
    thirdPartyProvision,
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
    ['RULELINK_PUBLIC_DESTRUCTION_PROCEDURE', environment.RULELINK_PUBLIC_DESTRUCTION_PROCEDURE],
    ['RULELINK_PUBLIC_DESTRUCTION_METHOD', environment.RULELINK_PUBLIC_DESTRUCTION_METHOD],
    ['RULELINK_PUBLIC_RIGHTS_DESCRIPTION', environment.RULELINK_PUBLIC_RIGHTS_DESCRIPTION],
    ['RULELINK_PUBLIC_RIGHTS_EXERCISE_METHOD', environment.RULELINK_PUBLIC_RIGHTS_EXERCISE_METHOD],
    ['RULELINK_PUBLIC_LEGAL_REPRESENTATIVE_RIGHTS', environment.RULELINK_PUBLIC_LEGAL_REPRESENTATIVE_RIGHTS],
    ['RULELINK_PUBLIC_PRIVACY_RESPONSIBLE_ROLE', environment.RULELINK_PUBLIC_PRIVACY_RESPONSIBLE_ROLE],
    ['RULELINK_PUBLIC_PRIVACY_WITHDRAWAL', environment.RULELINK_PUBLIC_PRIVACY_WITHDRAWAL],
  ] as const) {
    const error = identityValueError(value);
    if (error) errors.push(`${field}: ${error}`);
  }
  const providerContactError = publicExternalDestinationError(
    'processor_contact',
    environment.RULELINK_PUBLIC_HOSTING_PROVIDER_CONTACT?.trim() ?? '',
    `${environment.RULELINK_PUBLIC_HOSTING_PROVIDER?.trim() ?? ''} 연락처`,
  );
  if (providerContactError) {
    errors.push(
      `RULELINK_PUBLIC_HOSTING_PROVIDER_CONTACT: ${providerContactError}`,
    );
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
    ['RULELINK_PUBLIC_PRIVACY_SAFEGUARDS_JSON', environment.RULELINK_PUBLIC_PRIVACY_SAFEGUARDS_JSON],
  ] as const) {
    const parsed = parseStringArray(value);
    if (parsed.error) errors.push(`${field}: ${parsed.error}`);
  }
  for (const [field, raw, keys, arrayKeys] of [
    [
      'RULELINK_PUBLIC_THIRD_PARTY_PROVISION_JSON',
      environment.RULELINK_PUBLIC_THIRD_PARTY_PROVISION_JSON,
      ['legalBasis', 'practiceIds'],
      ['practiceIds'],
    ],
    [
      'RULELINK_PUBLIC_PROCESSING_OUTSOURCING_JSON',
      environment.RULELINK_PUBLIC_PROCESSING_OUTSOURCING_JSON,
      ['practiceIds', 'safeguards'],
      ['practiceIds'],
    ],
    [
      'RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON',
      environment.RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON,
      ['countries', 'legalBasis', 'practiceIds', 'refusalMethodAndEffect', 'timingAndMethod'],
      ['countries', 'practiceIds'],
    ],
    [
      'RULELINK_PUBLIC_AUTOMATIC_COLLECTION_JSON',
      environment.RULELINK_PUBLIC_AUTOMATIC_COLLECTION_JSON,
      ['description'],
      [],
    ],
  ] as const) {
    const parsed = parseConditionalDisclosure(raw, keys, arrayKeys);
    if (parsed.error) errors.push(`${field}: ${parsed.error}`);
  }
  errors.push(...validateDisclosureReferences(environment));
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

function parseConditionalDisclosure<T>(
  raw: string | undefined,
  detailKeys: readonly string[],
  arrayKeys: readonly string[] = [],
): {error: string | null; value: PublicConditionalDisclosure<T> | null} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw?.trim() ?? '');
  } catch {
    return {error: '유효한 JSON 객체여야 합니다.', value: null};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {error: 'JSON 객체여야 합니다.', value: null};
  }
  const row = parsed as Record<string, unknown>;
  if (row.enabled === false) {
    if (
      Object.keys(row).length !== 2
      || typeof row.statement !== 'string'
      || identityValueError(row.statement)
    ) {
      return {
        error: '비활성 사실은 enabled=false와 구체적인 statement만 가져야 합니다.',
        value: null,
      };
    }
    return {
      error: null,
      value: {enabled: false, statement: row.statement.trim()},
    };
  }
  if (row.enabled !== true || !row.details || typeof row.details !== 'object') {
    return {
      error: 'enabled=true/false와 상태에 맞는 details 또는 statement가 필요합니다.',
      value: null,
    };
  }
  if (Object.keys(row).length !== 2) {
    return {error: '활성 사실은 enabled와 details만 가져야 합니다.', value: null};
  }
  const details = row.details as Record<string, unknown>;
  if (
    Object.keys(details).length !== detailKeys.length
    || detailKeys.some(key => !(key in details))
  ) {
    return {error: '활성 details의 필드 구성이 올바르지 않습니다.', value: null};
  }
  for (const key of detailKeys) {
    if (arrayKeys.includes(key)) {
      if (
        !Array.isArray(details[key])
        || (details[key] as unknown[]).length === 0
        || (details[key] as unknown[]).some(item => identityValueError(item))
        || new Set(details[key] as unknown[]).size
          !== (details[key] as unknown[]).length
      ) {
        return {error: `${key}는 중복 없는 실제 문자열 1개 이상의 배열이어야 합니다.`, value: null};
      }
    } else if (identityValueError(details[key])) {
      return {error: `${key}에는 실제 운영 사실이 필요합니다.`, value: null};
    }
  }
  return {
    error: null,
    value: {
      details: Object.fromEntries(
        Object.entries(details).map(([key, value]) => [
          key,
          Array.isArray(value)
            ? value.map(item => (item as string).trim())
            : (value as string).trim(),
        ]),
      ) as T,
      enabled: true,
    },
  };
}

function transferDescription(
  thirdPartyProvision: PublicPrivacyConfig['thirdPartyProvision'],
  processingOutsourcing: PublicPrivacyConfig['processingOutsourcing'],
  internationalTransfer: PublicPrivacyConfig['internationalTransfer'],
) {
  const labels = [
    thirdPartyProvision.enabled && '제3자 제공',
    processingOutsourcing.enabled && '처리위탁',
    internationalTransfer.enabled && '국외이전',
  ].filter(Boolean);
  return labels.length
    ? `${labels.join(' · ')} 사실은 아래 법정 구획에서 각각 공개`
    : '제3자 제공·처리위탁·국외이전 없음';
}

function referencesPractice<T extends {practiceIds: string[]}>(
  disclosure: PublicConditionalDisclosure<T>,
  practiceId: string,
) {
  return disclosure.enabled && disclosure.details.practiceIds.includes(practiceId);
}

function validateDisclosureReferences(
  environment: PublicPrivacyEnvironment,
): string[] {
  const errors: string[] = [];
  const disclosures = [
    [
      'RULELINK_PUBLIC_THIRD_PARTY_PROVISION_JSON',
      parseConditionalDisclosure<PublicThirdPartyProvisionDetails>(
        environment.RULELINK_PUBLIC_THIRD_PARTY_PROVISION_JSON,
        ['legalBasis', 'practiceIds'],
        ['practiceIds'],
      ).value,
    ],
    [
      'RULELINK_PUBLIC_PROCESSING_OUTSOURCING_JSON',
      parseConditionalDisclosure<PublicOutsourcingDetails>(
        environment.RULELINK_PUBLIC_PROCESSING_OUTSOURCING_JSON,
        ['practiceIds', 'safeguards'],
        ['practiceIds'],
      ).value,
    ],
    [
      'RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON',
      parseConditionalDisclosure<PublicInternationalTransferDetails>(
        environment.RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON,
        ['countries', 'legalBasis', 'practiceIds', 'refusalMethodAndEffect', 'timingAndMethod'],
        ['countries', 'practiceIds'],
      ).value,
    ],
  ] as const;
  const activePracticeIds = new Set([
    'hosting-request-logs',
    'device-checklist',
    'device-scenario-choice',
  ]);
  for (const [field, disclosure] of disclosures) {
    if (!disclosure?.enabled) continue;
    for (const practiceId of disclosure.details.practiceIds) {
      if (!activePracticeIds.has(practiceId)) {
        errors.push(`${field}: 알 수 없는 활성 처리 항목 참조입니다: ${practiceId}`);
      }
      if (practiceId === 'device-checklist' || practiceId === 'device-scenario-choice') {
        errors.push(`${field}: 기기 안에서만 저장되는 선택 상태는 외부 처리 구획을 참조할 수 없습니다.`);
      }
    }
  }
  const international = disclosures[2][1];
  if (international?.enabled) {
    const processingRegions = parseStringArray(
      environment.RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON,
    ).value;
    for (const country of international.details.countries) {
      if (!processingRegions.includes(country)) {
        errors.push(
          `RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON: 이전 국가가 참조 처리 항목의 처리지역에 없습니다: ${country}`,
        );
      }
    }
  }
  return errors;
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
