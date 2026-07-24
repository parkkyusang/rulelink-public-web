import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRepositoryUrl = 'https://github.com/parkkyusang/rulelink-public-web.git';

function defaultRunGit(args, options) {
  const repositoryRoot = path.resolve(options.cwd, '..', '..').replaceAll('\\', '/');
  const gitArgs = ['-c', `safe.directory=${repositoryRoot}`, ...args];
  const result = spawnSync('git', gitArgs, {
    cwd: options.cwd,
    encoding: options.stdio === 'inherit' ? undefined : 'utf8',
    stdio: options.stdio,
  });
  if (result.status !== 0) {
    const detail = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`Git 명령 실패: git ${args.join(' ')}${detail ? `\n${detail}` : ''}`);
  }
  return typeof result.stdout === 'string' ? result.stdout.trim() : '';
}

function repositoryShallowState({cwd, runGit}) {
  const state = runGit(['rev-parse', '--is-shallow-repository'], {cwd, stdio: 'pipe'});
  if (state !== 'true' && state !== 'false') {
    throw new Error(`Git shallow 상태를 판독할 수 없습니다: ${state || '(빈 값)'}`);
  }
  return state === 'true';
}

export function ensureFullGitHistory({cwd = webRoot, runGit = defaultRunGit} = {}) {
  if (!repositoryShallowState({cwd, runGit})) {
    return {fetched: false};
  }

  runGit(['fetch', '--unshallow', '--no-tags', publicRepositoryUrl], {cwd, stdio: 'inherit'});

  if (repositoryShallowState({cwd, runGit})) {
    throw new Error('Git 전체 이력을 가져온 뒤에도 저장소가 shallow 상태입니다.');
  }
  return {fetched: true};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = ensureFullGitHistory();
    console.log(
      result.fetched
        ? 'Git 전체 이력 준비 완료: shallow 복제를 origin 전체 이력으로 확장했습니다.'
        : 'Git 전체 이력 준비 완료: 이미 완전한 저장소입니다.',
    );
  } catch (error) {
    console.error(`Git 전체 이력 준비 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
