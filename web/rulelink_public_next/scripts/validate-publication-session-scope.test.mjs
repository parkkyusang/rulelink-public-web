import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  allowedForRole,
  inferPublicationRole,
  validatePublicationScope,
} from './validate-publication-session-scope.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('브랜치 접두사로 주제·통합·이관·배포·생산계약·런타임 역할을 구분한다', () => {
  assert.equal(inferPublicationRole('codex/content-law-change-topic-20260721'), 'topic');
  assert.equal(inferPublicationRole('codex/integrate-publication-021'), 'integrator');
  assert.equal(inferPublicationRole('codex/migrate-publication-021'), 'migration');
  assert.equal(inferPublicationRole('codex/release-021'), 'release');
  assert.equal(inferPublicationRole('codex/govern-publication-production-control-20260723'), 'governance');
  assert.equal(inferPublicationRole('codex/quality-concept-identity-20260723'), 'quality_governance');
  assert.equal(inferPublicationRole('codex/runtime-publication-related-edges-20260723'), 'runtime');
  assert.equal(inferPublicationRole('codex/release-train-023-authority-20260724'), 'release_train');
  assert.equal(inferPublicationRole('codex/concept-graph-web'), null);
});

test('릴리스 열차는 기존 역할의 합집합과 authority 브라우저 증거만 한 번에 통합한다', () => {
  const result = validatePublicationScope('codex/release-train-023-authority-20260724', [
    '.gitattributes',
    '.github/workflows/public-web-checks.yml',
    '.github/workflows/authority-release-evidence.yml',
    'README.md',
    'artifacts/publication/concepts/inheritance.json',
    'artifacts/publication/topics/family-inheritance.json',
    'artifacts/publication/topics/manifest.json',
    'artifacts/publication/current/bundle.json',
    'artifacts/publication/production-queue.json',
    'artifacts/publication/production-queue-registry.json',
    'artifacts/publication/snapshots/kr-knowledge-core-20260723-023/bundle.json',
    'web/rulelink_public_next/package-lock.json',
    'web/rulelink_public_next/package.json',
    'web/rulelink_public_next/playwright.config.ts',
    'web/rulelink_public_next/tsconfig.json',
    'web/rulelink_public_next/app/ko/knowledge/[slug]/page.tsx',
    'web/rulelink_public_next/src/lib/authority-reading.ts',
    'web/rulelink_public_next/scripts/validate-public-authority-reading.mjs',
    'web/rulelink_public_next/e2e/authority/authority-zero-state.spec.ts',
  ]);
  assert.equal(result.ok, true);
  assert.equal(allowedForRole('release_train', '.gitattributes'), true);
  assert.equal(allowedForRole('release_train', 'web/rulelink_public_next/deploy/release.json'), false);
  assert.equal(allowedForRole('release_train', 'data/private-source.sqlite'), false);
  assert.equal(allowedForRole('release_train', '.github/workflows/unrelated.yml'), false);
});

test('PR 검증은 임시 병합 커밋이 아니라 실제 PR head의 전체 이력을 사용한다', async () => {
  const workflow = await readFile(
    path.join(repoRoot, '.github', 'workflows', 'public-web-checks.yml'),
    'utf8',
  );
  assert.match(workflow, /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\|\|\s*github\.sha\s*\}\}/u);
  assert.match(workflow, /fetch-depth:\s*0/u);
});

test('출판 런타임 역할은 타입·검증·화면을 바꾸되 정본과 운영 표지는 건드리지 않는다', () => {
  const result = validatePublicationScope('codex/runtime-publication-related-edges-20260723', [
    'web/rulelink_public_next/package.json',
    'web/rulelink_public_next/src/types/publication.ts',
    'web/rulelink_public_next/src/lib/knowledge-relations.ts',
    'web/rulelink_public_next/scripts/validate-publication-bundle.mjs',
    'web/rulelink_public_next/app/ko/knowledge/[slug]/page.tsx',
  ]);
  assert.equal(result.ok, true);
  assert.equal(allowedForRole('runtime', 'artifacts/publication/topics/manifest.json'), false);
  assert.equal(allowedForRole('runtime', 'artifacts/publication/current/bundle.json'), false);
  assert.equal(allowedForRole('runtime', 'artifacts/publication/production-queue.json'), false);
  assert.equal(allowedForRole('runtime', 'artifacts/publication/production-queue-registry.json'), false);
  assert.equal(allowedForRole('runtime', 'web/rulelink_public_next/deploy/release.json'), false);
});

