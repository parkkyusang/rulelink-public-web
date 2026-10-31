import {
  resolveOptionalWorkspaceDestination,
  type PublicExternalDestination,
  type PublicExternalDestinationEnvironment,
} from './public-external-destinations.ts';
import {
  resolvePublicTrustConfig,
  type PublicTrustConfig,
  type PublicTrustEnvironment,
} from './public-trust.ts';

export type PublicPrivacyNoticeEnvironment = PublicTrustEnvironment
  & PublicExternalDestinationEnvironment & {
    RULELINK_PUBLIC_PRIVACY_NOTICE_ENABLED?: string;
  };

export type PublicPrivacyNoticeConfig = {
  effectiveDate: string;
  inquiryRetention: string;
  trust: PublicTrustConfig;
  workspace: PublicExternalDestination | null;
};

// This is deliberately narrower than the full privacy-policy configuration.
// It publishes only known site behavior and the approved operating commitment.
export function resolvePublicPrivacyNoticeConfig(
  environment: PublicPrivacyNoticeEnvironment =
    process.env as PublicPrivacyNoticeEnvironment,
): PublicPrivacyNoticeConfig | null {
  if (environment.RULELINK_PUBLIC_PRIVACY_NOTICE_ENABLED !== 'true') {
    return null;
  }
  const trust = resolvePublicTrustConfig(environment);
  if (!trust) return null;
  return {
    effectiveDate: '2026-10-31',
    inquiryRetention: '문의 처리가 끝난 날부터 30일 이내 삭제합니다. 다만 분쟁 대응 또는 법령상 보존이 필요한 자료는 해당 사유가 끝날 때까지 필요한 범위에서 보관합니다.',
    trust,
    workspace: resolveOptionalWorkspaceDestination(environment),
  };
}
