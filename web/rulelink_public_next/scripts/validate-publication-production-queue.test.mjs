import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';

import {
  OWNER_ROLE_CONTRACTS,
  appendQueueItemRegistrations,
  compareQueueCurrentPublication,
  deriveCurrentPublication,
  inspectMigrationCommit,
  inspectQueueItemRegistryHistory,
  loadQueuePublicationEvidence,
  synchronizeCurrentPublicationFile,
  synchronizeQueueItemRegistryFile,
  topicReceipt,
  updateQueueCurrentPublication,
  validateProductionQueue as validateProductionQueueRaw,
  validateQueueItemRegistry,
} from './validate-publication-production-queue.mjs';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const queuePath = path.join(repoRoot, 'artifacts', 'publication', 'production-queue.json');
const registryPath = path.join(repoRoot, 'artifacts', 'publication', 'production-queue-registry.json');
const bundlePath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'public-web-checks.yml');
const [queue, registry, bundle, workflow] = await Promise.all([
  readFile(queuePath, 'utf8').then(JSON.parse),
  readFile(registryPath, 'utf8').then(JSON.parse),
  readFile(bundlePath, 'utf8').then(JSON.parse),
  readFile(workflowPath, 'utf8'),
]);
const publicationEvidence = await loadQueuePublicationEvidence(queue, bundle, {itemRegistry: registry});
const testMigrationCommitSha = 'a'.repeat(40);
const execFileAsync = promisify(execFile);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function refreshSummary(value) {
  const openStatuses = new Set(['pr_open', 'ready_for_integration', 'needs_rework', 'migration_required', 'blocked']);
  value.audit_summary.open_content_prs = value.items.filter(item => openStatuses.has(item.status)).length;
  for (const status of ['ready_for_integration', 'needs_rework', 'migration_required', 'blocked', 'integrated', 'merged_pending_publication', 'superseded', 'withdrawn']) {
    value.audit_summary[status] = value.items.filter(item => item.status === status).length;
  }
  value.audit_summary.official_source_references_checked =
    value.items.reduce((sum, item) => sum + (item.counts?.sources || 0), 0);
  value.audit_summary.semantic_overlap_decisions =
    value.items.reduce((sum, item) => sum + (item.overlap_decisions?.length || 0), 0);
  return value;
}

function validateProductionQueue(value, options = {}) {
  return validateProductionQueueRaw(value, {itemRegistry: registry, ...options});
}

function migrationEvidence(value, overrides = {}) {
  const item = value.items.find(entry => entry.pr_number === 166);
  return {
    exists: true,
    is_ancestor: true,
    is_head: false,
    shallow: false,
    changed_files: [
      item.topic_file,
      'artifacts/publication/current/bundle.json',
      'artifacts/publication/topics/manifest.json',
      `artifacts/publication/snapshots/${item.integrated_snapshot_id}/bundle.json`,
    ],
    evidence_changed_files: [
      'artifacts/publication/production-queue.json',
      'artifacts/publication/production-queue-registry.json',
    ],
    evidence_merge_commits: [],
    evidence_commit_count: 1,
    ...overrides,
  };
}

function completedPublicationEvidence(value, overrides = {}) {
  const item = value.items.find(entry => entry.pr_number === 166);
  return {
    ...publicationEvidence,
    migrationCommits: new Map([[item.migration_commit_sha, migrationEvidence(value, overrides)]]),
  };
}

function completeExistingRevision(status = 'integrated', integrationMode = 'exact') {
  const value = clone(queue);
  const item = value.items.find(entry => entry.pr_number === 166);
  item.status = status;
  item.integration_order = null;
  item.integrated_snapshot_id = bundle.snapshot_id;
  item.migration_commit_sha = testMigrationCommitSha;
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
  for (const status of ['ready_for_integration', 'needs_rework', 'migration_required', 'blocked', 'integrated', 'superseded', 'withdrawn']) {
    assert.equal(queue.audit_summary[status], queue.items.filter(item => item.status === status).length);
  }
});

