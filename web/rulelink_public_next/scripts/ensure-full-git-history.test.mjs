import assert from 'node:assert/strict';
import test from 'node:test';

import {ensureFullGitHistory} from './ensure-full-git-history.mjs';

test('완전한 저장소에서는 원격 fetch 없이 종료한다', () => {
  const calls = [];
  const result = ensureFullGitHistory({
    cwd: 'C:\\fixture',
    readFileText() {
      throw Object.assign(new Error('missing'), {code: 'ENOENT'});
    },
    runGit(args, options) {
      calls.push({args, options});
      return 'false';
    },
  });

  assert.deepEqual(result, {fetched: false, productionSourceRefsFetched: 0});
  assert.deepEqual(calls.map(({args}) => args), [
    ['rev-parse', '--is-shallow-repository'],
  ]);
});

test('shallow 저장소는 원격 이름 없이 공개 정본 저장소의 전체 이력을 가져온다', () => {
  const calls = [];
  const states = ['true', 'false'];
  const result = ensureFullGitHistory({
    cwd: 'C:\\fixture',
    readFileText() {
      throw Object.assign(new Error('missing'), {code: 'ENOENT'});
    },
    runGit(args, options) {
      calls.push({args, options});
      return args[0] === 'rev-parse' ? states.shift() : '';
    },
  });

  assert.deepEqual(result, {fetched: true, productionSourceRefsFetched: 0});
  assert.deepEqual(calls.map(({args}) => args), [
    ['rev-parse', '--is-shallow-repository'],
    ['fetch', '--unshallow', '--no-tags', 'https://github.com/parkkyusang/rulelink-public-web.git'],
    ['rev-parse', '--is-shallow-repository'],
  ]);
  assert.equal(calls[1].options.stdio, 'inherit');
});

test('production queue의 기존 주제 candidate_import source refs를 명시적으로 준비한다', () => {
  const calls = [];
  const result = ensureFullGitHistory({
    cwd: 'C:\\fixture\\web\\rulelink_public_next',
    readFileText(file) {
      assert.match(file, /artifacts[\\/]publication[\\/]production-queue\.json$/u);
      return JSON.stringify({
        items: [
          {
            candidate_import: {
              schema: 'rulelink_existing_topic_candidate_import_v2',
              source_branch: 'codex/existing-topic-coverage-housing-prbase-20260726',
              source_branch_ref:
                'refs/heads/codex/existing-topic-coverage-housing-prbase-20260726',
            },
          },
          {
            candidate_import: {
              schema: 'rulelink_existing_topic_candidate_import_v2',
              source_branch: 'codex/existing-topic-coverage-housing-prbase-20260726',
              source_branch_ref:
                'refs/heads/codex/existing-topic-coverage-housing-prbase-20260726',
            },
          },
          {
            candidate_import: {
              schema: 'rulelink_existing_topic_candidate_import_v2',
              source_branch: 'main;echo forged',
              source_branch_ref: 'refs/heads/main;echo forged',
            },
          },
          {
            candidate_import: {schema: 'rulelink_topic_candidate_import_v3'},
          },
        ],
      });
    },
    runGit(args, options) {
      calls.push({args, options});
      if (args[0] === 'show-ref') throw new Error('missing ref');
      return args[0] === 'rev-parse' ? 'false' : '';
    },
  });

  assert.deepEqual(result, {fetched: false, productionSourceRefsFetched: 1});
  assert.deepEqual(calls.map(({args}) => args), [
    ['rev-parse', '--is-shallow-repository'],
    [
      'show-ref',
      '--verify',
      '--hash',
      'refs/remotes/origin/codex/existing-topic-coverage-housing-prbase-20260726',
    ],
    [
      'fetch',
      '--no-tags',
      'https://github.com/parkkyusang/rulelink-public-web.git',
      'refs/heads/codex/existing-topic-coverage-housing-prbase-20260726:refs/remotes/origin/codex/existing-topic-coverage-housing-prbase-20260726',
    ],
  ]);
  assert.equal(calls[2].options.stdio, 'inherit');
});

test('production queue source ref가 이미 있으면 권한이 필요한 fetch를 생략한다', () => {
  const calls = [];
  const result = ensureFullGitHistory({
    cwd: 'C:\\fixture\\web\\rulelink_public_next',
    readFileText() {
      return JSON.stringify({
        items: [{
          candidate_import: {
            schema: 'rulelink_existing_topic_candidate_import_v2',
            source_branch: 'codex/existing-topic-coverage-labor-prbase-20260726',
            source_branch_ref:
              'refs/heads/codex/existing-topic-coverage-labor-prbase-20260726',
          },
        }],
      });
    },
    runGit(args, options) {
      calls.push({args, options});
      if (args[0] === 'rev-parse') return 'false';
      if (args[0] === 'show-ref') return '3eaf77e1a578c4cf63dff01c1acaba9645aa628d';
      throw new Error(`unexpected git ${args.join(' ')}`);
    },
  });

  assert.deepEqual(result, {fetched: false, productionSourceRefsFetched: 0});
  assert.deepEqual(calls.map(({args}) => args), [
    ['rev-parse', '--is-shallow-repository'],
    [
      'show-ref',
      '--verify',
      '--hash',
      'refs/remotes/origin/codex/existing-topic-coverage-labor-prbase-20260726',
    ],
  ]);
});

test('fetch 뒤에도 shallow이면 빌드를 중단한다', () => {
  assert.throws(
    () => ensureFullGitHistory({
      cwd: 'C:\\fixture',
      readFileText() {
        throw Object.assign(new Error('missing'), {code: 'ENOENT'});
      },
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
      readFileText() {
        throw Object.assign(new Error('missing'), {code: 'ENOENT'});
      },
      runGit() {
        return '';
      },
    }),
    /shallow 상태를 판독할 수 없습니다/,
  );
});
