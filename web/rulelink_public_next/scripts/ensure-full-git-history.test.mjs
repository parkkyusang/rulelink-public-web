import assert from 'node:assert/strict';
import test from 'node:test';

import {ensureFullGitHistory} from './ensure-full-git-history.mjs';

test('완전한 저장소에서는 원격 fetch 없이 종료한다', () => {
  const calls = [];
  const result = ensureFullGitHistory({
    cwd: 'C:\\fixture',
    runGit(args, options) {
      calls.push({args, options});
      return 'false';
    },
  });

  assert.deepEqual(result, {fetched: false});
  assert.deepEqual(calls.map(({args}) => args), [
    ['rev-parse', '--is-shallow-repository'],
  ]);
});

test('shallow 저장소는 origin 전체 이력을 가져온 뒤 상태를 재검증한다', () => {
  const calls = [];
  const states = ['true', 'false'];
  const result = ensureFullGitHistory({
    cwd: 'C:\\fixture',
    runGit(args, options) {
      calls.push({args, options});
      return args[0] === 'rev-parse' ? states.shift() : '';
    },
  });

  assert.deepEqual(result, {fetched: true});
  assert.deepEqual(calls.map(({args}) => args), [
    ['rev-parse', '--is-shallow-repository'],
    ['fetch', '--unshallow', '--no-tags', 'origin'],
    ['rev-parse', '--is-shallow-repository'],
  ]);
  assert.equal(calls[1].options.stdio, 'inherit');
});

test('fetch 뒤에도 shallow이면 빌드를 중단한다', () => {
  assert.throws(
    () => ensureFullGitHistory({
      cwd: 'C:\\fixture',
      runGit(args) {
        return args[0] === 'rev-parse' ? 'true' : '';
      },
    }),
    /전체 이력을 가져온 뒤에도/,
  );
});

test('판독할 수 없는 shallow 상태는 정상으로 가장하지 않는다', () => {
  assert.throws(
    () => ensureFullGitHistory({
      cwd: 'C:\\fixture',
      runGit() {
        return '';
      },
    }),
    /shallow 상태를 판독할 수 없습니다/,
  );
});
