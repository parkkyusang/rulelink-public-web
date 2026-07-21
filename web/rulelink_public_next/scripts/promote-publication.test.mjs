import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const promoterPath = fileURLToPath(new URL('./promote-publication.mjs', import.meta.url));

test('검증된 후보를 불변 스냅샷과 current에 함께 승격한다', async () => {
  await withTask(async ({candidatePath, repoRoot}) => {
    await writeCandidate(candidatePath, bundle('snapshot-one'));
    const result = promote(candidatePath, repoRoot);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.snapshot_status, 'created');
    const snapshot = await readJson(path.join(repoRoot, 'artifacts', 'publication', 'snapshots', 'snapshot-one', 'bundle.json'));
    const current = await readJson(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'));
    assert.equal(snapshot.snapshot_id, 'snapshot-one');
    assert.deepEqual(current, snapshot);
  });
});

test('동일한 불변 스냅샷의 재승격은 허용한다', async () => {
  await withTask(async ({candidatePath, repoRoot}) => {
    await writeCandidate(candidatePath, bundle('snapshot-repeat'));
    assert.equal(promote(candidatePath, repoRoot).status, 0);
    const second = promote(candidatePath, repoRoot);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).snapshot_status, 'already_identical');
  });
});

test('같은 snapshot_id의 다른 내용은 current를 바꾸기 전에 거부한다', async () => {
  await withTask(async ({candidatePath, repoRoot}) => {
    await writeCandidate(candidatePath, bundle('snapshot-immutable'));
    assert.equal(promote(candidatePath, repoRoot).status, 0);
    const originalCurrent = await readFile(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8');

    await writeCandidate(candidatePath, {...bundle('snapshot-immutable'), built_at: '2026-07-20T01:00:00+00:00'});
    const conflict = promote(candidatePath, repoRoot);
    assert.notEqual(conflict.status, 0);
    assert.match(conflict.stderr, /불변 출판본 내용이 다릅니다/);
    const currentAfterConflict = await readFile(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8');
    assert.equal(currentAfterConflict, originalCurrent);
  });
});

test('검사 전용 모드는 파일을 만들지 않는다', async () => {
  await withTask(async ({candidatePath, repoRoot}) => {
    await writeCandidate(candidatePath, bundle('snapshot-check'));
    const result = promote(candidatePath, repoRoot, ['--check']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'validated');
    await assert.rejects(readFile(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json')));
  });
});

test('공개 검증을 통과하지 못한 후보는 승격하지 않는다', async () => {
  await withTask(async ({candidatePath, repoRoot}) => {
    await writeCandidate(candidatePath, {...bundle('snapshot-invalid'), schema: 'rulelink_editorial_preview_bundle_v1'});
    const result = promote(candidatePath, repoRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /후보 출판본 검증에 실패/);
    await assert.rejects(readFile(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json')));
  });
});

test('경로로 사용할 수 없는 snapshot_id를 거부한다', async () => {
  await withTask(async ({candidatePath, repoRoot}) => {
    await writeCandidate(candidatePath, bundle('../escape'));
    const result = promote(candidatePath, repoRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /snapshot_id/);
  });
});

function promote(candidatePath, repoRoot, extraArgs = []) {
  return spawnSync(process.execPath, [promoterPath, candidatePath, ...extraArgs, '--repo-root', repoRoot], {
    cwd: path.dirname(promoterPath),
    encoding: 'utf8',
    env: {
      ...process.env,
      RULELINK_VALIDATION_NOW: '2026-07-21T12:00:00+09:00',
    },
  });
}

async function withTask(callback) {
  const taskRoot = await mkdtemp(path.join(tmpdir(), 'rulelink-publication-promotion-'));
  const repoRoot = path.join(taskRoot, 'repo');
  const candidatePath = path.join(taskRoot, 'candidate.json');
  try {
    await callback({candidatePath, repoRoot});
  } finally {
    await rm(taskRoot, {recursive: true, force: true});
  }
}

async function writeCandidate(candidatePath, value) {
  await writeFile(candidatePath, JSON.stringify(value, null, 2), 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function bundle(snapshotId) {
  return {
    schema: 'rulelink_published_bundle_v1',
    snapshot_id: snapshotId,
    built_at: '2026-07-20T00:00:00+00:00',
    source_snapshot_id: 'source.test',
    jurisdiction: 'KR',
    locale: 'ko-KR',
    cards: [],
    assertions: [],
    change_briefs: [],
    file_hashes: {'fixture:approval': 'a'.repeat(64)},
  };
}
