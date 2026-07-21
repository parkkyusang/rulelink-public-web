import {spawnSync} from 'node:child_process';

const baseRef = process.argv[2] || process.env.RULELINK_SNAPSHOT_BASE || '';
const fixtureDiff = process.env.RULELINK_SNAPSHOT_DIFF;

if (!baseRef && fixtureDiff === undefined) {
  fail('비교 기준 Git 참조가 필요합니다.');
}
if (/^0+$/.test(baseRef)) {
  process.stdout.write('저장소 최초 푸시이므로 불변 출판 이력 차이 검사를 건너뜁니다.\n');
  process.exit(0);
}

let diffText = fixtureDiff;
if (diffText === undefined) {
  const result = spawnSync(
    'git',
    ['diff', '--name-status', '--find-renames', `${baseRef}...HEAD`, '--', 'artifacts/publication/snapshots'],
    {encoding: 'utf8'},
  );
  if (result.status !== 0) {
    fail(`불변 출판 이력 차이를 읽지 못했습니다.\n${result.stderr || result.stdout}`);
  }
  diffText = result.stdout;
}

const changes = parseChanges(diffText);
const violations = [];
for (const change of changes) {
  if (change.status !== 'A') {
    violations.push(`기존 불변 스냅샷은 수정·삭제·이동할 수 없습니다: ${change.status} ${change.paths.join(' -> ')}`);
    continue;
  }
  const path = change.paths[0];
  if (!/^artifacts\/publication\/snapshots\/[A-Za-z0-9][A-Za-z0-9._-]*\/bundle\.json$/.test(path)) {
    violations.push(`불변 스냅샷에는 snapshot_id 디렉터리의 bundle.json만 새로 추가할 수 있습니다: ${path}`);
  }
}

if (violations.length) {
  for (const violation of violations) process.stderr.write(`불변 출판 이력 검사 실패: ${violation}\n`);
  process.exit(1);
}
process.stdout.write(`불변 출판 이력 차이 검사 통과: 새 스냅샷 ${changes.length}개\n`);

function parseChanges(value) {
  return value
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const columns = line.split('\t');
      return {
        status: columns[0],
        paths: columns.slice(1),
      };
    });
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
