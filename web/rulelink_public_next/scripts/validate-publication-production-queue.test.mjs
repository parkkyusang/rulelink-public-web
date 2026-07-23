import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  OWNER_ROLE_CONTRACTS,
  compareQueueCurrentPublication,
  deriveCurrentPublication,
  loadQueuePublicationEvidence,
  synchronizeCurrentPublicationFile,
  topicReceipt,
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
const publicationEvidence = await loadQueuePublicationEvidence(queue, bundle);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function refreshSummary(value) {
  const openStatuses = new Set(['pr_open', 'ready_for_integration', 'needs_rework', 'migration_required', 'blocked']);
  value.audit_summary.open_content_prs = value.items.filter(item => openStatuses.has(item.status)).length;
  for (const status of ['ready_for_integration', 'needs_rework', 'migration_required', 'blocked', 'integrated', 'merged_pending_publication']) {
    value.audit_summary[status] = value.items.filter(item => item.status === status).length;
  }
  return value;
}

function completeExistingRevision(status = 'integrated', integrationMode = 'exact') {
  const value = clone(queue);
  const item = value.items.find(entry => entry.pr_number === 166);
  item.status = status;
  item.integration_order = null;
  item.integrated_snapshot_id = bundle.snapshot_id;
  item.migration_commit_sha = 'a'.repeat(40);
  item.absorbed_head_sha = item.head_sha;
  item.topic_receipt = publicationEvidence.topicReceipts.get(item.topic_file);
  item.integration_mode = integrationMode;
  return refreshSummary(value);
}

test('현재 생산 대기열은 022 공개 정본·역할·의존성 계약을 만족한다', () => {
  assert.deepEqual(validateProductionQueue(queue, {publishedBundle: bundle, ...publicationEvidence}), []);
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
  assert.equal(queue.audit_summary.open_content_prs, queue.items.filter(item => ['pr_open', 'ready_for_integration', 'needs_rework', 'migration_required', 'blocked'].includes(item.status)).length);
  for (const status of ['ready_for_integration', 'needs_rework', 'migration_required', 'blocked', 'integrated']) {
    assert.equal(queue.audit_summary[status], queue.items.filter(item => item.status === status).length);
  }
});

test('학교폭력 #153은 main 병합 후 공개 승격 대기 상태로 고정한다', () => {
  assert.equal(queue.items.some(item => item.pr_number === 103), false);
  const item = queue.items.find(value => value.pr_number === 153);
  assert.ok(item);
  assert.equal(item.status, 'merged_pending_publication');
  assert.equal(item.head_sha, 'f78d4002ef9e223156dc92425c8d047bb82a5604');
  assert.deepEqual(item.supersedes_prs, [103]);
  assert.equal(item.source_freshness.status, 'current');
  assert.equal(item.integration_order, null);
  assert.deepEqual(item.integrate_requires, ['current_bundle', 'new_immutable_snapshot', 'migrate_publication']);
  const publishedHubIds = new Set((bundle.knowledge?.topic_hubs || bundle.topic_hubs).map(hub => hub.hub_id));
  assert.equal(publishedHubIds.has('hub.school-violence'), false);
});

