import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const validatorPath = fileURLToPath(new URL('./validate-publication-history.mjs', import.meta.url));

test('current와 같은 불변 스냅샷을 허용한다', async () => {
  await withRepo(async repoRoot => {
    const bytes = bundleBytes('snapshot-one');
    await writeCurrent(repoRoot, bytes);
    await writeSnapshot(repoRoot, 'snapshot-one', bytes);
    const result = validate(repoRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /출판 이력 무결성 검증 통과/);
  });
});

test('현재 출판본의 불변 스냅샷이 없으면 거부한다', async () => {
  await withRepo(async repoRoot => {
    await writeCurrent(repoRoot, bundleBytes('snapshot-missing'));
    const result = validate(repoRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /불변 스냅샷이 없습니다/);
  });
});

test('같은 snapshot_id의 보관본과 current 내용이 다르면 거부한다', async () => {
  await withRepo(async repoRoot => {
    await writeCurrent(repoRoot, bundleBytes('snapshot-mismatch', 'current'));
    await writeSnapshot(repoRoot, 'snapshot-mismatch', bundleBytes('snapshot-mismatch', 'archive'));
    const result = validate(repoRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /불변 보관본과 다릅니다/);
  });
});

test('출판본이 없는 저장소는 기본적으로 건너뛴다', async () => {
  await withRepo(async repoRoot => {
    const result = validate(repoRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /검사를 건너뜁니다/);
  });
});

test('출판본 필수 모드에서는 current 누락을 거부한다', async () => {
  await withRepo(async repoRoot => {
    const result = validate(repoRoot, {RULELINK_REQUIRE_PUBLICATION_BUNDLE: 'true'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /현재 승인 출판본을 찾지 못했습니다/);
  });
});

function validate(repoRoot, extraEnv = {}) {
  return spawnSync(process.execPath, [validatorPath], {
    encoding: 'utf8',
    env: {...process.env, RULELINK_REPO_ROOT: repoRoot, ...extraEnv},
  });
}

async function withRepo(callback) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'rulelink-publication-history-'));
  try {
    await callback(repoRoot);
  } finally {
    await rm(repoRoot, {recursive: true, force: true});
  }
}

async function writeCurrent(repoRoot, bytes) {
  const target = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
  await mkdir(path.dirname(target), {recursive: true});
  await writeFile(target, bytes);
}

async function writeSnapshot(repoRoot, snapshotId, bytes) {
  const target = path.join(repoRoot, 'artifacts', 'publication', 'snapshots', snapshotId, 'bundle.json');
  await mkdir(path.dirname(target), {recursive: true});
  await writeFile(target, bytes);
}

function bundleBytes(snapshotId, marker = 'same') {
  return Buffer.from(JSON.stringify({snapshot_id: snapshotId, marker}, null, 2), 'utf8');
}