test('append-only item registry는 모든 queue_id·PR을 영수증 체인으로 보존한다', () => {
  assert.deepEqual(validateQueueItemRegistry(registry, queue), []);
  assert.equal(registry.append_only, true);
  assert.equal(registry.registrations.length, queue.items.length);
  assert.equal(registry.registrations.at(-1).receipt, registry.registry_receipt);

  const deletedQueue = clone(queue);
  deletedQueue.items = deletedQueue.items.filter(item => item.pr_number !== 166);
  refreshSummary(deletedQueue);
  assert.ok(
    validateProductionQueueRaw(deletedQueue, {itemRegistry: registry})
      .some(error => error.includes('등록된 queue item을 삭제할 수 없습니다')),
  );

  const truncatedRegistry = clone(registry);
  const removed = truncatedRegistry.registrations.pop();
  truncatedRegistry.registry_receipt = removed.previous_receipt;
  assert.ok(
    validateQueueItemRegistry(truncatedRegistry, queue)
      .some(error => error.includes('append-only registry에 등록되지 않았습니다')),
  );
  assert.ok(
    validateQueueItemRegistry(truncatedRegistry, queue, {previousRegistry: registry})
      .some(error => error.includes('직전 불변 이력을 삭제할 수 없습니다')),
  );

  const rewrittenRegistry = clone(registry);
  rewrittenRegistry.registrations[0].registered_on = '2026-07-22';
  assert.ok(
    validateQueueItemRegistry(rewrittenRegistry, queue, {previousRegistry: registry})
      .some(error => error.includes('직전 불변 등록을 바꿀 수 없습니다')),
  );
});

test('registry 동기화는 기존 이력을 바꾸거나 지우지 않고 새 항목만 뒤에 추가한다', () => {
  const value = clone(queue);
  const newItem = clone(value.items.find(item => item.pr_number === 169));
  newItem.queue_id = 'publication-pr-999';
  newItem.pr_number = 999;
  newItem.topic_id = 'hub.registry-append-fixture';
  newItem.topic_file = 'artifacts/publication/topics/registry-append-fixture.json';
  value.items.push(newItem);
  const updated = appendQueueItemRegistrations(registry, value);
  assert.deepEqual(updated.registrations.slice(0, registry.registrations.length), registry.registrations);
  assert.equal(updated.registrations.at(-1).queue_id, 'publication-pr-999');
  assert.equal(updated.registrations.at(-1).previous_receipt, registry.registry_receipt);
  assert.deepEqual(validateQueueItemRegistry(updated, value), []);
});

test('registry Git 이력 조회는 첫 도입만 명시 허용하고 rev-list·show 실패를 hard fail한다', async () => {
  const introductionCommit = '1'.repeat(40);
  const firstIntroduction = await inspectQueueItemRegistryHistory(registry, {
    runGit: async args => {
      if (args[0] === 'rev-list') return {stdout: `${introductionCommit}\n`};
      if (args[0] === 'rev-parse') return {stdout: `${introductionCommit}\n`};
      if (args[0] === 'show') return {stdout: JSON.stringify(registry)};
      throw new Error(`unexpected git command: ${args.join(' ')}`);
    },
  });
  assert.deepEqual(firstIntroduction, {previous_registry: null, first_introduction: true});

  await assert.rejects(
    () => inspectQueueItemRegistryHistory(registry, {
      runGit: async () => {
        throw new Error('rev-list unavailable');
      },
    }),
    /Git 이력 조회에 실패/u,
  );

  await assert.rejects(
    () => inspectQueueItemRegistryHistory(registry, {
      runGit: async args => {
        if (args[0] === 'rev-list') return {stdout: `${introductionCommit}\n`};
        if (args[0] === 'rev-parse') return {stdout: `${introductionCommit}\n`};
        if (args[0] === 'show') throw new Error('show unavailable');
        throw new Error(`unexpected git command: ${args.join(' ')}`);
      },
    }),
    /Git 이력 본문을 읽지 못했습니다/u,
  );
});

