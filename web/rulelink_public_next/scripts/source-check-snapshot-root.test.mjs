import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('앱 하위 디렉터리에서 실행해도 실제 Git의 과거 출판본 수정을 차단한다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rulelink-snapshot-root-'));
  const app = path.join(root, 'web', 'app');
  const snapshot = path.join(root, 'artifacts', 'publication', 'snapshots', 'old', 'bundle.json');
  const git = args => {
    const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    await mkdir(path.dirname(snapshot), {recursive: true});
    await mkdir(app, {recursive: true});
    await writeFile(snapshot, '{"snapshot_id":"old"}\n');
    git(['init', '-q']);
    git(['config', 'user.name', '출판 검증 시험']);
    git(['config', 'user.email', 'test@example.invalid']);
    git(['add', '.']);
    git(['commit', '-qm', 'original']);
    await writeFile(snapshot, '{"snapshot_id":"tampered"}\n');
    git(['add', '.']);
    git(['commit', '-qm', 'tampered']);
    const env = {...process.env};
    delete env.RULELINK_SNAPSHOT_DIFF;
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('./validate-publication-snapshot-diff.mjs', import.meta.url)), 'HEAD^',
    ], {cwd: app, env, encoding: 'utf8'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /기존 불변 스냅샷.*수정/u);
    assert.match(result.stderr, /artifacts\/publication\/snapshots\/old\/bundle\.json/u);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
