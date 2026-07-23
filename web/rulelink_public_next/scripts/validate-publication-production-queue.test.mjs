import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  OWNER_ROLE_CONTRACTS,
  compareQueueCurrentPublication,
  deriveCurrentPublication,
  synchronizeCurrentPublicationFile,
  updateQueueCurrentPublication,
  validateProductionQueue,
} from './validate-publication-production-queue.mjs';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const queuePath = path.join(repoRoot, 'artifacts', 'publication', 'production-queue.json');
const bundlePath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const [queue, bundle] = await Promise.all([
  readFile(queuePath, 'utf8').then(JSON.parse),
  readFile(bundlePath, 'utf8').then(JSON.parse),
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('현재 생산 대기열은 022 공개 정본·역할·의존성 계약을 만족한다', () => {
  assert.deepEqual(validateProductionQueue(queue, {publishedBundle: bundle}), []);
  assert.deepEqual(compareQueueCurrentPublication(queue, bundle), []);
  assert.deepEqual(deriveCurrentPublication(bundle), {
    snapshot_id: 'kr-knowledge-core-20260723-022',
    topic_hubs: 26,
    content_entries: 264,
    rule_cards: 258,
    scenario_branches: 227,
    sources: 389,
  });
  assert.equal(queue.current_publication.live_parity, 'verified');
  assert.equal(queue.audit_summary.open_content_prs, queue.items.filter(item => !['integrated', 'superseded', 'withdrawn'].includes(item.status)).length);
  for (const status of ['ready_for_integration', 'needs_rework', 'migration_required', 'blocked', 'integrated']) {
    assert.equal(queue.audit_summary[status], queue.items.filter(item => item.status === status).length);
  }
});

test('학교폭력 구본 #103은 병합된 #153 정본으로 교체한다', () => {
  assert.equal(queue.items.some(item => item.pr_number === 103), false);
  const item = queue.items.find(value => value.pr_number === 153);
  assert.ok(item);
  assert.equal(item.status, 'integrated');
  assert.equal(item.head_sha, 'f78d4002ef9e223156dc92425c8d047bb82a5604');
  assert.deepEqual(item.supersedes_prs, [103]);
  assert.equal(item.source_freshness.status, 'current');
  assert.equal(item.integration_order, null);
});

test('역할 정본은 허용 역할과 실제 runtime 지식 시험 경계를 고정한다', () => {
  assert.deepEqual(queue.policy.owner_role_contracts, OWNER_ROLE_CONTRACTS);
  assert.deepEqual(Object.keys(OWNER_ROLE_CONTRACTS).sort(), [
    'content_production', 'migrate_publication', 'orchestration', 'product_policy',
    'quality_governance', 'reader_research', 'release', 'runtime_design', 'source_maintenance',
  ]);
  assert.ok(OWNER_ROLE_CONTRACTS.runtime_design.owned_paths.includes('web/rulelink_public_next/scripts/*knowledge*.test.mjs'));
  const invalid = clone(queue);
  invalid.items[0].owner_role = 'unknown_role';
  assert.ok(validateProductionQueue(invalid).some(error => error.includes('owner_role')));
});

test('역할별 WIP 1과 같은 topic_file의 활성 중복 소유를 차단한다', () => {
  const wip = clone(queue);
  wip.items.find(item => item.pr_number === 87).status = 'in_progress';
  wip.items.find(item => item.pr_number === 105).status = 'in_progress';
  assert.ok(validateProductionQueue(wip).some(error => error.includes('동시 진행 항목 2개')));

  const duplicate = clone(queue);
  duplicate.items.find(item => item.pr_number === 87).topic_file =
    duplicate.items.find(item => item.pr_number === 105).topic_file;
  assert.ok(validateProductionQueue(duplicate).some(error => error.includes('활성 topic_file 중복')));
});

test('handoff 필수 필드와 기존 주제의 migration_required 상태를 강제한다', () => {
  const missing = clone(queue);
  delete missing.items.find(item => item.pr_number === 105).test_file;
  assert.ok(validateProductionQueue(missing).some(error => error.includes('test_file')));

  const revision = clone(queue);
  revision.items.find(item => item.pr_number === 85).status = 'ready_for_integration';
  revision.items.find(item => item.pr_number === 85).integration_order = 1;
  assert.ok(validateProductionQueue(revision).some(error => error.includes('migration_required 상태만')));
});

test('ready와 integrated 항목은 통합되지 않은 의존 PR을 남길 수 없다', () => {
  const value = clone(queue);
  value.items.find(item => item.pr_number === 105).depends_on_prs = [87];
  assert.ok(validateProductionQueue(value).some(error => error.includes('통합되지 않은 의존 PR #87')));
});

test('상태·열린 PR·근거·의미중복 요약이 items 실측과 다르면 실패한다', () => {
  for (const field of ['open_content_prs', 'official_source_references_checked', 'semantic_overlap_decisions', 'integrated']) {
    const value = clone(queue);
    value.audit_summary[field] += 1;
    assert.ok(validateProductionQueue(value).some(error => error.includes(field)), field);
  }
});

test('공개 표지 갱신은 live_parity를 보존하고 입력 객체를 변경하지 않는다', () => {
  const input = clone(queue);
  input.current_publication.snapshot_id = 'stale';
  const before = clone(input);
  const updated = updateQueueCurrentPublication(input, bundle);
  assert.deepEqual(input, before);
  assert.equal(updated.current_publication.snapshot_id, 'kr-knowledge-core-20260723-022');
  assert.equal(updated.current_publication.live_parity, 'verified');
});

test('원자적 동기화는 전체 검증 성공 뒤에만 파일을 교체한다', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rulelink-queue-sync-'));
  const target = path.join(directory, 'production-queue.json');
  try {
    const stale = clone(queue);
    stale.current_publication.snapshot_id = 'stale';
    await writeFile(target, JSON.stringify(stale, null, 2) + '\n', 'utf8');
    const result = await synchronizeCurrentPublicationFile(target, bundle);
    assert.equal(result.current_publication.snapshot_id, 'kr-knowledge-core-20260723-022');
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), result);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('검증 실패 시 --write 대상 원본 바이트는 변하지 않는다', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rulelink-queue-fail-'));
  const target = path.join(directory, 'production-queue.json');
  try {
    const invalid = clone(queue);
    invalid.current_publication.snapshot_id = 'stale';
    invalid.audit_summary.integrated += 1;
    const original = JSON.stringify(invalid, null, 4) + '\n';
    await writeFile(target, original, 'utf8');
    await assert.rejects(() => synchronizeCurrentPublicationFile(target, bundle), /audit_summary\.integrated/u);
    assert.equal(await readFile(target, 'utf8'), original);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});


test('기존 정본 백필 #166은 직접 병합이 아닌 publication migration으로만 등록한다', () => {
  const item = queue.items.find(value => value.pr_number === 166);
  assert.ok(item);
  assert.equal(item.status, 'migration_required');
  assert.equal(item.owner_role, 'content_production');
  assert.equal(item.change_mode, 'existing_topic_revision');
  assert.equal(item.direct_merge, false);
  assert.deepEqual(item.integrate_requires, ['current_bundle', 'new_immutable_snapshot', 'migrate_publication']);
  assert.equal(item.head_sha, '237bff8a1a8c58ad3961f215236bc3f3df0d3197');

  const invalid = clone(queue);
  invalid.items.find(value => value.pr_number === 166).direct_merge = true;
  assert.ok(validateProductionQueue(invalid).some(error => error.includes('direct_merge=false')));
});

test('변호사 작업공간 제품 게이트는 이번 구현이 아닌 후속 품질 backlog로만 고정한다', () => {
  const item = queue.quality_backlog.find(value => value.backlog_id === 'quality.attorney-workspace-product-gate-v1');
  assert.ok(item);
  assert.equal(item.status, 'planned');
  assert.equal(item.owner_role, 'quality_governance');
  assert.equal(item.typed_cta_requirements.length, 8);
  assert.equal(item.deployment_smoke.length, 10);
  assert.equal(item.forbidden_phrases.length, 4);
  assert.match(item.legacy_policy_ko, /57건.*typed 승인/u);
  assert.match(item.public_private_boundary_ko, /공개.*200.*비공개 origin과 API/u);
  assert.equal(item.migration_plan.work_name, 'attorney-workspace-typed-migration');
  assert.equal(item.migration_plan.status, 'migration_required');
  assert.deepEqual(item.migration_plan.first_pass, {
    keep_typed: 31,
    needs_scenario_hidden: 21,
    remove_cta: 5,
    action_ko: 'keep 31은 typed 필드를 이관하고 needs 21과 remove 5는 legacy lawyer_workspace_entry를 제거해 CTA를 숨긴다.',
  });
  assert.equal(item.migration_plan.hard_fail_checks.length, 3);
  assert.deepEqual(item.migration_plan.dependent_topic_backfills, [{
    pr_number: 166,
    topic_id: 'hub.money-guarantee',
    typed_cta_candidate_count: 4,
    depends_on: 'attorney-workspace-typed-migration',
  }]);
});