test('registry 이력은 unrelated HEAD를 건너뛰고 실제 직전 다른 blob으로 과거 row rewrite를 잡는다', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rulelink-registry-history-'));
  const git = args => execFileAsync('git', args, {cwd: directory, encoding: 'utf8'});
  const registryFile = 'artifacts/publication/production-queue-registry.json';
  const writeRepoFile = async (filePath, contents) => {
    const absolutePath = path.join(directory, filePath);
    await mkdir(path.dirname(absolutePath), {recursive: true});
    await writeFile(absolutePath, contents, 'utf8');
  };
  const augmentedQueue = clone(queue);
  const newItem = clone(augmentedQueue.items.find(item => item.pr_number === 171));
  newItem.queue_id = 'publication-pr-997';
  newItem.pr_number = 997;
  newItem.topic_id = 'hub.registry-history-fixture';
  newItem.topic_file = 'artifacts/publication/topics/registry-history-fixture.json';
  augmentedQueue.items.push(newItem);
  const appendedRegistry = appendQueueItemRegistrations(registry, augmentedQueue);
  const rewrittenRegistry = clone(appendedRegistry);
  rewrittenRegistry.registrations[0].registered_on = '2099-01-01';

  try {
    await git(['init']);
    await git(['config', 'user.name', 'RuleLink Test']);
    await git(['config', 'user.email', 'rulelink-test@example.com']);
    await writeRepoFile('README.md', 'baseline\n');
    await git(['add', 'README.md']);
    await git(['commit', '-m', 'baseline']);

    await writeRepoFile(registryFile, `${JSON.stringify(registry, null, 2)}\n`);
    await git(['add', '--', registryFile]);
    await git(['commit', '-m', 'registry introduction']);
    await writeRepoFile('README.md', 'unrelated after introduction\n');
    await git(['add', 'README.md']);
    await git(['commit', '-m', 'unrelated head']);
    const introductionHistory = await inspectQueueItemRegistryHistory(registry, {runGit: git});
    assert.deepEqual(introductionHistory, {previous_registry: null, first_introduction: true});

    await writeRepoFile(registryFile, `${JSON.stringify(appendedRegistry, null, 2)}\n`);
    await git(['add', '--', registryFile]);
    await git(['commit', '-m', 'append registry item']);
    await writeRepoFile('README.md', 'unrelated after append\n');
    await git(['add', 'README.md']);
    await git(['commit', '-m', 'another unrelated head']);
    const appendedHistory = await inspectQueueItemRegistryHistory(appendedRegistry, {runGit: git});
    assert.deepEqual(appendedHistory, {previous_registry: registry, first_introduction: false});

    await writeRepoFile(registryFile, `${JSON.stringify(rewrittenRegistry, null, 2)}\n`);
    await git(['add', '--', registryFile]);
    await git(['commit', '-m', 'rewrite past registry row']);
    await writeRepoFile('README.md', 'unrelated after rewrite\n');
    await git(['add', 'README.md']);
    await git(['commit', '-m', 'unrelated after rewrite']);
    const rewrittenHistory = await inspectQueueItemRegistryHistory(rewrittenRegistry, {runGit: git});
    assert.deepEqual(rewrittenHistory, {previous_registry: appendedRegistry, first_introduction: false});
    assert.ok(
      validateQueueItemRegistry(rewrittenRegistry, augmentedQueue, {previousRegistry: rewrittenHistory.previous_registry})
        .some(error => error.includes('직전 불변 등록을 바꿀 수 없습니다')),
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
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
  assert.equal(
    queue.policy.existing_topic_migration_commit_protocol,
    'data_commit_then_queue_evidence_commit_merge_without_squash',
  );
  assert.deepEqual(Object.keys(OWNER_ROLE_CONTRACTS).sort(), [
    'content_production', 'migrate_publication', 'orchestration', 'product_policy',
    'quality_governance', 'reader_research', 'release', 'runtime_design', 'source_maintenance',
  ]);
  assert.ok(OWNER_ROLE_CONTRACTS.runtime_design.owned_paths.includes('web/rulelink_public_next/scripts/*knowledge*.test.mjs'));
  assert.ok(OWNER_ROLE_CONTRACTS.content_production.owned_paths.includes('web/rulelink_public_next/scripts/<topic>-topic-*.test.mjs'));
  assert.ok(OWNER_ROLE_CONTRACTS.migrate_publication.owned_paths.includes('web/rulelink_public_next/scripts/*topic*.test.mjs'));
  assert.ok(OWNER_ROLE_CONTRACTS.migrate_publication.owned_paths.includes('artifacts/publication/production-queue.json'));
  assert.ok(OWNER_ROLE_CONTRACTS.migrate_publication.owned_paths.includes('artifacts/publication/production-queue-registry.json'));
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

  const pendingClaim = clone(queue);
  const pending = pendingClaim.items.find(item => item.pr_number === 153);
  const competing = pendingClaim.items.find(item => item.pr_number === 169);
  competing.topic_id = pending.topic_id;
  competing.topic_file = pending.topic_file;
  assert.ok(validateProductionQueue(pendingClaim).some(error => error.includes('활성 topic_id 중복')));
  assert.ok(validateProductionQueue(pendingClaim).some(error => error.includes('활성 topic_file 중복')));
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
  value.items.find(item => item.pr_number === 174).depends_on_prs = [87];
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

test('item registry 파일 동기화도 검증 뒤 원자적으로 append한다', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rulelink-queue-registry-sync-'));
  const target = path.join(directory, 'production-queue-registry.json');
  try {
    await writeFile(target, JSON.stringify(registry, null, 2) + '\n', 'utf8');
    const value = clone(queue);
    const newItem = clone(value.items.find(item => item.pr_number === 171));
    newItem.queue_id = 'publication-pr-998';
    newItem.pr_number = 998;
    newItem.topic_id = 'hub.registry-file-fixture';
    newItem.topic_file = 'artifacts/publication/topics/registry-file-fixture.json';
    value.items.push(newItem);
    const updated = await synchronizeQueueItemRegistryFile(target, value);
    assert.equal(updated.registrations.at(-1).queue_id, 'publication-pr-998');
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), updated);

    const invalid = clone(registry);
    invalid.registrations[0].topic_id = 'hub.tampered';
    const original = JSON.stringify(invalid, null, 4) + '\n';
    await writeFile(target, original, 'utf8');
    await assert.rejects(() => synchronizeQueueItemRegistryFile(target, queue), /registry 갱신 실패/u);
    assert.equal(await readFile(target, 'utf8'), original);
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

test('#169와 #171도 기존 정본 직접 병합 없이 같은 publication migration 게이트를 사용한다', () => {
  const expected = [
    {
      pr: 169,
      head: 'c8167f563975f6ba26f1df6697443fa67016bb39',
      topic: 'hub.consumer-online-contracts',
      testFile: 'web/rulelink_public_next/scripts/consumer-online-contracts-topic-handoff.test.mjs',
    },
    {
      pr: 171,
      head: '0d100fcd315de4d99e9fe80e51b56312e0402f53',
      topic: 'hub.remedy-path-comparisons',
      testFile: 'web/rulelink_public_next/scripts/remedy-path-comparisons-topic-handoff.test.mjs',
    },
  ];
  for (const fixture of expected) {
    const item = queue.items.find(entry => entry.pr_number === fixture.pr);
    assert.ok(item);
    assert.equal(item.status, 'migration_required');
    assert.equal(item.change_mode, 'existing_topic_revision');
    assert.equal(item.direct_merge, false);
    assert.equal(item.head_sha, fixture.head);
    assert.equal(item.topic_id, fixture.topic);
    assert.equal(item.test_file, fixture.testFile);
    assert.deepEqual(item.integrate_requires, ['current_bundle', 'new_immutable_snapshot', 'migrate_publication']);
  }
  assert.deepEqual(queue.items.find(entry => entry.pr_number === 169).platform_prerequisite_prs, [168]);
});

test('#105 정체성을 보존한 종료 이력과 #174 신규 대체 항목을 양방향·append-only로 고정한다', () => {
  const original = queue.items.find(entry => entry.pr_number === 105);
  const replacement = queue.items.find(entry => entry.pr_number === 174);
  assert.ok(original);
  assert.ok(replacement);
  assert.deepEqual(
    {
      queue_id: original.queue_id,
      pr_number: original.pr_number,
      change_mode: original.change_mode,
      topic_id: original.topic_id,
      topic_file: original.topic_file,
    },
    {
      queue_id: 'publication-pr-105',
      pr_number: 105,
      change_mode: 'new_topic',
      topic_id: 'hub.domestic-violence-stalking',
      topic_file: 'artifacts/publication/topics/domestic-violence-stalking.json',
    },
  );
  assert.equal(original.status, 'superseded');
  assert.equal(original.integration_order, null);
  assert.match(original.terminal_reason_ko, /미출판.*#174.*대체/u);
  assert.deepEqual(original.superseded_by, {
    pr_number: 174,
    head_sha: 'b8644f515388315143b6dbe1fdbdf742a6454c6e',
  });

  assert.equal(replacement.queue_id, 'publication-pr-174');
  assert.equal(replacement.status, 'ready_for_integration');
  assert.equal(replacement.change_mode, 'new_topic');
  assert.equal(replacement.head_sha, 'b8644f515388315143b6dbe1fdbdf742a6454c6e');
  assert.equal(replacement.topic_id, original.topic_id);
  assert.equal(replacement.topic_file, original.topic_file);
  assert.equal(replacement.test_file, 'web/rulelink_public_next/scripts/domestic-violence-stalking-topic-handoff.test.mjs');
  assert.deepEqual(replacement.supersedes_prs, [105]);
  assert.deepEqual(replacement.source_freshness.timeline_missing_source_ids, [
    'law_014392_ko_0006',
    'law_014392_ko_0009',
    'law_014392_ko_0013',
  ]);
  assert.equal(replacement.source_freshness.follow_up_owner_role, 'source_maintenance');
  assert.match(replacement.integration_checks.join(' '), /023 publication migration/u);

  const registration = registry.registrations.at(-1);
  assert.equal(registration.sequence, 24);
  assert.equal(registration.queue_id, 'publication-pr-174');
  assert.equal(registration.previous_receipt, registry.registrations.at(-2).receipt);
  assert.equal(registration.receipt, registry.registry_receipt);

  const missingReason = clone(queue);
  delete missingReason.items.find(entry => entry.pr_number === 105).terminal_reason_ko;
  assert.ok(validateProductionQueue(missingReason).some(error => error.includes('대체 종료 이력에 필요합니다')));

  const wrongHead = clone(queue);
  wrongHead.items.find(entry => entry.pr_number === 105).superseded_by.head_sha = 'a'.repeat(40);
  assert.ok(validateProductionQueue(wrongHead).some(error => error.includes('감사 head와 일치해야 합니다')));

  const missingReverse = clone(queue);
  delete missingReverse.items.find(entry => entry.pr_number === 174).supersedes_prs;
  assert.ok(validateProductionQueue(missingReverse).some(error => error.includes('양방향으로 기록되지 않았습니다')));
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
      validateProductionQueue(value, {publishedBundle: bundle, ...completedPublicationEvidence(value)}),
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
    {publishedBundle: bundle, ...completedPublicationEvidence(wrongReceipt)},
  ).some(error => error.includes('topic_receipt가 현재 주제 원본과 다릅니다')));
});

test('migration_commit_sha는 현재 이력의 선행 데이터 커밋이며 이관 소유 파일을 실제 변경해야 한다', () => {
  const value = completeExistingRevision();
  assert.deepEqual(validateProductionQueue(
    value,
    {publishedBundle: bundle, ...completedPublicationEvidence(value)},
  ), []);

  assert.ok(validateProductionQueue(
    value,
    {publishedBundle: bundle, ...publicationEvidence, migrationCommits: null},
  ).some(error => error.includes('실제 Git 증거가 필요합니다')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {exists: false, shallow: true}),
    },
  ).some(error => error.includes('fetch-depth: 0')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {is_ancestor: false}),
    },
  ).some(error => error.includes('현재 HEAD 이력에 없습니다')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {is_head: true}),
    },
  ).some(error => error.includes('후속 커밋보다 앞선 데이터 이관 커밋')));

  const missingTopic = migrationEvidence(value);
  missingTopic.changed_files = missingTopic.changed_files.filter(file => file !== value.items.find(item => item.pr_number === 166).topic_file);
  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {changed_files: missingTopic.changed_files}),
    },
  ).some(error => error.includes('필수 이관 파일을 변경하지 않았습니다')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {
        changed_files: [...migrationEvidence(value).changed_files, 'artifacts/publication/release.json'],
      }),
    },
  ).some(error => error.includes('migrate_publication 소유 밖 파일')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {
        changed_files: [...migrationEvidence(value).changed_files, 'artifacts/publication/production-queue.json'],
      }),
    },
  ).some(error => error.includes('queue 증거 후속 커밋과 분리')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {evidence_changed_files: []}),
    },
  ).some(error => error.includes('production-queue.json을 변경해야 합니다')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {evidence_commit_count: 2}),
    },
  ).some(error => error.includes('정확히 1개의 queue 증거 커밋만 허용됩니다')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {evidence_merge_commits: ['c'.repeat(40)]}),
    },
  ).some(error => error.includes('queue 증거 구간에는 merge 커밋을 둘 수 없습니다')));

  const forbiddenEvidenceFiles = [
    value.items.find(item => item.pr_number === 166).topic_file,
    'artifacts/publication/current/bundle.json',
    'artifacts/publication/topics/manifest.json',
    `artifacts/publication/snapshots/${bundle.snapshot_id}/bundle.json`,
    'docs/CONTENT_HANDOFF_CONTRACT_KO.md',
  ];
  for (const forbiddenFile of forbiddenEvidenceFiles) {
    assert.ok(validateProductionQueue(
      value,
      {
        publishedBundle: bundle,
        ...completedPublicationEvidence(value, {
          evidence_changed_files: [
            'artifacts/publication/production-queue.json',
            'artifacts/publication/production-queue-registry.json',
            forbiddenFile,
          ],
        }),
      },
    ).some(error => error.includes(`queue 증거 구간에서 허용되지 않은 파일을 다시 변경했습니다: ${forbiddenFile}`)));
  }

  assert.match(workflow, /uses:\s*actions\/checkout@v4[\s\S]*?fetch-depth:\s*0/u);
  assert.equal(
    workflow.match(/artifacts\/publication\/production-queue-registry\.json/gu)?.length,
    2,
    'registry-only 변경도 pull_request와 main push 검증 workflow를 실행해야 합니다.',
  );
});