test('주제 생산자는 독립 주제·개념 조각과 전용 시험만 수정한다', () => {
  assert.equal(allowedForRole('topic', 'artifacts/publication/topics/inheritance.json'), true);
  assert.equal(allowedForRole('topic', 'artifacts/publication/concepts/inheritance.json'), true);
  assert.equal(allowedForRole('topic', 'web/rulelink_public_next/scripts/law-change-topic-handoff.test.mjs'), true);
  assert.equal(allowedForRole('topic', 'artifacts/publication/production-queue.json'), false);
  assert.equal(allowedForRole('topic', 'artifacts/publication/production-queue-registry.json'), false);
  assert.equal(allowedForRole('topic', 'artifacts/publication/topics/manifest.json'), false);
  assert.equal(allowedForRole('topic', 'artifacts/publication/current/bundle.json'), false);
});

test('통합자와 배포자는 공유 파일을 서로 침범하지 않는다', () => {
  const integration = validatePublicationScope('codex/integrate-publication-021', [
    'README.md',
    'artifacts/publication/production-queue.json',
    'artifacts/publication/production-queue-registry.json',
    'artifacts/publication/topics/manifest.json',
    'artifacts/publication/current/bundle.json',
    'artifacts/publication/snapshots/kr-knowledge-core-20260721-021/bundle.json',
  ]);
  assert.equal(integration.ok, true);
  assert.equal(allowedForRole('integrator', 'web/rulelink_public_next/deploy/release.json'), false);
  assert.equal(allowedForRole('release', 'web/rulelink_public_next/deploy/release.json'), true);
  assert.equal(allowedForRole('release', 'artifacts/publication/current/bundle.json'), false);
});

test('이관자는 이미 통합된 주제와 공유 정본을 한 번에 갱신한다', () => {
  const migration = validatePublicationScope('codex/migrate-publication-021', [
    'README.md',
    'artifacts/publication/production-queue.json',
    'artifacts/publication/production-queue-registry.json',
    'artifacts/publication/topics/legal-concept-comparisons.json',
    'web/rulelink_public_next/scripts/legal-concept-comparisons-topic-handoff.test.mjs',
    'artifacts/publication/topics/manifest.json',
    'artifacts/publication/current/bundle.json',
    'artifacts/publication/snapshots/kr-knowledge-core-20260721-021/bundle.json',
  ]);
  assert.equal(migration.ok, true);
  assert.equal(allowedForRole('migration', 'web/rulelink_public_next/deploy/release.json'), false);
  assert.equal(allowedForRole('migration', 'web/rulelink_public_next/src/lib/publication.ts'), false);
});

test('생산계약 역할만 공식 대기열·계약·검증기를 함께 바꿀 수 있다', () => {
  const result = validatePublicationScope('codex/govern-publication-production-control-20260723', [
    '.github/workflows/public-web-checks.yml',
    'docs/CONTENT_HANDOFF_CONTRACT_KO.md',
    'docs/PUBLICATION_SEMANTIC_OVERLAP_CONTRACT_KO.md',
    'artifacts/publication/production-queue.json',
    'artifacts/publication/production-queue-registry.json',
    'web/rulelink_public_next/package.json',
    'web/rulelink_public_next/scripts/validate-publication-session-scope.mjs',
    'web/rulelink_public_next/scripts/validate-publication-session-scope.test.mjs',
    'web/rulelink_public_next/scripts/validate-publication-production-queue.mjs',
    'web/rulelink_public_next/scripts/validate-publication-production-queue.test.mjs',
    'web/rulelink_public_next/scripts/audit-publication-semantic-overlap.mjs',
    'web/rulelink_public_next/scripts/audit-publication-semantic-overlap.test.mjs',
    'web/rulelink_public_next/scripts/audit-publication-topic-queue.mjs',
    'web/rulelink_public_next/scripts/audit-publication-topic-queue.test.mjs',
    'web/rulelink_public_next/scripts/audit-publication-topic-quality-debt.mjs',
    'web/rulelink_public_next/scripts/audit-publication-topic-quality-debt.test.mjs',
    'web/rulelink_public_next/src/lib/publication-topic-quality-debt-baseline.json',
    'web/rulelink_public_next/scripts/knowledge-content-type-contract.test.mjs',
    'web/rulelink_public_next/src/lib/knowledge-content-types.json',
    'web/rulelink_public_next/src/lib/content-labels.ts',
    'web/rulelink_public_next/src/types/publication.ts',
  ]);
  assert.equal(result.ok, true);
  assert.equal(allowedForRole('governance', 'artifacts/publication/current/bundle.json'), false);
  assert.equal(allowedForRole('governance', 'web/rulelink_public_next/app/ko/page.tsx'), false);
  assert.equal(allowedForRole('governance', '.github/workflows/public-web-checks.yml'), true);
  assert.equal(allowedForRole('topic', 'web/rulelink_public_next/src/lib/publication-topic-quality-debt-baseline.json'), false);
});

