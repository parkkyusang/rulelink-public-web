import {identityValueError, publicUrlError} from './public-identity-validation.ts';
import {publicDeploymentHostError} from './site.ts';

export type PublicExternalDestinationRole =
  | 'editorial_author'
  | 'operator_contact'
  | 'processor_contact'
  | 'reviewer_evidence'
  | 'optional_workspace';

export type PublicExternalDestination = {
  href: string;
  kind: 'external_https' | 'internal' | 'mailto';
  label: string;
  role: PublicExternalDestinationRole;
};

export type PublicExternalDestinationEnvironment = {
  RULELINK_PUBLIC_LAWYER_WORKSPACE_LABEL?: string;
  RULELINK_PUBLIC_LAWYER_WORKSPACE_URL?: string;
};

export function resolveOperatorContactDestination(input: {
  href: string;
  label: string;
}): PublicExternalDestination | null {
  return resolvePublicExternalDestination({
    ...input,
    role: 'operator_contact',
  });
}

export function resolveEditorialAuthorDestination(input: {
  href: string;
  label: string;
}): PublicExternalDestination | null {
  return resolvePublicExternalDestination({
    ...input,
    role: 'editorial_author',
  });
}

export function resolveReviewerEvidenceDestination(input: {
  href: string;
  label: string;
}): PublicExternalDestination | null {
  return resolvePublicExternalDestination({
    ...input,
    role: 'reviewer_evidence',
  });
}

export function resolveProcessorContactDestination(input: {
  href: string;
  label: string;
}): PublicExternalDestination | null {
  return resolvePublicExternalDestination({
    ...input,
    role: 'processor_contact',
  });
}

export function resolveOptionalWorkspaceDestination(
  environment: PublicExternalDestinationEnvironment =
    process.env as PublicExternalDestinationEnvironment,
): PublicExternalDestination | null {
  const href = environment.RULELINK_PUBLIC_LAWYER_WORKSPACE_URL?.trim();
  const label = environment.RULELINK_PUBLIC_LAWYER_WORKSPACE_LABEL?.trim();
  if (!href && !label) return null;
  if (!href || !label) return null;
  return resolvePublicExternalDestination({
    href,
    label,
    role: 'optional_workspace',
  });
}

export function validatePublicExternalDestinations(
  environment: PublicExternalDestinationEnvironment,
): string[] {
  const href = environment.RULELINK_PUBLIC_LAWYER_WORKSPACE_URL?.trim();
  const label = environment.RULELINK_PUBLIC_LAWYER_WORKSPACE_LABEL?.trim();
  if (!href && !label) return [];
  if (!href || !label) {
    return ['작업공간 목적지는 URL과 표시문구가 모두 있어야 합니다.'];
  }
  const error = publicExternalDestinationError(
    'optional_workspace',
    href,
    label,
  );
  return error ? [error] : [];
}

export function publicExternalDestinationError(
  role: PublicExternalDestinationRole,
  href: string,
  label: string,
): string | null {
  const labelError = identityValueError(label);
  if (labelError) return `표시문구: ${labelError}`;
  const allowInternal = role !== 'optional_workspace';
  const allowMailto = ['operator_contact', 'processor_contact'].includes(role);
  const urlError = publicUrlError(href, {allowInternal, allowMailto});
  if (urlError) return `${role}: ${urlError}`;
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(href)) {
    return `${role}: URL에 인코딩된 제어문자를 넣을 수 없습니다.`;
  }
  if (href.startsWith('/') || href.toLowerCase().startsWith('mailto:')) {
    return null;
  }
  const parsed = new URL(href);
  const hostError = publicDeploymentHostError(parsed.hostname);
  return hostError ? `${role}: ${hostError}` : null;
}

function resolvePublicExternalDestination(input: {
  href: string;
  label: string;
  role: PublicExternalDestinationRole;
}): PublicExternalDestination | null {
  const href = input.href.trim();
  const label = input.label.trim();
  if (publicExternalDestinationError(input.role, href, label)) return null;
  return {
    href,
    kind: href.startsWith('/')
      ? 'internal'
      : href.toLowerCase().startsWith('mailto:')
        ? 'mailto'
        : 'external_https',
    label,
    role: input.role,
  };
}
