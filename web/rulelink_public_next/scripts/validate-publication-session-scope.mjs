import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');

export function inferPublicationRole(headRef = '') {
  if (/^codex\/content-[a-z0-9._/-]+$/u.test(headRef)) return 'topic';
  if (/^codex\/integrate-publication-[a-z0-9._/-]+$/u.test(headRef)) return 'integrator';
  if (/^codex\/migrate-publication-[a-z0-9._/-]+$/u.test(headRef)) return 'migration';
  if (/^codex\/release-[a-z0-9._/-]+$/u.test(headRef)) return 'release';
  if (/^codex\/govern-publication-[a-z0-9._/-]+$/u.test(headRef)) return 'governance';
  if (/^codex\/quality-[a-z0-9._/-]+$/u.test(headRef)) return 'quality_governance';
  if (/^codex\/runtime-publication-[a-z0-9._/-]+$/u.test(headRef)) return 'runtime';
  return null;
}

export function normalizeChangedPath(value) {
  return String(value || '').trim().replaceAll('\\', '/').replace(/^\.\//u, '');
}

export function isPublicationGovernedPath(filePath) {
  const value = normalizeChangedPath(filePath);
  return value === 'README.md'
    || value === '.github/workflows/public-web-checks.yml'
    || value === 'docs/CONTENT_HANDOFF_CONTRACT_KO.md'
    || value === 'docs/PUBLICATION_SEMANTIC_OVERLAP_CONTRACT_KO.md'
    || value === 'docs/PUBLIC_CONCEPT_TERM_RELATION_CONTRACT_KO.md'
    || value === 'artifacts/publication/production-queue.json'
    || value === 'artifacts/publication/production-queue-registry.json'
    || value === 'artifacts/publication/current/bundle.json'
    || value === 'artifacts/publication/topics/manifest.json'
    || value === 'artifacts/publication/concepts/manifest.json'
    || /^artifacts\/publication\/(?:topics|concepts)\/[a-z0-9-]+\.json$/u.test(value)
    || /^artifacts\/publication\/snapshots\/[a-z0-9._-]+\/bundle\.json$/u.test(value)
    || value === 'web/rulelink_public_next/scripts/validate-publication-session-scope.mjs'
    || value === 'web/rulelink_public_next/scripts/validate-publication-session-scope.test.mjs'
    || value === 'web/rulelink_public_next/scripts/validate-publication-production-queue.mjs'
    || value === 'web/rulelink_public_next/scripts/validate-publication-production-queue.test.mjs'
    || value === 'web/rulelink_public_next/scripts/audit-publication-semantic-overlap.mjs'
    || value === 'web/rulelink_public_next/scripts/audit-publication-semantic-overlap.test.mjs'
    || value === 'web/rulelink_public_next/scripts/audit-publication-topic-queue.mjs'
    || value === 'web/rulelink_public_next/scripts/audit-publication-topic-queue.test.mjs'
    || value === 'web/rulelink_public_next/scripts/audit-publication-topic-quality-debt.mjs'
    || value === 'web/rulelink_public_next/scripts/audit-publication-topic-quality-debt.test.mjs'
    || value === 'web/rulelink_public_next/src/lib/publication-topic-quality-debt-baseline.json'
    || value === 'web/rulelink_public_next/scripts/knowledge-content-type-contract.test.mjs'
    || value === 'web/rulelink_public_next/src/lib/knowledge-content-types.json'
    || value === 'web/rulelink_public_next/src/lib/content-labels.ts'
    || value === 'web/rulelink_public_next/src/lib/concept-terms.ts'
    || value === 'web/rulelink_public_next/src/lib/concept-identity-policy.v1.json'
    || value === 'web/rulelink_public_next/src/lib/publication-concept-identity-debt-baseline.json'
    || value === 'web/rulelink_public_next/src/types/publication.ts'
    || value === 'web/rulelink_public_next/scripts/concept-identity-governance.mjs'
    || value === 'web/rulelink_public_next/scripts/concept-identity-quality.test.mjs'
    || value === 'web/rulelink_public_next/scripts/validate-publication-concept-identity.mjs'
    || value === 'web/rulelink_public_next/scripts/public-concept-graph.test.mjs'
    || value === 'web/rulelink_public_next/scripts/validate-publication-bundle.mjs'
    || value === 'web/rulelink_public_next/scripts/validate-publication-bundle.test.mjs'
    || value === 'web/rulelink_public_next/scripts/compose-publication-knowledge.mjs'
    || value === 'web/rulelink_public_next/scripts/compose-publication-knowledge.test.mjs'
    || /^web\/rulelink_public_next\/scripts\/fixtures\/concept-[a-z0-9-]+\.json$/u.test(value)
    || value === 'web/rulelink_public_next/deploy/release.json';
}

export function allowedForRole(role, filePath) {
  const value = normalizeChangedPath(filePath);
  if (role === 'topic') {
    return (
      /^artifacts\/publication\/topics\/(?!manifest\.json$)[a-z0-9-]+\.json$/u.test(value)
      || /^artifacts\/publication\/concepts\/(?!manifest\.json$)[a-z0-9-]+\.json$/u.test(value)
      || /^web\/rulelink_public_next\/scripts\/[a-z0-9-]*(?:topic|handoff)[a-z0-9-]*\.test\.mjs$/u.test(value)
    );
  }
  if (role === 'integrator') {
    return value === 'README.md'
      || value === 'artifacts/publication/production-queue.json'
      || value === 'artifacts/publication/production-queue-registry.json'
      || value === 'artifacts/publication/current/bundle.json'
      || value === 'artifacts/publication/topics/manifest.json'
      || value === 'artifacts/publication/concepts/manifest.json'
      || /^artifacts\/publication\/snapshots\/[a-z0-9._-]+\/bundle\.json$/u.test(value);
  }
  if (role === 'migration') {
    return allowedForRole('topic', value) || allowedForRole('integrator', value);
  }
  if (role === 'release') return value === 'web/rulelink_public_next/deploy/release.json';
  if (role === 'governance') {
    return value === '.github/workflows/public-web-checks.yml'
      || value === 'docs/CONTENT_HANDOFF_CONTRACT_KO.md'
      || value === 'docs/PUBLICATION_SEMANTIC_OVERLAP_CONTRACT_KO.md'
      || value === 'artifacts/publication/production-queue.json'
      || value === 'artifacts/publication/production-queue-registry.json'
      || value === 'web/rulelink_public_next/package.json'
      || value === 'web/rulelink_public_next/scripts/validate-publication-session-scope.mjs'
      || value === 'web/rulelink_public_next/scripts/validate-publication-session-scope.test.mjs'
      || value === 'web/rulelink_public_next/scripts/validate-publication-production-queue.mjs'
      || value === 'web/rulelink_public_next/scripts/validate-publication-production-queue.test.mjs'
      || value === 'web/rulelink_public_next/scripts/audit-publication-semantic-overlap.mjs'
      || value === 'web/rulelink_public_next/scripts/audit-publication-semantic-overlap.test.mjs'
      || value === 'web/rulelink_public_next/scripts/audit-publication-topic-queue.mjs'
      || value === 'web/rulelink_public_next/scripts/audit-publication-topic-queue.test.mjs'
      || value === 'web/rulelink_public_next/scripts/audit-publication-topic-quality-debt.mjs'
      || value === 'web/rulelink_public_next/scripts/audit-publication-topic-quality-debt.test.mjs'
      || value === 'web/rulelink_public_next/src/lib/publication-topic-quality-debt-baseline.json'
      || value === 'web/rulelink_public_next/scripts/knowledge-content-type-contract.test.mjs'
      || value === 'web/rulelink_public_next/src/lib/knowledge-content-types.json'
      || value === 'web/rulelink_public_next/src/lib/content-labels.ts'
      || value === 'web/rulelink_public_next/src/types/publication.ts';
  }
  if (role === 'quality_governance') {
    return value === 'docs/PUBLIC_CONCEPT_TERM_RELATION_CONTRACT_KO.md'
      || value === 'web/rulelink_public_next/package.json'
      || value === 'web/rulelink_public_next/src/types/publication.ts'
      || value === 'web/rulelink_public_next/src/lib/concept-terms.ts'
      || value === 'web/rulelink_public_next/src/lib/concept-identity-policy.v1.json'
      || value === 'web/rulelink_public_next/src/lib/publication-concept-identity-debt-baseline.json'
      || value === 'web/rulelink_public_next/scripts/concept-identity-governance.mjs'
      || value === 'web/rulelink_public_next/scripts/concept-identity-quality.test.mjs'
      || value === 'web/rulelink_public_next/scripts/validate-publication-concept-identity.mjs'
      || value === 'web/rulelink_public_next/scripts/public-concept-graph.test.mjs'
      || value === 'web/rulelink_public_next/scripts/validate-publication-bundle.mjs'
      || value === 'web/rulelink_public_next/scripts/validate-publication-bundle.test.mjs'
      || value === 'web/rulelink_public_next/scripts/compose-publication-knowledge.mjs'
      || value === 'web/rulelink_public_next/scripts/compose-publication-knowledge.test.mjs'
      || value === 'web/rulelink_public_next/scripts/audit-publication-topic-queue.mjs'
      || value === 'web/rulelink_public_next/scripts/audit-publication-topic-queue.test.mjs'
      || value === 'web/rulelink_public_next/scripts/legal-concept-comparisons-02-topic-handoff.test.mjs'
      || value === 'web/rulelink_public_next/scripts/validate-publication-session-scope.mjs'
      || value === 'web/rulelink_public_next/scripts/validate-publication-session-scope.test.mjs'
      || /^web\/rulelink_public_next\/scripts\/fixtures\/concept-[a-z0-9-]+\.json$/u.test(value);
  }
  if (role === 'runtime') {
    return value === 'web/rulelink_public_next/package.json'
      || /^web\/rulelink_public_next\/(?:app|src|scripts)\//u.test(value);
  }
  return false;
}

export function validatePublicationScope(headRef, changedPaths) {
  const role = inferPublicationRole(headRef);
  const paths = changedPaths.map(normalizeChangedPath).filter(Boolean);
  const governed = paths.filter(isPublicationGovernedPath);
  if (!role) {
    return governed.length
      ? {ok: false, role: null, invalid: governed, message: '출판 데이터와 생산 계약은 역할 접두사가 있는 브랜치에서만 수정할 수 있습니다.'}
      : {ok: true, role: null, invalid: [], message: '출판 관련 변경이 없어 역할 검사를 건너뜁니다.'};
  }
  const invalid = paths.filter(filePath => !allowedForRole(role, filePath));
  return invalid.length
    ? {ok: false, role, invalid, message: `${role} 역할이 소유하지 않은 파일을 수정했습니다.`}
    : {ok: true, role, invalid: [], message: `${role} 역할 파일 소유권 검증 통과: ${paths.length}개`};
}

function changedPathsFromGit(baseSha) {
  const result = spawnSync('git', ['diff', '--name-only', `${baseSha}...HEAD`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`변경 파일 조회 실패: ${result.stderr || result.stdout || '알 수 없는 오류'}`);
  }
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return '';
  return args[index + 1] || '';
}

function main() {
  const args = process.argv.slice(2);
  const baseSha = option(args, '--base') || process.env.RULELINK_BASE_SHA || '';
  const headRef = option(args, '--head-ref') || process.env.RULELINK_HEAD_REF || '';
  if (!baseSha) throw new Error('--base 또는 RULELINK_BASE_SHA가 필요합니다.');
  const result = validatePublicationScope(headRef, changedPathsFromGit(baseSha));
  if (!result.ok) {
    console.error(result.message);
    for (const filePath of result.invalid) console.error(`- ${filePath}`);
    process.exitCode = 1;
    return;
  }
  console.log(result.message);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    console.error(`병렬 출판 소유권 검사 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
