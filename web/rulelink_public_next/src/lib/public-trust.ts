import {
  identityValueError,
  registryReferenceError,
} from './public-identity-validation.ts';
import {
  publicExternalDestinationError,
  resolveEditorialAuthorDestination,
  resolveOperatorContactDestination,
  resolveReviewerEvidenceDestination,
  type PublicExternalDestination,
} from './public-external-destinations.ts';

import type {PublicEditorialAttribution} from '@/types/publication';

export type PublicTrustEnvironment = {
  RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED?: string;
  RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON?: string;
  RULELINK_PUBLIC_CONTACT_LABEL?: string;
  RULELINK_PUBLIC_CONTACT_URL?: string;
  RULELINK_PUBLIC_OPERATOR_LEGAL_NAME?: string;
  RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE?: string;
  RULELINK_PUBLIC_TRUST_ENABLED?: string;
};

export type PublicApprovedReviewer = {
  evidenceDestination: PublicExternalDestination;
  evidenceUrl: string;
  nameKo: string;
  qualificationKo: string;
  reviewerRegistryId: string;
};

export type PublicTrustConfig = {
  approvedReviewers: ReadonlyMap<string, PublicApprovedReviewer>;
  contact: {
    destination: PublicExternalDestination;
    href: string;
    label: string;
  };
  operatorLegalName: string;
  reviewQualificationDisclosure: string;
};

export type ParsedPublicContactHref =
  | {address: string; href: string; kind: 'email'}
  | {href: string; kind: 'url'};

export type ResolvedPublicEditorialAttribution = {
  author: PublicEditorialAttribution['author'] & {
    destination: PublicExternalDestination | null;
  };
  legal_reviewer: PublicEditorialAttribution['legal_reviewer'] & {
    evidence_destination: PublicExternalDestination;
    evidence_url: string;
    name_ko: string;
    qualification_ko: string;
  };
};

type PublicTrustValidationContext = {
  editorialAttributions?: PublicEditorialAttribution[];
  hasEditorialAttribution?: boolean;
};

export function resolvePublicTrustConfig(
  environment: PublicTrustEnvironment =
    process.env as PublicTrustEnvironment,
): PublicTrustConfig | null {
  if (environment.RULELINK_PUBLIC_TRUST_ENABLED !== 'true') return null;
  if (validatePublicTrustConfiguration(environment).length) return null;
  return {
    approvedReviewers: reviewerRegistry(environment).reviewers,
    contact: {
      destination: resolveOperatorContactDestination({
        href: environment.RULELINK_PUBLIC_CONTACT_URL!.trim(),
        label: environment.RULELINK_PUBLIC_CONTACT_LABEL!.trim(),
      })!,
      href: environment.RULELINK_PUBLIC_CONTACT_URL!.trim(),
      label: environment.RULELINK_PUBLIC_CONTACT_LABEL!.trim(),
    },
    operatorLegalName:
      environment.RULELINK_PUBLIC_OPERATOR_LEGAL_NAME!.trim(),
    reviewQualificationDisclosure:
      environment.RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE!.trim(),
  };
}

export function parsePublicContactHref(href: string): ParsedPublicContactHref {
  const parsed = new URL(href);
  if (parsed.protocol !== 'mailto:') return {href, kind: 'url'};
  return {
    address: decodeURIComponent(parsed.pathname),
    href,
    kind: 'email',
  };
}

