import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Vercel 자동배포는 main과 명시적 preview 브랜치에만 허용한다', async () => {
  const config = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  const policy = config.git?.deploymentEnabled;

  assert.equal(
    policy?.['**'],
    false,
    '슬래시가 포함된 codex/* 브랜치까지 모든 자동배포를 기본 차단해야 합니다.',
  );
  assert.equal(
    policy?.['*'],
    undefined,
    '"*"는 슬래시를 넘지 못하므로 전체 브랜치 차단 규칙으로 사용하면 안 됩니다.',
  );
  assert.equal(policy?.main, true, 'main 프로덕션 배포는 허용해야 합니다.');
  assert.equal(
    policy?.['preview-*'],
    true,
    '의도적으로 만든 preview-* 브랜치는 시각 검수용 배포를 허용해야 합니다.',
  );
  assert.deepEqual(
    Object.keys(policy ?? {}).sort(),
    ['**', 'main', 'preview-*'].sort(),
    '배포 허용 범위를 넓히는 다른 브랜치 규칙이 있으면 안 됩니다.',
  );
});
