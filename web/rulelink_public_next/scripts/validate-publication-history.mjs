import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const repoRoot = process.env.RULELINK_REPO_ROOT
  ? path.resolve(process.env.RULELINK_REPO_ROOT)
  : path.resolve(process.cwd(), '..', '..');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

if (!(await exists(currentPath))) {
  if (process.env.RULELINK_REQUIRE_PUBLICATION_BUNDLE === 'true') {
    fail(`현재 승인 출판본을 찾지 못했습니다: ${currentPath}`);
  }
  process.stdout.write('현재 승인 출판본이 없어 불변 이력 검사를 건너뜁니다.\n');
  process.exit(0);
}

let currentBytes;
let current;
try {
  currentBytes = await readFile(currentPath);
  current = JSON.parse(currentBytes.toString('utf8'));
} catch (error) {
  fail(`현재 승인 출판본을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
}

if (typeof current.snapshot_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(current.snapshot_id)) {
  fail('현재 승인 출판본의 snapshot_id를 불변 보관 경로로 사용할 수 없습니다.');
}

const snapshotPath = path.join(
  repoRoot,
  'artifacts',
  'publication',
  'snapshots',
  current.snapshot_id,
  'bundle.json',
);
if (!(await exists(snapshotPath))) {
  fail(`현재 승인 출판본의 불변 스냅샷이 없습니다: ${snapshotPath}`);
}

const snapshotBytes = await readFile(snapshotPath);
const currentHash = sha256(currentBytes);
const snapshotHash = sha256(snapshotBytes);
if (currentHash !== snapshotHash) {
  fail(`current 출판본이 같은 snapshot_id의 불변 보관본과 다릅니다: ${current.snapshot_id}`);
}

process.stdout.write(`출판 이력 무결성 검증 통과: ${current.snapshot_id} ${currentHash}\n`);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  process.stderr.write(`출판 이력 무결성 검증 실패: ${message}\n`);
  process.exit(1);
}
