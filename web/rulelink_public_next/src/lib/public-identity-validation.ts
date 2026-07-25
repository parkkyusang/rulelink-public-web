const placeholderPattern =
  /(?:^|[^a-z0-9])(?:todo|tbd|test|testing|sample|fixture|example|placeholder|dummy|fake)(?=$|[^a-z0-9])|검증용|시험용|테스트|샘플|가상|예시|미정|입력\s*필요/iu;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/u;
const registryIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const emailAddressPattern =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/iu;

export function identityValueError(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return '비어 있을 수 없습니다.';
  const normalized = value.trim();
  if (controlCharacterPattern.test(normalized)) return '제어문자를 포함할 수 없습니다.';
  if (placeholderPattern.test(normalized)) return '시험·예시·미정 값을 사용할 수 없습니다.';
  return null;
}

export function registryReferenceError(value: unknown): string | null {
  const identityError = identityValueError(value);
  if (identityError) return identityError;
  return registryIdPattern.test((value as string).trim())
    ? null
    : '소문자 영문·숫자와 점·밑줄·하이픈만 사용할 수 있습니다.';
}

export function publicUrlError(
  value: unknown,
  options: {
    allowInternal?: boolean;
    allowMailto?: boolean;
  } = {},
): string | null {
  const identityError = identityValueError(value);
  if (identityError) return identityError;
  const normalized = (value as string).trim();

  if (options.allowInternal && normalized.startsWith('/')) {
    if (normalized.startsWith('//')) return '내부 URL은 슬래시 하나로 시작해야 합니다.';
    if (normalized.includes('\\')) return '내부 URL에 역슬래시를 사용할 수 없습니다.';
    return null;
  }

  if (normalized.toLowerCase().startsWith('mailto:')) {
    if (!options.allowMailto) return 'mailto URL은 허용되지 않습니다.';
    return mailtoError(normalized);
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return '유효한 URL이어야 합니다.';
  }
  if (parsed.protocol !== 'https:') return 'https URL이어야 합니다.';
  if (!parsed.hostname) return 'https URL에는 호스트 이름이 필요합니다.';
  if (parsed.username || parsed.password) return 'URL에 사용자명이나 비밀번호를 넣을 수 없습니다.';
  if (controlCharacterPattern.test(parsed.href)) return 'URL에 제어문자를 넣을 수 없습니다.';
  return null;
}

function mailtoError(value: string): string | null {
  if (value.includes('#')) return 'mailto URL에 fragment를 넣을 수 없습니다.';
  const body = value.slice('mailto:'.length);
  const queryIndex = body.indexOf('?');
  const address = (queryIndex >= 0 ? body.slice(0, queryIndex) : body).trim();
  if (!emailAddressPattern.test(address)) return '유효한 mailto 이메일 주소가 필요합니다.';
  if (queryIndex < 0) return null;
  const query = body.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  const seen = new Set<string>();
  for (const [key, parameterValue] of params) {
    const normalizedKey = key.toLowerCase();
    if (!['body', 'subject'].includes(normalizedKey)) {
      return 'mailto query는 subject와 body만 허용합니다.';
    }
    if (seen.has(normalizedKey)) return 'mailto query 항목을 중복할 수 없습니다.';
    seen.add(normalizedKey);
    if (controlCharacterPattern.test(parameterValue)) {
      return 'mailto query에 제어문자를 넣을 수 없습니다.';
    }
  }
  return null;
}
