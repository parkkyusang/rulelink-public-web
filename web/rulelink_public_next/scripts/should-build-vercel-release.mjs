import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const RELEASE_MARKER = 'deploy/release.json';

export function productionReleaseDecision(branch, markerDiffStatus) {
  if (branch?.startsWith('preview-')) {
    return {build: true, reason: '명시적 시각 검수 브랜치입니다.'};
  }
  if (branch !== 'main') {
    return {build: false, reason: 'main 또는 preview-* 브랜치가 아닙니다.'};
  }
  if (markerDiffStatus === 1) {
    return {build: true, reason: `${RELEASE_MARKER}가 변경된 명시적 운영 공개입니다.`};
  }
  if (markerDiffStatus === 0) {
    return {build: false, reason: '운영 공개 표식이 바뀌지 않은 검증·축적 커밋입니다.'};
  }
  return {build: true, reason: 'Git 비교 실패 시 운영 공개를 누락하지 않도록 빌드를 허용합니다.'};
}

export function releaseMarkerDiffStatus() {
  const result = spawnSync('git', ['diff', '--quiet', 'HEAD^', 'HEAD', '--', RELEASE_MARKER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) return null;
  return result.status;
}

function main() {
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? '';
  const decision = productionReleaseDecision(branch, releaseMarkerDiffStatus());
  process.stdout.write(`${decision.build ? '운영 빌드 실행' : '운영 빌드 생략'}: ${decision.reason}\n`);
  process.exitCode = decision.build ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