test('개념 품질 거버넌스는 검증·fixture·타입만 소유하고 출판 정본과 화면을 수정하지 않는다', () => {
  const result = validatePublicationScope('codex/quality-concept-identity-20260723', [
    'docs/PUBLIC_CONCEPT_TERM_RELATION_CONTRACT_KO.md',
    'web/rulelink_public_next/package.json',
    'web/rulelink_public_next/src/types/publication.ts',
    'web/rulelink_public_next/src/lib/concept-terms.ts',
    'web/rulelink_public_next/src/lib/concept-identity-policy.v1.json',
    'web/rulelink_public_next/src/lib/publication-concept-identity-debt-baseline.json',
    'web/rulelink_public_next/scripts/concept-identity-governance.mjs',
    'web/rulelink_public_next/scripts/concept-identity-quality.test.mjs',
    'web/rulelink_public_next/scripts/validate-publication-concept-identity.mjs',
    'web/rulelink_public_next/scripts/fixtures/concept-identity-quality.json',
    'web/rulelink_public_next/scripts/fixtures/concept-term-matcher.json',
    'web/rulelink_public_next/scripts/public-concept-graph.test.mjs',
    'web/rulelink_public_next/scripts/validate-publication-bundle.mjs',
    'web/rulelink_public_next/scripts/compose-publication-knowledge.mjs',
    'web/rulelink_public_next/scripts/audit-publication-topic-queue.mjs',
    'web/rulelink_public_next/scripts/audit-publication-topic-queue.test.mjs',
    'web/rulelink_public_next/scripts/legal-concept-comparisons-02-topic-handoff.test.mjs',
    'web/rulelink_public_next/scripts/validate-publication-session-scope.mjs',
    'web/rulelink_public_next/scripts/validate-publication-session-scope.test.mjs',
  ]);
  assert.equal(result.ok, true);
  assert.equal(allowedForRole('quality_governance', 'artifacts/publication/current/bundle.json'), false);
  assert.equal(allowedForRole('quality_governance', 'artifacts/publication/concepts/inheritance.json'), false);
  assert.equal(allowedForRole('quality_governance', 'web/rulelink_public_next/app/ko/concepts/page.tsx'), false);
  assert.equal(allowedForRole('quality_governance', 'web/rulelink_public_next/deploy/release.json'), false);
});

test('일반 기능 브랜치가 출판 정본이나 생산 대기열을 건드리면 실패한다', () => {
  assert.equal(validatePublicationScope('codex/concept-graph-web', [
    'web/rulelink_public_next/app/ko/concepts/page.tsx',
  ]).ok, true);
  const result = validatePublicationScope('codex/concept-graph-web', [
    'web/rulelink_public_next/app/ko/concepts/page.tsx',
    '.github/workflows/public-web-checks.yml',
    'artifacts/publication/production-queue.json',
    'artifacts/publication/current/bundle.json',
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.invalid, [
    '.github/workflows/public-web-checks.yml',
    'artifacts/publication/production-queue.json',
    'artifacts/publication/current/bundle.json',
  ]);
});