test('역할 정본은 허용 역할과 실제 runtime 지식 시험 경계를 고정한다', () => {
  assert.deepEqual(queue.policy.owner_role_contracts, OWNER_ROLE_CONTRACTS);
  assert.deepEqual(Object.keys(OWNER_ROLE_CONTRACTS).sort(), [
    'content_production', 'migrate_publication', 'orchestration', 'product_policy',
    'quality_governance', 'reader_research', 'release', 'runtime_design', 'source_maintenance',
  ]);
  assert.ok(OWNER_ROLE_CONTRACTS.runtime_design.owned_paths.includes('web/rulelink_public_next/scripts/*knowledge*.test.mjs'));
  assert.ok(OWNER_ROLE_CONTRACTS.content_production.owned_paths.includes('web/rulelink_public_next/scripts/<topic>-topic-*.test.mjs'));
  assert.equal(queue.items.find(item => item.pr_number === 166).test_file, 'web/rulelink_public_next/scripts/money-guarantee-topic-backfill.test.mjs');
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

  const tooBroad = clone(queue);
  tooBroad.items.find(item => item.pr_number === 166).test_file = 'web/rulelink_public_next/scripts/arbitrary.test.mjs';
  assert.ok(validateProductionQueue(tooBroad).some(error => error.includes('전용 topic/handoff 시험')));

  const revision = clone(queue);
  revision.items.find(item => item.pr_number === 85).status = 'ready_for_integration';
  revision.items.find(item => item.pr_number === 85).integration_order = 1;
  assert.ok(validateProductionQueue(revision).some(error => error.includes('topic-only 공개 승격 상태')));
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



test('integrated는 current 존재를, merged_pending_publication은 current 부재를 요구한다', () => {
  const missingIntegrated = clone(queue);
  missingIntegrated.items.find(item => item.pr_number === 142).topic_id = 'hub.not-published';
  assert.ok(validateProductionQueue(missingIntegrated, {publishedBundle: bundle}).some(error => error.includes('integrated 주제가 current bundle에 없습니다')));

  const prematurePublished = clone(bundle);
  const hubs = prematurePublished.knowledge?.topic_hubs || prematurePublished.topic_hubs;
  hubs.push({hub_id: 'hub.school-violence'});
  assert.ok(validateProductionQueue(queue, {publishedBundle: prematurePublished}).some(error => error.includes('integrated로 전환해야 합니다')));
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

test('기존 주제 개정은 migration_required에서 integrated 또는 superseded로 이력을 보존한다', () => {
  for (const [status, integrationMode] of [['integrated', 'exact'], ['superseded', 'absorbed']]) {
    const value = completeExistingRevision(status, integrationMode);
    const item = value.items.find(entry => entry.pr_number === 166);
    assert.equal(value.items.some(entry => entry.pr_number === 166), true);
    assert.equal(item.integrated_snapshot_id, bundle.snapshot_id);
    assert.equal(item.absorbed_head_sha, item.head_sha);
    assert.equal(item.topic_receipt, publicationEvidence.topicReceipts.get(item.topic_file));
    assert.deepEqual(
      validateProductionQueue(value, {publishedBundle: bundle, ...publicationEvidence}),
      [],
      status,
    );
  }
});

test('기존 주제 개정 lifecycle은 개발·감사·완료 상태를 허용하되 topic-only 승격 상태를 금지한다', () => {
  for (const status of ['planned', 'claimed', 'in_progress', 'pr_open', 'needs_rework', 'blocked', 'migration_required']) {
    const value = clone(queue);
    const item = value.items.find(entry => entry.pr_number === 166);
    item.status = status;
    if (['needs_rework', 'blocked'].includes(status)) item.blocking_reason_ko = '회귀시험용 차단 사유';
    refreshSummary(value);
    assert.equal(
      validateProductionQueue(value).some(error => error.includes('기존 주제 개정에는 허용되지 않은 lifecycle 상태')),
      false,
      status,
    );
  }

  for (const status of ['ready_for_integration', 'merged_pending_publication']) {
    const value = clone(queue);
    const item = value.items.find(entry => entry.pr_number === 166);
    item.status = status;
    if (status === 'ready_for_integration') item.integration_order = 1;
    refreshSummary(value);
    assert.ok(validateProductionQueue(value).some(error => error.includes('topic-only 공개 승격 상태')), status);
  }

  const withdrawn = clone(queue);
  const item = withdrawn.items.find(entry => entry.pr_number === 166);
  item.status = 'withdrawn';
  item.terminal_reason_ko = '생산자가 개정을 철회했습니다.';
  refreshSummary(withdrawn);
  assert.deepEqual(validateProductionQueue(withdrawn), []);
});

test('기존 주제 개정 terminal 상태는 출판 snapshot·migration·PR head·topic receipt 증거를 모두 요구한다', () => {
  assert.equal(topicReceipt({b: 2, a: 1}), topicReceipt({a: 1, b: 2}));
  assert.notEqual(topicReceipt({a: 1}), topicReceipt({a: 2}));

  const requiredFields = [
    'integrated_snapshot_id',
    'migration_commit_sha',
    'absorbed_head_sha',
    'topic_receipt',
    'integration_mode',
  ];
  for (const field of requiredFields) {
    const value = completeExistingRevision();
    delete value.items.find(entry => entry.pr_number === 166)[field];
    assert.ok(validateProductionQueue(value).some(error => error.includes(`${field}는 기존 주제 개정의 완료 이력에 필요합니다`)), field);
  }

  const wrongHead = completeExistingRevision();
  wrongHead.items.find(entry => entry.pr_number === 166).absorbed_head_sha = 'b'.repeat(40);
  assert.ok(validateProductionQueue(wrongHead).some(error => error.includes('absorbed_head_sha는 감사한 PR head_sha와 같아야 합니다')));

  const wrongMode = completeExistingRevision();
  wrongMode.items.find(entry => entry.pr_number === 166).integration_mode = 'topic_only';
  assert.ok(validateProductionQueue(wrongMode).some(error => error.includes('integration_mode는 exact 또는 absorbed')));

  const wrongReceipt = completeExistingRevision();
  wrongReceipt.items.find(entry => entry.pr_number === 166).topic_receipt = 'b'.repeat(64);
  assert.ok(validateProductionQueue(
    wrongReceipt,
    {publishedBundle: bundle, ...publicationEvidence},
  ).some(error => error.includes('topic_receipt가 현재 주제 원본과 다릅니다')));
});

test('기존 주제 개정의 integrated 증거는 current와 immutable snapshot의 동일 합성을 요구한다', () => {
  const value = completeExistingRevision();
  const wrongSnapshotId = completeExistingRevision();
  wrongSnapshotId.items.find(entry => entry.pr_number === 166).integrated_snapshot_id = 'kr-knowledge-core-20260723-023';
  assert.ok(validateProductionQueue(
    wrongSnapshotId,
    {publishedBundle: bundle, ...publicationEvidence},
  ).some(error => error.includes('integrated_snapshot_id가 current bundle과 다릅니다')));

  assert.ok(validateProductionQueue(
    value,
    {publishedBundle: bundle, topicReceipts: publicationEvidence.topicReceipts},
  ).some(error => error.includes('immutable snapshot 증거가 필요합니다')));

  const differentSnapshot = clone(bundle);
  differentSnapshot.built_at = '2099-01-01T00:00:00Z';
  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      publishedSnapshot: differentSnapshot,
      topicReceipts: publicationEvidence.topicReceipts,
    },
  ).some(error => error.includes('immutable snapshot과 current bundle의 합성 결과가 다릅니다')));
});

test('withdrawn 기존 주제 개정은 철회 사유를 보존하고 출판 완료 증거를 사칭하지 않는다', () => {
  const missingReason = clone(queue);
  missingReason.items.find(entry => entry.pr_number === 166).status = 'withdrawn';
  refreshSummary(missingReason);
  assert.ok(validateProductionQueue(missingReason).some(error => error.includes('terminal_reason_ko는 철회 이력에 필요합니다')));

  const forged = clone(queue);
  const item = forged.items.find(entry => entry.pr_number === 166);
  item.status = 'withdrawn';
  item.terminal_reason_ko = '철회';
  item.integrated_snapshot_id = bundle.snapshot_id;
  refreshSummary(forged);
  assert.ok(validateProductionQueue(forged).some(error => error.includes('출판되지 않은 withdrawn 이력에 사용할 수 없습니다')));
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
