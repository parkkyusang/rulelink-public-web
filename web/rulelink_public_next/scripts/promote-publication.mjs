import {copyFile, mkdir, readFile, rename, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.join(scriptDir, 'validate-publication-bundle.mjs');
const options = parseArguments(process.argv.slice(2));
const candidatePath = path.resolve(options.candidate);
const repoRoot = options.repoRoot
  ? path.resolve(options.repoRoot)
  : path.resolve(process.cwd(), '..', '..');

let candidateBytes;
let candidate;
try {
  candidateBytes = await readFile(candidatePath);
  candidate = JSON.parse(candidateBytes.toString('utf8'));
} catch (error) {
  fail(`후보 출판본을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
}

const validation = spawnSync(process.execPath, [validatorPath], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    RULELINK_WEB_BUNDLE_PATH: candidatePath,
    RULELINK_REQUIRE_PUBLICATION_BUNDLE: 'true',
  },
});
if (validation.status !== 0) {
  fail(`후보 출판본 검증에 실패했습니다.\n${validation.stderr || validation.stdout}`);
}

if (typeof candidate.snapshot_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate.snapshot_id)) {
  fail('snapshot_id는 영문·숫자로 시작하고 영문·숫자·점·밑줄·하이픈만 사용해야 합니다.');
}

const candidateHash = sha256(candidateBytes);
const snapshotsRoot = path.join(repoRoot, 'artifacts', 'publication', 'snapshots');
const snapshotDir = path.join(snapshotsRoot, candidate.snapshot_id);
const snapshotPath = path.join(snapshotDir, 'bundle.json');
const currentDir = path.join(repoRoot, 'artifacts', 'publication', 'current');
const currentPath = path.join(currentDir, 'bundle.json');

if (options.checkOnly) {
  process.stdout.write(JSON.stringify({
    status: 'validated',
    snapshot_id: candidate.snapshot_id,
    sha256: candidateHash,
    candidate: candidatePath,
  }, null, 2) + '\n');
  process.exit(0);
}

await mkdir(snapshotsRoot, {recursive: true});
const snapshotStatus = await preserveImmutableSnapshot(snapshotDir, snapshotPath, candidatePath, candidateHash);
await replaceCurrentBundle(currentDir, currentPath, candidatePath);

process.stdout.write(JSON.stringify({
  status: 'promoted',
  snapshot_id: candidate.snapshot_id,
  sha256: candidateHash,
  snapshot_status: snapshotStatus,
  snapshot_path: snapshotPath,
  current_path: currentPath,
}, null, 2) + '\n');

async function preserveImmutableSnapshot(targetDir, targetPath, sourcePath, sourceHash) {
  if (await exists(targetPath)) {
    const existingHash = sha256(await readFile(targetPath));
    if (existingHash !== sourceHash) {
      fail(`같은 snapshot_id의 불변 출판본 내용이 다릅니다: ${candidate.snapshot_id}`);
    }
    return 'already_identical';
  }

  const stagingDir = path.join(snapshotsRoot, `.staging-${candidate.snapshot_id}-${randomUUID()}`);
  await mkdir(stagingDir, {recursive: false});
  try {
    await copyFile(sourcePath, path.join(stagingDir, 'bundle.json'));
    try {
      await rename(stagingDir, targetDir);
      return 'created';
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code)) throw error;
      const existingHash = await exists(targetPath) ? sha256(await readFile(targetPath)) : null;
      if (existingHash !== sourceHash) {
        fail(`동시 승격 중 같은 snapshot_id의 다른 내용이 발견됐습니다: ${candidate.snapshot_id}`);
      }
      return 'already_identical';
    }
  } finally {
    if (await exists(stagingDir)) await rm(stagingDir, {recursive: true, force: true});
  }
}

async function replaceCurrentBundle(targetDir, targetPath, sourcePath) {
  await mkdir(targetDir, {recursive: true});
  const temporaryPath = path.join(targetDir, `.bundle-${randomUUID()}.json`);
  await copyFile(sourcePath, temporaryPath);
  try {
    try {
      await rename(temporaryPath, targetPath);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error?.code) || !(await exists(targetPath))) throw error;
      const backupPath = path.join(targetDir, `.bundle-backup-${randomUUID()}.json`);
      await rename(targetPath, backupPath);
      try {
        await rename(temporaryPath, targetPath);
        await rm(backupPath, {force: true});
      } catch (replacementError) {
        if (!(await exists(targetPath)) && await exists(backupPath)) await rename(backupPath, targetPath);
        throw replacementError;
      }
    }
  } finally {
    await rm(temporaryPath, {force: true});
  }
}

function parseArguments(args) {
  let candidate = '';
  let repoRoot = '';
  let checkOnly = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check') {
      checkOnly = true;
    } else if (argument === '--repo-root') {
      repoRoot = args[index + 1] || '';
      index += 1;
    } else if (!argument.startsWith('-') && !candidate) {
      candidate = argument;
    } else {
      fail(`알 수 없는 인수입니다: ${argument}`);
    }
  }
  if (!candidate) fail('사용법: npm run promote:publication -- <후보 bundle.json> [--check] [--repo-root <경로>]');
  if (args.includes('--repo-root') && !repoRoot) fail('--repo-root 뒤에 경로가 필요합니다.');
  return {candidate, repoRoot, checkOnly};
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile() || (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
