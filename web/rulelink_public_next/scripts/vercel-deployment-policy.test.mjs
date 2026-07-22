import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {productionReleaseDecision} from './should-build-vercel-release.mjs';
import {resolveSiteIndexing} from '../src/lib/site.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [config, release, workflow] = await Promise.all([
  readFile(path.join(root, 'vercel.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'deploy', 'release.json'), 'utf8').then(JSON.parse),
  readFile(path.resolve(root, '..', '..', '.github', 'workflows', 'production-live-smoke.yml'), 'utf8'),
]);

test('Vercel 자동배포 진입은 main과 명시적 preview 브랜치에만 허용한다', () => {
  const policy = config.git?.deploymentEnabled;
  assert.equal(policy?.['**'], false, '슬래시가 포함된 codex/* 브랜치까지 기본 차단해야 합니다.');
  assert.equal(policy?.['*'], undefined, '"*"를 전체 브랜치 차단 규칙으로 사용하면 안 됩니다.');
  assert.equal(policy?.main, true, 'main 프로덕션 후보는 Vercel 진입을 허용해야 합니다.');
  assert.equal(policy?.['preview-*'], true, 'preview-* 시각 검수 브랜치는 허용해야 합니다.');
  assert.deepEqual(
    Object.keys(policy ?? {}).sort(),
    ['**', 'main', 'preview-*'].sort(),
    '배포 허용 범위를 넓히는 다른 브랜치 규칙이 있으면 안 됩니다.',
  );
});

test('main은 공개 표식이 바뀐 커밋만 빌드하고 preview는 항상 빌드한다', () => {
  assert.equal(config.ignoreCommand, 'node scripts/should-build-vercel-release.mjs');
  assert.equal(productionReleaseDecision('main', 0).build, false);
  assert.equal(productionReleaseDecision('main', 1).build, true);
  assert.equal(productionReleaseDecision('main', null).build, true);
  assert.equal(productionReleaseDecision('preview-visual-system', 0).build, true);
  assert.equal(productionReleaseDecision('codex/content-batch', 1).build, false);
});

test('운영 공개 표식과 실주소 점검은 같은 공개 커밋에서만 작동한다', () => {
  assert.equal(release.schema, 'rulelink_public_release_v1');
  assert.match(release.release_id, /^production-[a-z0-9._-]+$/);
  assert.match(release.snapshot_id, /^[a-z0-9][a-z0-9._-]+$/);
  assert.equal(typeof release.summary_ko, 'string');
  assert(release.summary_ko.trim().length > 0);
  assert.match(workflow, /paths:\s*\n\s*- web\/rulelink_public_next\/deploy\/release\.json/);
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
