import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
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

function productionSourceRefspecs({cwd, readFileText}) {
  const repositoryRoot = path.resolve(cwd, '..', '..');
  const queuePath = path.join(
    repositoryRoot,
    'artifacts',
    'publication',
    'production-queue.json',
  );
  let queue;
  try {
    queue = JSON.parse(readFileText(queuePath));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const refspecs = [];
  const seen = new Set();
  for (const item of queue.items ?? []) {
    const candidate = item?.candidate_import;
    if (candidate?.schema !== 'rulelink_existing_topic_candidate_import_v2') {
      continue;
    }
    const branch = candidate.source_branch;
    const sourceRef = candidate.source_branch_ref;
    if (
      !/^codex\/[a-z0-9._/-]+$/u.test(branch || '') ||
      sourceRef !== `refs/heads/${branch}`
    ) {
      continue;
    }
    const destinationRef = `refs/remotes/origin/${branch}`;
    const key = `${sourceRef}:${destinationRef}`;
    if (!seen.has(key)) {
      seen.add(key);
      refspecs.push(key);
    }
  }
  return refspecs;
}

function hasRef({cwd, ref, runGit}) {
  try {
    runGit(['show-ref', '--verify', '--hash', ref], {cwd, stdio: 'pipe'});
    return true;
  } catch {
    return false;
  }
}

export function ensureFullGitHistory({
  cwd = webRoot,
  runGit = defaultRunGit,
  readFileText = file => readFileSync(file, 'utf8'),
} = {}) {
  let fetched = false;
  if (repositoryShallowState({cwd, runGit})) {
    runGit(['fetch', '--unshallow', '--no-tags', publicRepositoryUrl], {cwd, stdio: 'inherit'});

    if (repositoryShallowState({cwd, runGit})) {
      throw new Error('Git 전체 이력을 가져온 뒤에도 저장소가 shallow 상태입니다.');
    }
    fetched = true;
  }

  const productionRefspecs = productionSourceRefspecs({cwd, readFileText});
  let sourceRefsFetched = 0;
  for (const refspec of productionRefspecs) {
    const destinationRef = refspec.split(':').at(1);
    if (destinationRef && hasRef({cwd, ref: destinationRef, runGit})) {
      continue;
    }
    runGit(['fetch', '--no-tags', publicRepositoryUrl, refspec], {
      cwd,
      stdio: 'inherit',
    });
    sourceRefsFetched += 1;
  }
  return {fetched, productionSourceRefsFetched: sourceRefsFetched};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = ensureFullGitHistory();
    console.log(
      [
        result.fetched
          ? 'Git 전체 이력 준비 완료: shallow 복제를 origin 전체 이력으로 확장했습니다.'
          : 'Git 전체 이력 준비 완료: 이미 완전한 저장소입니다.',
        result.productionSourceRefsFetched > 0
          ? `생산 후보 source refs 준비 완료: ${result.productionSourceRefsFetched}개`
          : '생산 후보 source refs 준비 완료: 추가 fetch 없음',
      ].join('\n'),
    );
  } catch (error) {
    console.error(`Git 전체 이력 준비 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
