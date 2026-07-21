import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const validatorPath = fileURLToPath(new URL('./validate-publication-snapshot-diff.mjs', import.meta.url));

test('불변 스냅샷 변화가 없으면 허용한다', () => {
  const result = validate('');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /새 스냅샷 0개/);
});

test('새 snapshot_id의 bundle.json 추가를 허용한다', () => {
  const result = validate('A\tartifacts/publication/snapshots/snapshot-two/bundle.json\n');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /새 스냅샷 1개/);
});

test('기존 불변 스냅샷 수정을 거부한다', () => {
  const result = validate('M\tartifacts/publication/snapshots/snapshot-one/bundle.json\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /수정·삭제·이동할 수 없습니다/);
});

test('기존 불변 스냅샷 삭제와 이동을 거부한다', () => {
  const deleted = validate('D\tartifacts/publication/snapshots/snapshot-one/bundle.json\n');
  assert.notEqual(deleted.status, 0);
  const renamed = validate(
    'R100\tartifacts/publication/snapshots/snapshot-one/bundle.json\tartifacts/publication/snapshots/snapshot-two/bundle.json\n',
  );
  assert.notEqual(renamed.status, 0);
});

test('스냅샷 디렉터리에 임의 파일 추가를 거부한다', () => {
  const result = validate('A\tartifacts/publication/snapshots/snapshot-two/note.txt\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /bundle.json만 새로 추가/);
});

function validate(diff) {
  return spawnSync(process.execPath, [validatorPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RULELINK_SNAPSHOT_DIFF: diff,
    },
  });
}
