import path from 'node:path';
import {pathToFileURL} from 'node:url';

const VERCEL_DEPLOY_HOOK_HOST = 'api.vercel.com';
const VERCEL_DEPLOY_HOOK_PREFIX = '/v1/integrations/deploy/';

export function validateVercelDeployHookUrl(value) {
  if (!value?.trim()) {
    throw new Error('GitHub Actions 비밀값 VERCEL_DEPLOY_HOOK_URL이 필요합니다.');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VERCEL_DEPLOY_HOOK_URL이 올바른 URL이 아닙니다.');
  }
  if (
    url.protocol !== 'https:'
    || url.hostname !== VERCEL_DEPLOY_HOOK_HOST
    || !url.pathname.startsWith(VERCEL_DEPLOY_HOOK_PREFIX)
  ) {
    throw new Error('VERCEL_DEPLOY_HOOK_URL은 Vercel의 HTTPS Deploy Hook 주소여야 합니다.');
  }
  return url;
}

export async function requestVercelDeployment({hookUrl, fetchImpl = globalThis.fetch}) {
  const url = validateVercelDeployHookUrl(hookUrl);
  if (typeof fetchImpl !== 'function') {
    throw new Error('운영 배포 요청에 사용할 fetch 구현이 없습니다.');
  }
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {accept: 'application/json'},
  });
  if (!response?.ok) {
    throw new Error(`Vercel 운영 배포 요청 실패: HTTP ${response?.status ?? 'unknown'}`);
  }
  return {status: response.status};
}

async function main() {
  await requestVercelDeployment({hookUrl: process.env.VERCEL_DEPLOY_HOOK_URL});
  process.stdout.write('Vercel 운영 배포 요청이 접수됐습니다.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