export function resolveApprovedEditorialAttribution(
  attribution: PublicEditorialAttribution | undefined,
  trustConfig: PublicTrustConfig | null,
): ResolvedPublicEditorialAttribution | null {
  if (!attribution || !trustConfig) return null;
  const reviewer = trustConfig.approvedReviewers.get(
    attribution.legal_reviewer.reviewer_registry_id,
  );
  if (!reviewer) return null;
  return {
    author: {
      ...attribution.author,
      destination: attribution.author.url
        ? resolveEditorialAuthorDestination({
            href: attribution.author.url,
            label: attribution.author.name_ko,
          })
        : null,
    },
    legal_reviewer: {
      ...attribution.legal_reviewer,
      evidence_destination: reviewer.evidenceDestination,
      evidence_url: reviewer.evidenceUrl,
      name_ko: reviewer.nameKo,
      qualification_ko: reviewer.qualificationKo,
    },
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

  const attributions = context.editorialAttributions ?? [];
  const hasEditorialAttribution =
    context.hasEditorialAttribution || attributions.length > 0;
  const enabled = trustValue === 'true';
  if (!enabled) {
    if (adValue === 'true') {
      errors.push(
        '광고 준비 영역을 공개하려면 RULELINK_PUBLIC_TRUST_ENABLED=true가 먼저 필요합니다.',
      );
    }
    if (hasEditorialAttribution) {
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
  const contactError = publicExternalDestinationError(
    'operator_contact',
    contactUrl,
    environment.RULELINK_PUBLIC_CONTACT_LABEL?.trim() ?? '',
  );
  if (contactError) {
    errors.push(`RULELINK_PUBLIC_CONTACT_URL: ${contactError}`);
  }

  const registry = reviewerRegistry(environment);
  errors.push(...registry.errors);
  for (const attribution of attributions) {
    const reference = attribution?.legal_reviewer?.reviewer_registry_id;
    if (!registry.reviewers.has(reference)) {
      errors.push(
        `편집자 표지의 법률 검토자 승인 참조가 공개 reviewer registry에 없습니다: ${reference ?? '(없음)'}`,
      );
    }
  }
  return errors;
}

function reviewerRegistry(environment: PublicTrustEnvironment): {
  errors: string[];
  reviewers: Map<string, PublicApprovedReviewer>;
} {
  const errors: string[] = [];
  const reviewers = new Map<string, PublicApprovedReviewer>();
  const raw = environment.RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON?.trim() || '[]';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      errors: ['RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON은 유효한 JSON 배열이어야 합니다.'],
      reviewers,
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      errors: ['RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON은 배열이어야 합니다.'],
      reviewers,
    };
  }
  for (const [index, value] of parsed.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`승인 검토자 ${index + 1}은 객체여야 합니다.`);
      continue;
    }
    const row = value as Record<string, unknown>;
    const allowedKeys = [
      'evidence_url',
      'name_ko',
      'qualification_ko',
      'reviewer_registry_id',
    ];
    if (
      Object.keys(row).length !== allowedKeys.length
      || allowedKeys.some(key => !(key in row))
    ) {
      errors.push(`승인 검토자 ${index + 1}의 필드 구성이 올바르지 않습니다.`);
      continue;
    }
    const referenceError = registryReferenceError(row.reviewer_registry_id);
    const nameError = identityValueError(row.name_ko);
    const qualificationError = identityValueError(row.qualification_ko);
    const evidenceError = publicExternalDestinationError(
      'reviewer_evidence',
      typeof row.evidence_url === 'string' ? row.evidence_url : '',
      typeof row.name_ko === 'string' ? row.name_ko : '',
    );
    if (referenceError) errors.push(`승인 검토자 ${index + 1} ID: ${referenceError}`);
    if (nameError) errors.push(`승인 검토자 ${index + 1} 이름: ${nameError}`);
    if (qualificationError) errors.push(`승인 검토자 ${index + 1} 자격: ${qualificationError}`);
    if (evidenceError) errors.push(`승인 검토자 ${index + 1} 증거 URL: ${evidenceError}`);
    if (referenceError || nameError || qualificationError || evidenceError) continue;
    const reviewerRegistryId = (row.reviewer_registry_id as string).trim();
    if (reviewers.has(reviewerRegistryId)) {
      errors.push(`승인 검토자 ID가 중복됩니다: ${reviewerRegistryId}`);
      continue;
    }
    reviewers.set(reviewerRegistryId, {
      evidenceDestination: resolveReviewerEvidenceDestination({
        href: (row.evidence_url as string).trim(),
        label: `${(row.name_ko as string).trim()} 승인 근거`,
      })!,
      evidenceUrl: (row.evidence_url as string).trim(),
      nameKo: (row.name_ko as string).trim(),
      qualificationKo: (row.qualification_ko as string).trim(),
      reviewerRegistryId,
    });
  }
  return {errors, reviewers};
}

function requireIdentityValue(
  value: string | undefined,
  field: string,
  errors: string[],
): void {
  const error = identityValueError(value);
  if (error) errors.push(`${field}: ${error}`);
}