test('실제 Git의 데이터 커밋→queue 증거 커밋만 통과하고 이후 topic 재변경은 차단한다', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rulelink-migration-evidence-'));
  const value = completeExistingRevision();
  const item = value.items.find(entry => entry.pr_number === 166);
  const git = args => execFileAsync('git', args, {cwd: directory, encoding: 'utf8'});
  const writeRepoFile = async (filePath, contents) => {
    const absolutePath = path.join(directory, filePath);
    await mkdir(path.dirname(absolutePath), {recursive: true});
    await writeFile(absolutePath, contents, 'utf8');
  };
  try {
    await git(['init']);
    await git(['config', 'user.name', 'RuleLink Test']);
    await git(['config', 'user.email', 'rulelink-test@example.com']);
    await writeRepoFile('README.md', 'fixture\n');
    await git(['add', 'README.md']);
    await git(['commit', '-m', 'fixture baseline']);

    const snapshotFile = `artifacts/publication/snapshots/${bundle.snapshot_id}/bundle.json`;
    await writeRepoFile(item.topic_file, '{"revision":1}\n');
    await writeRepoFile('artifacts/publication/current/bundle.json', '{"revision":1}\n');
    await writeRepoFile('artifacts/publication/topics/manifest.json', '{"revision":1}\n');
    await writeRepoFile(snapshotFile, '{"revision":1}\n');
    await git(['add', '--', item.topic_file, 'artifacts/publication/current/bundle.json', 'artifacts/publication/topics/manifest.json', snapshotFile]);
    await git(['commit', '-m', 'data migration']);
    const dataCommit = String((await git(['rev-parse', 'HEAD'])).stdout).trim();
    item.migration_commit_sha = dataCommit;

    await writeRepoFile('artifacts/publication/production-queue.json', '{"evidence":1}\n');
    await writeRepoFile('artifacts/publication/production-queue-registry.json', '{"evidence":1}\n');
    await git(['add', '--', 'artifacts/publication/production-queue.json', 'artifacts/publication/production-queue-registry.json']);
    await git(['commit', '-m', 'queue evidence']);

    const validEvidence = await inspectMigrationCommit(dataCommit, {runGit: git});
    assert.equal(validEvidence.exists, true);
    assert.equal(validEvidence.is_ancestor, true);
    assert.equal(validEvidence.is_head, false);
    assert.deepEqual(new Set(validEvidence.evidence_changed_files), new Set([
      'artifacts/publication/production-queue.json',
      'artifacts/publication/production-queue-registry.json',
    ]));
    assert.deepEqual(validateProductionQueue(
      value,
      {publishedBundle: bundle, ...completedPublicationEvidence(value, validEvidence)},
    ), []);

    const evidenceBranch = String((await git(['branch', '--show-current'])).stdout).trim();
    await git(['checkout', '-b', 'merge-forbidden-fixture', dataCommit]);
    await writeRepoFile('docs/merge-only-forbidden.md', 'forbidden\n');
    await git(['add', '--', 'docs/merge-only-forbidden.md']);
    await git(['commit', '-m', 'forbidden side commit']);
    await git(['checkout', evidenceBranch]);
    await git(['merge', '--no-ff', 'merge-forbidden-fixture', '-m', 'forbidden evidence merge']);
    const mergeEvidence = await inspectMigrationCommit(dataCommit, {runGit: git});
    assert.ok(mergeEvidence.evidence_merge_commits.length > 0);
    const mergeErrors = validateProductionQueue(
      value,
      {publishedBundle: bundle, ...completedPublicationEvidence(value, mergeEvidence)},
    );
    assert.ok(mergeErrors.some(error => error.includes('queue 증거 구간에는 merge 커밋을 둘 수 없습니다')));
    assert.ok(mergeErrors.some(error => error.includes('docs/merge-only-forbidden.md')));

    await writeRepoFile(item.topic_file, '{"revision":2}\n');
    await git(['add', '--', item.topic_file]);
    await git(['commit', '-m', 'forbidden topic rewrite']);
    const bypassEvidence = await inspectMigrationCommit(dataCommit, {runGit: git});
    assert.ok(validateProductionQueue(
      value,
      {publishedBundle: bundle, ...completedPublicationEvidence(value, bypassEvidence)},
    ).some(error => error.includes(`queue 증거 구간에서 허용되지 않은 파일을 다시 변경했습니다: ${item.topic_file}`)));

    await writeRepoFile(item.topic_file, '{"revision":1}\n');
    await git(['add', '--', item.topic_file]);
    await git(['commit', '-m', 'attempted topic rewrite rollback']);
    const revertedBypassEvidence = await inspectMigrationCommit(dataCommit, {runGit: git});
    assert.ok(
      revertedBypassEvidence.evidence_changed_files.includes(item.topic_file),
      '최종 내용이 데이터 커밋과 같아도 증거 구간에서 topic을 건드린 이력을 보존해야 합니다.',
    );
    assert.ok(validateProductionQueue(
      value,
      {publishedBundle: bundle, ...completedPublicationEvidence(value, revertedBypassEvidence)},
    ).some(error => error.includes(`queue 증거 구간에서 허용되지 않은 파일을 다시 변경했습니다: ${item.topic_file}`)));
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('기존 주제 개정의 integrated 증거는 current와 immutable snapshot의 동일 합성을 요구한다', () => {
  const value = completeExistingRevision();
  const wrongSnapshotId = completeExistingRevision();
  wrongSnapshotId.items.find(entry => entry.pr_number === 166).integrated_snapshot_id = 'kr-knowledge-core-20260723-023';
  assert.ok(validateProductionQueue(
    wrongSnapshotId,
    {publishedBundle: bundle, ...completedPublicationEvidence(wrongSnapshotId)},
  ).some(error => error.includes('integrated_snapshot_id가 current bundle과 다릅니다')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      topicReceipts: publicationEvidence.topicReceipts,
      migrationCommits: completedPublicationEvidence(value).migrationCommits,
    },
  ).some(error => error.includes('immutable snapshot 증거가 필요합니다')));

  const differentSnapshot = clone(bundle);
  differentSnapshot.built_at = '2099-01-01T00:00:00Z';
  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      publishedSnapshot: differentSnapshot,
      topicReceipts: publicationEvidence.topicReceipts,
      migrationCommits: completedPublicationEvidence(value).migrationCommits,
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
