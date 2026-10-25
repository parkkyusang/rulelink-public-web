import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  requestVercelDeployment,
  validateVercelDeployHookUrl,
} from './request-vercel-deployment.mjs';
import {resolveSiteIndexing} from '../src/lib/site.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [config, release, workflow] = await Promise.all([
  readFile(path.join(root, 'vercel.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'deploy', 'release.json'), 'utf8').then(JSON.parse),
  readFile(path.resolve(root, '..', '..', '.github', 'workflows', 'production-live-smoke.yml'), 'utf8'),
]);

test('Vercel Git 자동배포는 명시적 preview 브랜치 외에는 전부 차단한다', () => {
  const policy = config.git?.deploymentEnabled;
  assert.equal(policy?.['**'], false, '슬래시가 포함된 codex/* 브랜치까지 기본 차단해야 합니다.');
  assert.equal(policy?.['*'], undefined, '"*"를 전체 브랜치 차단 규칙으로 사용하면 안 됩니다.');
  assert.equal(policy?.main, false, 'main은 배포 훅만 사용하고 Git 자동배포는 차단해야 합니다.');
  assert.equal(policy?.['preview-*'], true, 'preview-* 시각 검수 브랜치는 허용해야 합니다.');
  assert.deepEqual(
    Object.keys(policy ?? {}).sort(),
    ['**', 'main', 'preview-*'].sort(),
    '배포 허용 범위를 넓히는 다른 브랜치 규칙이 있으면 안 됩니다.',
  );
});

test('취소된 빌드도 배포 할당량을 쓰므로 ignoreCommand를 사용하지 않는다', () => {
  assert.equal(config.ignoreCommand, undefined);
});

test('운영 공개 표식과 실주소 점검은 같은 공개 커밋에서만 작동한다', () => {
  assert.equal(release.schema, 'rulelink_public_release_v1');
  assert.match(release.release_id, /^production-[a-z0-9._-]+$/);
  assert.match(release.snapshot_id, /^[a-z0-9][a-z0-9._-]+$/);
  assert.equal(typeof release.summary_ko, 'string');
  assert(release.summary_ko.trim().length > 0);
  assert.match(workflow, /paths:\s*\n\s*- web\/rulelink_public_next\/deploy\/release\.json/);
  assert.match(workflow, /VERCEL_DEPLOY_HOOK_URL:\s*\$\{\{ secrets\.VERCEL_DEPLOY_HOOK_URL \}\}/);
  assert.match(workflow, /node scripts\/request-vercel-deployment\.mjs/);
  assert.match(workflow, /RULELINK_LIVE_SMOKE_ATTEMPTS:\s*"72"/);
});

test('배포 훅 요청은 Vercel HTTPS 주소에 POST하고 비밀 주소를 결과로 노출하지 않는다', async () => {
  const calls = [];
  const result = await requestVercelDeployment({
    hookUrl: 'https://api.vercel.com/v1/integrations/deploy/project/secret',
    fetchImpl: async (url, init) => {
      calls.push({url: url.toString(), init});
      return {ok: true, status: 201};
    },
  });
  assert.deepEqual(result, {status: 201});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
});

test('누락되거나 Vercel이 아닌 배포 훅 주소는 호출 전에 차단한다', async () => {
  assert.throws(() => validateVercelDeployHookUrl(''), /VERCEL_DEPLOY_HOOK_URL/);
  assert.throws(
    () => validateVercelDeployHookUrl('https://example.com/v1/integrations/deploy/project/secret'),
    /Vercel의 HTTPS Deploy Hook/,
  );
  await assert.rejects(
    requestVercelDeployment({
      hookUrl: 'https://api.vercel.com/v1/integrations/deploy/project/secret',
      fetchImpl: async () => ({ok: false, status: 429}),
    }),
    /HTTP 429/,
  );
});

test('운영 배포는 남아 있는 명시값과 무관하게 검색 공개하고 비운영은 명시 허용만 따른다', () => {
  assert.equal(resolveSiteIndexing({VERCEL_ENV: 'production'}), true);
  assert.equal(resolveSiteIndexing({VERCEL_ENV: 'production', NEXT_PUBLIC_RULELINK_INDEXING: 'false'}), true);
  assert.equal(resolveSiteIndexing({VERCEL_ENV: 'production', NEXT_PUBLIC_RULELINK_INDEXING: 'true'}), true);
  assert.equal(resolveSiteIndexing({VERCEL_ENV: 'preview'}), false);
  assert.equal(resolveSiteIndexing({VERCEL_ENV: 'development'}), false);
  assert.equal(resolveSiteIndexing({VERCEL_ENV: 'preview', NEXT_PUBLIC_RULELINK_INDEXING: 'true'}), true);
  assert.equal(resolveSiteIndexing({VERCEL_ENV: 'preview', NEXT_PUBLIC_RULELINK_INDEXING: 'false'}), false);
});
