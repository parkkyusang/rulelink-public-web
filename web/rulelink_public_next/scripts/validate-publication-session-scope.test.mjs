import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allowedForRole,
  inferPublicationRole,
  validatePublicationScope,
} from './validate-publication-session-scope.mjs';

test('브랜치 접두사로 주제·통합·이관·배포·생산계약 역할을 구분한다', () => {
  assert.equal(inferPublicationRole('codex/content-law-change-topic-20260721'), 'topic');
  assert.equal(inferPublicationRole('codex/integrate-publication-021'), 'integrator');
  assert.equal(inferPublicationRole('codex/migrate-publication-021'), 'migration');
  assert.equal(inferPublicationRole('codex/release-021'), 'release');
  assert.equal(inferPublicationRole('codex/govern-publication-production-control-20260723'), 'governance');
  assert.equal(inferPublicationRole('codex/concept-graph-web'), null);
});

test('주제 생산자는 독립 주제·개념 조각과 전용 시험만 수정한다', () => {
  assert.equal(allowedForRole('topic', 'artifacts/publication/topics/inheritance.json'), true);
  assert.equal(allowedForRole('topic', 'artifacts/publication/concepts/inheritance.json'), true);
  assert.equal(allowedForRole('topic', 'web/rulelink_public_next/scripts/law-change-topic-handoff.test.mjs'), true);
  assert.equal(allowedForRole('topic', 'artifacts/publication/production-queue.json'), false);
  assert.equal(allowedForRole('topic', 'artifacts/publication/topics/manifest.json'), false);
  assert.equal(allowedForRole('topic', 'artifacts/publication/current/bundle.json'), false);
});

test('통합자와 배포자는 공유 파일을 서로 침범하지 않는다', () => {
  const integration = validatePublicationScope('codex/integrate-publication-021', [
    'README.md',
    'artifacts/publication/production-queue.json',
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
    'docs/CONTENT_HANDOFF_CONTRACT_KO.md',
    'artifacts/publication/production-queue.json',
    'web/rulelink_public_next/package.json',
    'web/rulelink_public_next/scripts/validate-publication-session-scope.mjs',
    'web/rulelink_public_next/scripts/validate-publication-session-scope.test.mjs',
    'web/rulelink_public_next/scripts/validate-publication-production-queue.mjs',
    'web/rulelink_public_next/scripts/validate-publication-production-queue.test.mjs',
  ]);
  assert.equal(result.ok, true);
  assert.equal(allowedForRole('governance', 'artifacts/publication/current/bundle.json'), false);
  assert.equal(allowedForRole('governance', 'web/rulelink_public_next/app/ko/page.tsx'), false);
});

test('일반 기능 브랜치가 출판 정본이나 생산 대기열을 건드리면 실패한다', () => {
  assert.equal(validatePublicationScope('codex/concept-graph-web', [
    'web/rulelink_public_next/app/ko/concepts/page.tsx',
  ]).ok, true);
  const result = validatePublicationScope('codex/concept-graph-web', [
    'web/rulelink_public_next/app/ko/concepts/page.tsx',
    'artifacts/publication/production-queue.json',
    'artifacts/publication/current/bundle.json',
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.invalid, [
    'artifacts/publication/production-queue.json',
    'artifacts/publication/current/bundle.json',
  ]);
});
