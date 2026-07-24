export type PublicTrustEnvironment = {
  RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED?: string;
  RULELINK_PUBLIC_CONTACT_LABEL?: string;
  RULELINK_PUBLIC_CONTACT_URL?: string;
  RULELINK_PUBLIC_OPERATOR_LEGAL_NAME?: string;
  RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE?: string;
  RULELINK_PUBLIC_TRUST_ENABLED?: string;
};

export type PublicTrustConfig = {
  contact: {
    href: string;
    label: string;
  };
  operatorLegalName: string;
  reviewQualificationDisclosure: string;
};

type PublicTrustValidationContext = {
  hasEditorialAttribution?: boolean;
};

const placeholderPattern = /(?:^|[\s._-])(todo|tbd|example|placeholder)(?:$|[\s._-])|미정|예시|입력\s*필요/iu;

export function resolvePublicTrustConfig(
  environment: PublicTrustEnvironment =
    process.env as PublicTrustEnvironment,
): PublicTrustConfig | null {
  if (environment.RULELINK_PUBLIC_TRUST_ENABLED !== 'true') return null;
  if (validatePublicTrustConfiguration(environment).length) return null;
  return {
    contact: {
      href: environment.RULELINK_PUBLIC_CONTACT_URL!.trim(),
      label: environment.RULELINK_PUBLIC_CONTACT_LABEL!.trim(),
    },
    operatorLegalName:
      environment.RULELINK_PUBLIC_OPERATOR_LEGAL_NAME!.trim(),
    reviewQualificationDisclosure:
      environment.RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE!.trim(),
  };
}

export function resolveAdvertisingPlaceholdersEnabled(
  environment: PublicTrustEnvironment =
    process.env as PublicTrustEnvironment,
): boolean {
  return environment.RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED === 'true'
    && Boolean(resolvePublicTrustConfig(environment));
}

export function validatePublicTrustConfiguration(
  environment: PublicTrustEnvironment,
  context: PublicTrustValidationContext = {},
): string[] {
  const errors: string[] = [];
  const trustValue = environment.RULELINK_PUBLIC_TRUST_ENABLED;
  const adValue = environment.RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED;
  if (trustValue !== undefined && !['true', 'false'].includes(trustValue)) {
    errors.push('RULELINK_PUBLIC_TRUST_ENABLED는 true 또는 false여야 합니다.');
  }
  if (adValue !== undefined && !['true', 'false'].includes(adValue)) {
    errors.push(
      'RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED는 true 또는 false여야 합니다.',
    );
  }

  const enabled = trustValue === 'true';
  if (!enabled) {
    if (adValue === 'true') {
      errors.push(
        '광고 준비 영역을 공개하려면 RULELINK_PUBLIC_TRUST_ENABLED=true가 먼저 필요합니다.',
      );
    }
    if (context.hasEditorialAttribution) {
      errors.push(
        '편집자 표지가 있는 콘텐츠를 공개하려면 공개 신뢰 설정을 먼저 활성화해야 합니다.',
      );
    }
    return errors;
  }

  requireIdentityValue(
    environment.RULELINK_PUBLIC_OPERATOR_LEGAL_NAME,
    'RULELINK_PUBLIC_OPERATOR_LEGAL_NAME',
    errors,
  );
  requireIdentityValue(
    environment.RULELINK_PUBLIC_CONTACT_LABEL,
    'RULELINK_PUBLIC_CONTACT_LABEL',
    errors,
  );
  requireIdentityValue(
    environment.RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE,
    'RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE',
    errors,
  );

  const contactUrl = environment.RULELINK_PUBLIC_CONTACT_URL?.trim() ?? '';
  if (!contactUrl) {
    errors.push('RULELINK_PUBLIC_CONTACT_URL이 필요합니다.');
  } else if (
    !/^https:\/\/[^\s]+$/u.test(contactUrl)
    && !/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(contactUrl)
  ) {
    errors.push(
      'RULELINK_PUBLIC_CONTACT_URL은 https 또는 유효한 mailto 주소여야 합니다.',
    );
  } else if (placeholderPattern.test(contactUrl)) {
    errors.push('RULELINK_PUBLIC_CONTACT_URL에 예시·미정 값을 사용할 수 없습니다.');
  }
  return errors;
}

function requireIdentityValue(
  value: string | undefined,
  field: string,
  errors: string[],
): void {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    errors.push(`${field}이 필요합니다.`);
  } else if (placeholderPattern.test(normalized)) {
    errors.push(`${field}에 예시·미정 값을 사용할 수 없습니다.`);
  }
}
