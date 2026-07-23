import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {readFile, rename, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const defaultQueuePath = path.join(repoRoot, 'artifacts', 'publication', 'production-queue.json');
const defaultQueueRegistryPath = path.join(repoRoot, 'artifacts', 'publication', 'production-queue-registry.json');
const defaultPublishedBundlePath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const execFileAsync = promisify(execFile);

const statuses = new Set([
  'planned',
  'claimed',
  'in_progress',
  'pr_open',
  'ready_for_integration',
  'migration_required',
  'needs_rework',
  'blocked',
  'integrated',
  'merged_pending_publication',
  'superseded',
  'withdrawn',
]);
const modes = new Set(['new_topic', 'existing_topic_revision']);
const activeWipStatuses = new Set(['claimed', 'in_progress', 'pr_open']);
const terminalStatuses = new Set(['integrated', 'merged_pending_publication', 'superseded', 'withdrawn']);
const releasedClaimStatuses = new Set(['integrated', 'superseded', 'withdrawn']);
const openPrStatuses = new Set(['pr_open', 'ready_for_integration', 'needs_rework', 'migration_required', 'blocked']);
const existingTopicRevisionStatuses = new Set([
  'planned',
  'claimed',
  'in_progress',
  'pr_open',
  'needs_rework',
  'blocked',
  'migration_required',
  'integrated',
  'superseded',
  'withdrawn',
]);
const existingTopicPublishedStatuses = new Set(['integrated', 'superseded']);
const integrationModes = new Set(['exact', 'absorbed']);
const freshnessStatuses = new Set([
  'current',
  'rebind_before_integration',
  'rework_required',
  'external_provenance_required',
  'existing_topic_revision',
]);
const overlapRelationships = new Set([
  'distinct',
  'merge_required',
  'split_required',
  'supersedes',
  'superseded_by',
]);
const queueRegistrySchema = 'rulelink_publication_queue_item_registry_v1';
const queueRegistryVersion = 1;


export const OWNER_ROLE_CONTRACTS = {
  orchestration: {assignment: 'coordination_only', owned_paths: ['artifacts/publication/production-queue.json', 'artifacts/publication/production-queue-registry.json'], forbidden_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**']},
  reader_research: {assignment: 'read_only', owned_paths: [], forbidden_paths: ['**/*']},
  quality_governance: {assignment: 'governance_contracts', owned_paths: ['artifacts/publication/production-queue.json', 'artifacts/publication/production-queue-registry.json', 'web/rulelink_public_next/scripts/*publication*.mjs', 'web/rulelink_public_next/scripts/*publication*.test.mjs'], forbidden_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**', 'artifacts/publication/release.json']},
  runtime_design: {assignment: 'runtime_design', owned_paths: ['web/rulelink_public_next/src/**', 'web/rulelink_public_next/scripts/*runtime*.test.mjs', 'web/rulelink_public_next/scripts/*knowledge*.test.mjs'], forbidden_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**']},
  content_production: {assignment: 'topic_handoff', owned_paths: ['artifacts/publication/topics/<topic>.json', 'web/rulelink_public_next/scripts/<topic>-topic-*.test.mjs'], forbidden_paths: ['artifacts/publication/current/**', 'artifacts/publication/snapshots/**', 'artifacts/publication/manifest.json', 'artifacts/publication/release.json']},
  migrate_publication: {assignment: 'publication_migration', owned_paths: ['artifacts/publication/topics/*.json', 'web/rulelink_public_next/scripts/*topic*.test.mjs', 'web/rulelink_public_next/scripts/*handoff*.test.mjs', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**', 'artifacts/publication/topics/manifest.json', 'artifacts/publication/production-queue.json', 'artifacts/publication/production-queue-registry.json'], forbidden_paths: ['artifacts/publication/release.json']},
  release: {assignment: 'release', owned_paths: ['artifacts/publication/release.json', 'web/rulelink_public_next/publication.json'], forbidden_paths: ['artifacts/publication/topics/*.json']},
  source_maintenance: {assignment: 'external_repository', owned_paths: [], forbidden_paths: ['**/*']},
  product_policy: {assignment: 'read_only', owned_paths: [], forbidden_paths: ['**/*']},
};

function canonicalJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(item => JSON.parse(canonicalJson(item))));
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonicalJson(value[key]))])));
}

export function topicReceipt(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function queueRegistryGenesisReceipt() {
  return topicReceipt({schema: queueRegistrySchema, registry_version: queueRegistryVersion});
}

function queueItemIdentity(item) {
  return {
    queue_id: item.queue_id,
    pr_number: item.pr_number,
    change_mode: item.change_mode,
    topic_id: item.topic_id,
    topic_file: item.topic_file,
  };
}

function queueRegistrationReceipt(registration) {
  const {receipt: _receipt, ...payload} = registration;
  return topicReceipt(payload);
}

function emptyQueueItemRegistry() {
  return {
    schema: queueRegistrySchema,
    registry_version: queueRegistryVersion,
    append_only: true,
    registrations: [],
    registry_receipt: queueRegistryGenesisReceipt(),
  };
}

export function validateQueueItemRegistry(
  registry,
  queue,
  {allowUnregisteredQueueItems = false, previousRegistry = null} = {},
) {
  const errors = [];
  if (!registry || typeof registry !== 'object') return ['production queue item registry가 필요합니다.'];
  if (registry.schema !== queueRegistrySchema) errors.push('지원하지 않는 production queue item registry 스키마입니다.');
  if (registry.registry_version !== queueRegistryVersion) errors.push('production queue item registry 버전이 올바르지 않습니다.');
  if (registry.append_only !== true) errors.push('production queue item registry는 append_only=true여야 합니다.');
  if (!Array.isArray(registry.registrations)) return [...errors, 'production queue item registry의 registrations 배열이 필요합니다.'];

  const queueById = new Map((queue?.items || []).map(item => [item?.queue_id, item]));
  const queueByPr = new Map((queue?.items || []).map(item => [item?.pr_number, item]));
  const registeredIds = new Set();
  const registeredPrs = new Set();
  let previousReceipt = queueRegistryGenesisReceipt();

  for (const [index, registration] of registry.registrations.entries()) {
    const label = `registrations[${index}]`;
    if (!registration || typeof registration !== 'object') {
      errors.push(`${label}는 객체여야 합니다.`);
      continue;
    }
    if (registration.sequence !== index + 1) errors.push(`${label}.sequence는 중간 삭제 없는 연속 번호여야 합니다.`);
    if (registration.previous_receipt !== previousReceipt) errors.push(`${label}.previous_receipt가 직전 append-only 영수증과 다릅니다.`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(registration.registered_on || '')) errors.push(`${label}.registered_on은 YYYY-MM-DD 형식이어야 합니다.`);
    if (!nonEmpty(registration.queue_id)) errors.push(`${label}.queue_id가 필요합니다.`);
    else if (registeredIds.has(registration.queue_id)) errors.push(`item registry의 queue_id가 중복됩니다: ${registration.queue_id}`);
    else registeredIds.add(registration.queue_id);
    if (!isPositiveInteger(registration.pr_number)) errors.push(`${label}.pr_number는 양의 정수여야 합니다.`);
    else if (registeredPrs.has(registration.pr_number)) errors.push(`item registry의 PR 번호가 중복됩니다: #${registration.pr_number}`);
    else registeredPrs.add(registration.pr_number);
    if (!modes.has(registration.change_mode)) errors.push(`${label}.change_mode가 올바르지 않습니다.`);
    if (!nonEmpty(registration.topic_id)) errors.push(`${label}.topic_id가 필요합니다.`);
    if (!nonEmpty(registration.topic_file)) errors.push(`${label}.topic_file이 필요합니다.`);
    const expectedReceipt = queueRegistrationReceipt(registration);
    if (registration.receipt !== expectedReceipt) errors.push(`${label}.receipt가 등록 내용과 다릅니다.`);
    previousReceipt = registration.receipt;

    const currentById = queueById.get(registration.queue_id);
    const currentByPr = queueByPr.get(registration.pr_number);
    if (!currentById || !currentByPr || currentById !== currentByPr) {
      errors.push(`등록된 queue item을 삭제할 수 없습니다: ${registration.queue_id} / #${registration.pr_number}`);
      continue;
    }
    const expectedIdentity = queueItemIdentity(currentById);
    for (const field of ['queue_id', 'pr_number', 'change_mode', 'topic_id', 'topic_file']) {
      if (registration[field] !== expectedIdentity[field]) {
        errors.push(`등록된 queue item의 ${field}를 바꿀 수 없습니다: ${registration.queue_id}`);
      }
    }
  }

  if (registry.registry_receipt !== previousReceipt) {
    errors.push('production queue item registry의 최종 영수증이 append-only 체인과 다릅니다.');
  }
  if (previousRegistry) {
    if (!Array.isArray(previousRegistry.registrations)) {
      errors.push('직전 item registry의 registrations 이력을 읽을 수 없습니다.');
    } else if (registry.registrations.length < previousRegistry.registrations.length) {
      errors.push('production queue item registry의 직전 불변 이력을 삭제할 수 없습니다.');
    } else {
      for (const [index, previousRegistration] of previousRegistry.registrations.entries()) {
        if (canonicalJson(registry.registrations[index]) !== canonicalJson(previousRegistration)) {
          errors.push(`production queue item registry의 직전 불변 등록을 바꿀 수 없습니다: sequence ${index + 1}`);
        }
      }
    }
  }
  if (!allowUnregisteredQueueItems) {
    for (const item of queue?.items || []) {
      if (!registeredIds.has(item.queue_id) || !registeredPrs.has(item.pr_number)) {
        errors.push(`queue item이 append-only registry에 등록되지 않았습니다: ${item.queue_id} / #${item.pr_number}`);
      }
    }
  }
  return errors;
}

export function appendQueueItemRegistrations(registry, queue, {previousRegistry = null} = {}) {
  const next = registry ? JSON.parse(JSON.stringify(registry)) : emptyQueueItemRegistry();
  const errors = validateQueueItemRegistry(next, queue, {
    allowUnregisteredQueueItems: true,
    previousRegistry,
  });
  if (errors.length) throw new Error(`production queue item registry 갱신 실패: ${errors.join(' | ')}`);
  const registeredIds = new Set(next.registrations.map(item => item.queue_id));
  let previousReceipt = next.registry_receipt;
  for (const item of queue.items) {
    if (registeredIds.has(item.queue_id)) continue;
    const registration = {
      sequence: next.registrations.length + 1,
      ...queueItemIdentity(item),
      registered_on: queue.audited_on,
      previous_receipt: previousReceipt,
    };
    registration.receipt = queueRegistrationReceipt(registration);
    next.registrations.push(registration);
    registeredIds.add(item.queue_id);
    previousReceipt = registration.receipt;
  }
  next.registry_receipt = previousReceipt;
  const finalErrors = validateQueueItemRegistry(next, queue, {previousRegistry});
  if (finalErrors.length) throw new Error(`production queue item registry 갱신 실패: ${finalErrors.join(' | ')}`);
  return next;
}

export async function synchronizeQueueItemRegistryFile(registryPath, queue, io = {}) {
  const read = io.readFile || readFile;
  const write = io.writeFile || writeFile;
  const move = io.rename || rename;
  const remove = io.unlink || unlink;
  let registry = null;
  try {
    registry = JSON.parse(await read(registryPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const previousRegistry = io.previousRegistry
    || (await inspectQueueItemRegistryHistory(registry, io)).previous_registry;
  const updatedRegistry = appendQueueItemRegistrations(registry, queue, {previousRegistry});
  const tempPath = `${registryPath}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await write(tempPath, `${JSON.stringify(updatedRegistry, null, 2)}\n`, 'utf8');
    await move(tempPath, registryPath);
  } catch (error) {
    await remove(tempPath).catch(() => {});
    throw error;
  }
  return updatedRegistry;
}

function isMigrationOwnedPath(filePath) {
  const value = String(filePath || '').replaceAll('\\', '/');
  return value === 'artifacts/publication/production-queue.json'
    || value === 'artifacts/publication/production-queue-registry.json'
    || value === 'artifacts/publication/topics/manifest.json'
    || /^artifacts\/publication\/topics\/[a-z0-9-]+\.json$/u.test(value)
    || /^web\/rulelink_public_next\/scripts\/[a-z0-9-]*(?:topic|handoff)[a-z0-9-]*\.test\.mjs$/u.test(value)
    || /^artifacts\/publication\/current\//u.test(value)
    || /^artifacts\/publication\/snapshots\/[a-z0-9._-]+\//u.test(value);
}

async function runGitCommand(args, io = {}) {
  const runGit = io.runGit || (async values => execFileAsync(
    'git',
    ['-c', `safe.directory=${repoRoot.replaceAll('\\', '/')}`, ...values],
    {cwd: repoRoot, encoding: 'utf8'},
  ));
  return runGit(args);
}

export async function inspectQueueItemRegistryHistory(currentRegistry, io = {}) {
  let commits = [];
  try {
    const result = await runGitCommand([
      'rev-list',
      'HEAD',
      '--',
      'artifacts/publication/production-queue-registry.json',
    ], io);
    commits = String(result.stdout || '').split(/\r?\n/u).filter(Boolean);
  } catch (error) {
    throw new Error('append-only registry의 Git 이력 조회에 실패했습니다.', {cause: error});
  }
  if (commits.length === 0) {
    if (currentRegistry === null) return {previous_registry: null, first_introduction: true};
    throw new Error('현재 registry가 존재하지만 Git 이력에서 최초 도입 커밋을 확인할 수 없습니다.');
  }
  for (const commit of commits) {
    let candidate;
    try {
      const result = await runGitCommand([
        'show',
        `${commit}:artifacts/publication/production-queue-registry.json`,
      ], io);
      candidate = JSON.parse(String(result.stdout || ''));
    } catch (error) {
      throw new Error(`append-only registry의 Git 이력 본문을 읽지 못했습니다: ${commit}`, {cause: error});
    }
    if (canonicalJson(candidate) !== canonicalJson(currentRegistry)) {
      return {previous_registry: candidate, first_introduction: false};
    }
  }
  return {previous_registry: null, first_introduction: true};
}

export async function inspectMigrationCommit(commitSha, io = {}) {
  let shallow = false;
  try {
    const result = await runGitCommand(['rev-parse', '--is-shallow-repository'], io);
    shallow = String(result.stdout || '').trim() === 'true';
  } catch {
    // Git 2.15 미만 호환: 아래 실제 객체 검증 결과를 사용한다.
  }
  try {
    await runGitCommand(['cat-file', '-e', `${commitSha}^{commit}`], io);
  } catch {
    return {exists: false, is_ancestor: false, is_head: false, shallow, changed_files: []};
  }
  let isAncestor = true;
  try {
    await runGitCommand(['merge-base', '--is-ancestor', commitSha, 'HEAD'], io);
  } catch {
    isAncestor = false;
  }
  const [
    headResult,
    changedResult,
    evidenceChangedResult,
    evidenceMergeResult,
    evidenceCommitCountResult,
  ] = await Promise.all([
    runGitCommand(['rev-parse', 'HEAD'], io),
    runGitCommand(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', commitSha], io),
    runGitCommand(['log', '--format=', '--name-only', `${commitSha}..HEAD`], io),
    runGitCommand(['rev-list', '--merges', `${commitSha}..HEAD`], io),
    runGitCommand(['rev-list', '--count', `${commitSha}..HEAD`], io),
  ]);
  return {
    exists: true,
    is_ancestor: isAncestor,
    is_head: String(headResult.stdout || '').trim() === commitSha,
    shallow,
    changed_files: String(changedResult.stdout || '').split(/\r?\n/u).filter(Boolean),
    evidence_changed_files: String(evidenceChangedResult.stdout || '').split(/\r?\n/u).filter(Boolean),
    evidence_merge_commits: String(evidenceMergeResult.stdout || '').split(/\r?\n/u).filter(Boolean),
    evidence_commit_count: Number.parseInt(String(evidenceCommitCountResult.stdout || '').trim(), 10),
  };
}

export async function loadQueuePublicationEvidence(queue, bundle, io = {}) {
  const read = io.readFile || readFile;
  const snapshotId = bundle?.snapshot_id;
  if (!nonEmpty(snapshotId)) throw new Error('current bundle의 snapshot_id가 필요합니다.');
  const snapshotPath = path.join(repoRoot, 'artifacts', 'publication', 'snapshots', snapshotId, 'bundle.json');
  const publishedSnapshot = JSON.parse(await read(snapshotPath, 'utf8'));
  const topicReceipts = new Map();
  const existingRevisionTopicFiles = queue.items
    .filter(item => item?.change_mode === 'existing_topic_revision')
    .map(item => item?.topic_file)
    .filter(nonEmpty);
  for (const topicFile of new Set(existingRevisionTopicFiles)) {
    const topic = JSON.parse(await read(path.join(repoRoot, topicFile), 'utf8'));
    topicReceipts.set(topicFile, topicReceipt(topic));
  }
  const migrationCommits = new Map();
  const migrationCommitShas = queue.items
    .filter(item => item?.change_mode === 'existing_topic_revision' && existingTopicPublishedStatuses.has(item?.status))
    .map(item => item?.migration_commit_sha)
    .filter(nonEmpty);
  for (const commitSha of new Set(migrationCommitShas)) {
    migrationCommits.set(commitSha, await inspectMigrationCommit(commitSha, io));
  }
  const registryPath = io.queueRegistryPath || defaultQueueRegistryPath;
  const itemRegistry = io.itemRegistry || JSON.parse(await read(registryPath, 'utf8'));
  const registryHistory = await inspectQueueItemRegistryHistory(itemRegistry, io);
  return {
    publishedSnapshot,
    topicReceipts,
    migrationCommits,
    itemRegistry,
    previousItemRegistry: registryHistory.previous_registry,
  };
}

function publicationArray(bundle, key) {
  const knowledge = bundle?.knowledge && typeof bundle.knowledge === 'object' ? bundle.knowledge : bundle;
  const value = knowledge?.[key] ?? bundle?.[key];
  if (!Array.isArray(value)) throw new Error(`current bundle의 ${key} 배열을 찾을 수 없습니다.`);
  return value;
}

export function deriveCurrentPublication(bundle) {
  if (!nonEmpty(bundle?.snapshot_id)) throw new Error('current bundle의 snapshot_id가 필요합니다.');
  return {
    snapshot_id: bundle.snapshot_id,
    topic_hubs: publicationArray(bundle, 'topic_hubs').length,
    content_entries: publicationArray(bundle, 'content_entries').length,
    rule_cards: publicationArray(bundle, 'rule_cards').length,
    scenario_branches: publicationArray(bundle, 'scenario_branches').length,
    sources: publicationArray(bundle, 'sources').length,
  };
}

export function updateQueueCurrentPublication(queue, bundle) {
  return {...queue, current_publication: {...(queue.current_publication || {}), ...deriveCurrentPublication(bundle)}};
}

export function compareQueueCurrentPublication(queue, bundle) {
  let expected;
  try { expected = deriveCurrentPublication(bundle); } catch (error) { return [error instanceof Error ? error.message : String(error)]; }
  const actual = queue?.current_publication || {};
  return Object.entries(expected).filter(([key, value]) => actual[key] !== value)
    .map(([key, value]) => `current_publication.${key}가 current bundle과 다릅니다: expected=${value}, actual=${String(actual[key])}`);
}

export async function synchronizeCurrentPublicationFile(queuePath, publishedBundle, io = {}) {
  const read = io.readFile || readFile;
  const write = io.writeFile || writeFile;
  const move = io.rename || rename;
  const remove = io.unlink || unlink;
  const loadedQueue = JSON.parse(await read(queuePath, 'utf8'));
  const updatedQueue = updateQueueCurrentPublication(loadedQueue, publishedBundle);
  const evidence = await loadQueuePublicationEvidence(updatedQueue, publishedBundle, {
    readFile: read,
    itemRegistry: io.itemRegistry,
    queueRegistryPath: io.queueRegistryPath,
    runGit: io.runGit,
  });
  const errors = validateProductionQueue(updatedQueue, {publishedBundle, ...evidence});
  if (errors.length) throw new Error(`공개 콘텐츠 생산 대기열 검증 실패: ${errors.join(' | ')}`);
  const tempPath = `${queuePath}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await write(tempPath, `${JSON.stringify(updatedQueue, null, 2)}\n`, 'utf8');
    await move(tempPath, queuePath);
  } catch (error) {
    await remove(tempPath).catch(() => {});
    throw error;
  }
  return updatedQueue;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateProductionQueue(
  queue,
  {
    publishedBundle = null,
    publishedSnapshot = null,
    topicReceipts = null,
    migrationCommits = null,
    itemRegistry = null,
    previousItemRegistry = null,
  } = {},
) {
  const errors = [];
  if (!queue || typeof queue !== 'object') return ['대기열은 JSON 객체여야 합니다.'];
  if (queue.schema !== 'rulelink_publication_production_queue_v1') {
    errors.push('지원하지 않는 생산 대기열 스키마입니다.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(queue.audited_on || '')) {
    errors.push('audited_on은 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (!Array.isArray(queue.items)) {
    errors.push('items 배열이 필요합니다.');
    return errors;
  }
  errors.push(...validateQueueItemRegistry(itemRegistry, queue, {previousRegistry: previousItemRegistry}));

  if (canonicalJson(queue.policy?.owner_role_contracts) !== canonicalJson(OWNER_ROLE_CONTRACTS)) {
    errors.push('policy.owner_role_contracts가 표준 역할별 소유·금지 파일 경계와 다릅니다.');
  }
  if (queue.policy?.existing_topic_migration_commit_protocol
    !== 'data_commit_then_queue_evidence_commit_merge_without_squash') {
    errors.push('기존 주제 이관은 데이터 커밋 뒤 queue 증거 커밋을 만들고 squash 없이 이력을 보존해야 합니다.');
  }
  if (publishedBundle) errors.push(...compareQueueCurrentPublication(queue, publishedBundle));
  if (!Array.isArray(queue.quality_backlog)) {
    errors.push('quality_backlog 배열이 필요합니다.');
  } else {
    const backlogIds = new Set();
    for (const [index, backlog] of queue.quality_backlog.entries()) {
      const label = `quality_backlog[${index}]`;
      if (!nonEmpty(backlog?.backlog_id)) errors.push(`${label}.backlog_id가 필요합니다.`);
      else if (backlogIds.has(backlog.backlog_id)) errors.push(`중복 quality backlog 식별자: ${backlog.backlog_id}`);
      else backlogIds.add(backlog.backlog_id);
      if (!Object.hasOwn(OWNER_ROLE_CONTRACTS, backlog?.owner_role)) errors.push(`${label}.owner_role이 올바르지 않습니다.`);
      if (!['planned', 'in_progress', 'complete'].includes(backlog?.status)) errors.push(`${label}.status가 올바르지 않습니다.`);
      if (!nonEmpty(backlog?.scope)) errors.push(`${label}.scope가 필요합니다.`);
      for (const field of ['typed_cta_requirements', 'deployment_smoke', 'forbidden_phrases', 'revenue_separation_checks']) {
        if (!Array.isArray(backlog?.[field]) || backlog[field].length === 0 || backlog[field].some(value => !nonEmpty(value))) errors.push(`${label}.${field}에는 하나 이상의 수락 기준이 필요합니다.`);
      }
      for (const field of ['legacy_policy_ko', 'public_private_boundary_ko']) if (!nonEmpty(backlog?.[field])) errors.push(`${label}.${field}가 필요합니다.`);
      if (backlog?.migration_plan !== undefined) {
        const plan = backlog.migration_plan;
        if (!nonEmpty(plan?.work_name) || plan.status !== 'migration_required') errors.push(`${label}.migration_plan의 작업명과 상태가 올바르지 않습니다.`);
        if (!Array.isArray(plan?.depends_on) || plan.depends_on.length === 0 || plan.depends_on.some(value => !nonEmpty(value))) errors.push(`${label}.migration_plan.depends_on이 필요합니다.`);
        for (const field of ['keep_typed', 'needs_scenario_hidden', 'remove_cta']) if (!Number.isInteger(plan?.first_pass?.[field]) || plan.first_pass[field] < 0) errors.push(`${label}.migration_plan.first_pass.${field}가 올바르지 않습니다.`);
        if (!nonEmpty(plan?.first_pass?.action_ko) || !nonEmpty(plan?.second_pass_ko)) errors.push(`${label}.migration_plan의 이관 행동이 필요합니다.`);
        if (!Array.isArray(plan?.hard_fail_checks) || plan.hard_fail_checks.length === 0 || plan.hard_fail_checks.some(value => !nonEmpty(value))) errors.push(`${label}.migration_plan.hard_fail_checks가 필요합니다.`);
      }
    }
  }

  const byPr = new Map();
  const queueIds = new Set();
  const topicClaims = new Map();
  const fileClaims = new Map();
  const activeWipByOwner = new Map();

  for (const [index, item] of queue.items.entries()) {
    const label = `items[${index}]`;
    if (!item || typeof item !== 'object') {
      errors.push(`${label}는 객체여야 합니다.`);
      continue;
    }
    if (!nonEmpty(item.queue_id)) errors.push(`${label}.queue_id가 필요합니다.`);
    else if (queueIds.has(item.queue_id)) errors.push(`중복 queue_id: ${item.queue_id}`);
    else queueIds.add(item.queue_id);

    if (!isPositiveInteger(item.pr_number)) errors.push(`${label}.pr_number는 양의 정수여야 합니다.`);
    else if (byPr.has(item.pr_number)) errors.push(`중복 PR 번호: #${item.pr_number}`);
    else byPr.set(item.pr_number, item);

    for (const field of ['title_ko', 'branch', 'head_sha', 'owner_role', 'topic_id', 'topic_file', 'test_file']) {
      if (!nonEmpty(item[field])) errors.push(`${label}.${field}가 필요합니다.`);
    }
    if (nonEmpty(item.branch) && !/^codex\/content-[a-z0-9._/-]+$/u.test(item.branch)) {
      errors.push(`${label}.branch는 codex/content-* 형식이어야 합니다.`);
    }
    if (nonEmpty(item.head_sha) && !/^[0-9a-f]{40}$/u.test(item.head_sha)) {
      errors.push(`${label}.head_sha는 40자리 커밋 SHA여야 합니다.`);
    }
    if (nonEmpty(item.topic_file) && !/^artifacts\/publication\/topics\/[a-z0-9-]+\.json$/u.test(item.topic_file)) {
      errors.push(`${label}.topic_file 경로가 올바르지 않습니다.`);
    }
    if (nonEmpty(item.test_file) && !/^web\/rulelink_public_next\/scripts\/[a-z0-9-]+(?:topic|handoff)[a-z0-9-]*\.test\.mjs$/u.test(item.test_file)) {
      errors.push(`${label}.test_file은 전용 topic/handoff 시험이어야 합니다.`);
    }
    if (!modes.has(item.change_mode)) errors.push(`${label}.change_mode가 올바르지 않습니다.`);
    if (!statuses.has(item.status)) errors.push(`${label}.status가 올바르지 않습니다.`);
    if (!Object.hasOwn(OWNER_ROLE_CONTRACTS, item.owner_role)) errors.push(`${label}.owner_role이 올바르지 않습니다.`);
    else if (OWNER_ROLE_CONTRACTS[item.owner_role].assignment !== 'topic_handoff') errors.push(`${label}.owner_role ${item.owner_role}은 콘텐츠 handoff 항목을 소유할 수 없습니다.`);

    if (nonEmpty(item.topic_id) && !releasedClaimStatuses.has(item.status)) {
      const prior = topicClaims.get(item.topic_id);
      if (prior) errors.push(`활성 topic_id 중복: ${item.topic_id} (#${prior}, #${item.pr_number})`);
      else topicClaims.set(item.topic_id, item.pr_number);
    }
    if (nonEmpty(item.topic_file) && !releasedClaimStatuses.has(item.status)) {
      const prior = fileClaims.get(item.topic_file);
      if (prior) errors.push(`활성 topic_file 중복: ${item.topic_file} (#${prior}, #${item.pr_number})`);
      else fileClaims.set(item.topic_file, item.pr_number);
    }

    const counts = item.counts;
    if (!counts || typeof counts !== 'object') errors.push(`${label}.counts가 필요합니다.`);
    else for (const field of ['sources', 'rule_cards', 'scenario_branches', 'content_entries', 'topic_hubs']) {
      if (!isPositiveInteger(counts[field])) errors.push(`${label}.counts.${field}는 양의 정수여야 합니다.`);
    }

    if (!Array.isArray(item.depends_on_prs)) errors.push(`${label}.depends_on_prs 배열이 필요합니다.`);
    else {
      const unique = new Set(item.depends_on_prs);
      if (unique.size !== item.depends_on_prs.length) errors.push(`${label}.depends_on_prs에 중복이 있습니다.`);
      if (unique.has(item.pr_number)) errors.push(`${label}가 자기 PR에 의존합니다.`);
      for (const pr of unique) if (!isPositiveInteger(pr)) errors.push(`${label}.depends_on_prs 값은 양의 정수여야 합니다.`);
    }
    if (item.platform_prerequisite_prs !== undefined) {
      if (!Array.isArray(item.platform_prerequisite_prs)) {
        errors.push(`${label}.platform_prerequisite_prs는 배열이어야 합니다.`);
      } else {
        const unique = new Set(item.platform_prerequisite_prs);
        if (unique.size !== item.platform_prerequisite_prs.length) errors.push(`${label}.platform_prerequisite_prs에 중복이 있습니다.`);
        for (const pr of unique) {
          if (!isPositiveInteger(pr) || pr === item.pr_number) errors.push(`${label}.platform_prerequisite_prs 값이 올바르지 않습니다.`);
        }
      }
    }

    if (item.status === 'ready_for_integration' && !isPositiveInteger(item.integration_order)) {
      errors.push(`${label}의 ready_for_integration 상태에는 integration_order가 필요합니다.`);
    }
    if (['needs_rework', 'blocked'].includes(item.status) && !nonEmpty(item.blocking_reason_ko)) {
      errors.push(`${label}의 ${item.status} 상태에는 blocking_reason_ko가 필요합니다.`);
    }
    if (item.status === 'migration_required' && item.change_mode !== 'existing_topic_revision') {
      errors.push(`${label}의 migration_required는 기존 주제 개정에만 사용할 수 있습니다.`);
    }
    if (item.status === 'migration_required') {
      const required = ['current_bundle', 'new_immutable_snapshot', 'migrate_publication'];
      if (item.direct_merge !== false) errors.push(`${label}의 migration_required는 direct_merge=false여야 합니다.`);
      if (JSON.stringify(item.integrate_requires) !== JSON.stringify(required)) errors.push(`${label}.integrate_requires는 current bundle·새 불변 snapshot·migrate_publication을 요구해야 합니다.`);
    }
    if (item.change_mode === 'existing_topic_revision' && !existingTopicRevisionStatuses.has(item.status)) {
      errors.push(`${label}의 기존 주제 개정에는 허용되지 않은 lifecycle 상태입니다: ${item.status}`);
    }
    if (item.change_mode === 'existing_topic_revision' && ['ready_for_integration', 'merged_pending_publication'].includes(item.status)) {
      errors.push(`${label}의 기존 주제 개정은 topic-only 공개 승격 상태를 사용할 수 없습니다: ${item.status}`);
    }
    if (item.change_mode === 'existing_topic_revision' && existingTopicPublishedStatuses.has(item.status)) {
      for (const field of ['integrated_snapshot_id', 'migration_commit_sha', 'absorbed_head_sha', 'topic_receipt', 'integration_mode']) {
        if (!nonEmpty(item[field])) errors.push(`${label}.${field}는 기존 주제 개정의 완료 이력에 필요합니다.`);
      }
      if (nonEmpty(item.integrated_snapshot_id) && !/^[a-z0-9][a-z0-9._-]*$/u.test(item.integrated_snapshot_id)) {
        errors.push(`${label}.integrated_snapshot_id가 올바르지 않습니다.`);
      }
      for (const field of ['migration_commit_sha', 'absorbed_head_sha']) {
        if (nonEmpty(item[field]) && !/^[0-9a-f]{40}$/u.test(item[field])) errors.push(`${label}.${field}는 40자리 커밋 SHA여야 합니다.`);
      }
      if (nonEmpty(item.absorbed_head_sha) && item.absorbed_head_sha !== item.head_sha) {
        errors.push(`${label}.absorbed_head_sha는 감사한 PR head_sha와 같아야 합니다.`);
      }
      if (nonEmpty(item.topic_receipt) && !/^[0-9a-f]{64}$/u.test(item.topic_receipt)) {
        errors.push(`${label}.topic_receipt는 64자리 SHA-256이어야 합니다.`);
      }
      if (nonEmpty(item.integration_mode) && !integrationModes.has(item.integration_mode)) {
        errors.push(`${label}.integration_mode는 exact 또는 absorbed여야 합니다.`);
      }
      if (!(migrationCommits instanceof Map)) {
        errors.push(`${label}.migration_commit_sha의 실제 Git 증거가 필요합니다.`);
      } else if (nonEmpty(item.migration_commit_sha)) {
        const commitEvidence = migrationCommits.get(item.migration_commit_sha);
        if (!commitEvidence?.exists) {
          const shallowHint = commitEvidence?.shallow ? ' CI checkout은 fetch-depth: 0이어야 합니다.' : '';
          errors.push(`${label}.migration_commit_sha가 실제 Git 커밋으로 존재하지 않습니다.${shallowHint}`);
        } else {
          if (!commitEvidence.is_ancestor) errors.push(`${label}.migration_commit_sha가 현재 HEAD 이력에 없습니다.`);
          if (commitEvidence.is_head) errors.push(`${label}.migration_commit_sha는 queue 증거를 기록하는 후속 커밋보다 앞선 데이터 이관 커밋이어야 합니다.`);
          const changedFiles = new Set(commitEvidence.changed_files || []);
          const requiredFiles = [
            item.topic_file,
            'artifacts/publication/current/bundle.json',
            'artifacts/publication/topics/manifest.json',
            `artifacts/publication/snapshots/${item.integrated_snapshot_id}/bundle.json`,
          ];
          for (const requiredFile of requiredFiles) {
            if (!changedFiles.has(requiredFile)) errors.push(`${label}.migration_commit_sha가 필수 이관 파일을 변경하지 않았습니다: ${requiredFile}`);
          }
          for (const changedFile of changedFiles) {
            if (!isMigrationOwnedPath(changedFile)) errors.push(`${label}.migration_commit_sha가 migrate_publication 소유 밖 파일을 변경했습니다: ${changedFile}`);
          }
          if (changedFiles.has('artifacts/publication/production-queue.json')
            || changedFiles.has('artifacts/publication/production-queue-registry.json')) {
            errors.push(`${label}.migration_commit_sha는 queue 증거 후속 커밋과 분리된 데이터 이관 커밋이어야 합니다.`);
          }
          const evidenceChangedFiles = new Set(commitEvidence.evidence_changed_files || []);
          const allowedEvidenceFiles = new Set([
            'artifacts/publication/production-queue.json',
            'artifacts/publication/production-queue-registry.json',
          ]);
          if (!evidenceChangedFiles.has('artifacts/publication/production-queue.json')) {
            errors.push(`${label}.migration_commit_sha 이후에는 queue 증거 커밋이 production-queue.json을 변경해야 합니다.`);
          }
          if (commitEvidence.evidence_commit_count !== 1) {
            errors.push(`${label}.migration_commit_sha 이후에는 정확히 1개의 queue 증거 커밋만 허용됩니다.`);
          }
          if ((commitEvidence.evidence_merge_commits || []).length > 0) {
            errors.push(`${label}.migration_commit_sha 이후 queue 증거 구간에는 merge 커밋을 둘 수 없습니다.`);
          }
          for (const changedFile of evidenceChangedFiles) {
            if (!allowedEvidenceFiles.has(changedFile)) {
              errors.push(`${label}.migration_commit_sha 이후 queue 증거 구간에서 허용되지 않은 파일을 다시 변경했습니다: ${changedFile}`);
            }
          }
        }
      }
      if (item.integration_order !== null) errors.push(`${label}의 완료된 기존 주제 개정에는 integration_order가 null이어야 합니다.`);
    }
    if (item.change_mode === 'existing_topic_revision' && item.status === 'withdrawn') {
      if (!nonEmpty(item.terminal_reason_ko)) errors.push(`${label}.terminal_reason_ko는 철회 이력에 필요합니다.`);
      for (const field of ['integrated_snapshot_id', 'migration_commit_sha', 'absorbed_head_sha', 'topic_receipt', 'integration_mode']) {
        if (item[field] !== undefined) errors.push(`${label}.${field}는 출판되지 않은 withdrawn 이력에 사용할 수 없습니다.`);
      }
    }
    if (item.status === 'integrated') {
      if (item.source_freshness?.status !== 'current') errors.push(`${label}의 integrated 상태에는 current 근거가 필요합니다.`);
      if (item.integration_order !== null) errors.push(`${label}의 integrated 상태에는 integration_order가 null이어야 합니다.`);
    }
    if (item.status === 'merged_pending_publication') {
      const required = ['current_bundle', 'new_immutable_snapshot', 'migrate_publication'];
      if (item.source_freshness?.status !== 'current') errors.push(`${label}의 merged_pending_publication 상태에는 current 근거가 필요합니다.`);
      if (item.integration_order !== null) errors.push(`${label}의 merged_pending_publication 상태에는 integration_order가 null이어야 합니다.`);
      if (JSON.stringify(item.integrate_requires) !== JSON.stringify(required)) errors.push(`${label}.integrate_requires는 공개 승격 요건 3개를 요구해야 합니다.`);
      if (item.direct_merge !== undefined) errors.push(`${label}의 merged_pending_publication에는 direct_merge를 사용하지 않습니다.`);
    }

    if (!item.official_url_check || item.official_url_check.status !== 'passed') {
      errors.push(`${label}.official_url_check는 passed여야 합니다.`);
    } else if (counts && item.official_url_check.referenced_count !== counts.sources) {
      errors.push(`${label}의 공식 URL 검사 수와 근거 수가 다릅니다.`);
    }

    if (!item.source_freshness || !freshnessStatuses.has(item.source_freshness.status)) {
      errors.push(`${label}.source_freshness.status가 올바르지 않습니다.`);
    } else if ('mismatch_count' in item.source_freshness) {
      const mismatch = item.source_freshness.mismatch_count;
      if (!Number.isInteger(mismatch) || mismatch < 0 || (counts && mismatch > counts.sources)) {
        errors.push(`${label}.source_freshness.mismatch_count가 올바르지 않습니다.`);
      }
    }

    if (!Array.isArray(item.integration_checks) || item.integration_checks.length === 0 || item.integration_checks.some(value => !nonEmpty(value))) {
      errors.push(`${label}.integration_checks에는 하나 이상의 한글 검사조건이 필요합니다.`);
    }

    if (item.overlap_decisions !== undefined) {
      if (!Array.isArray(item.overlap_decisions)) errors.push(`${label}.overlap_decisions는 배열이어야 합니다.`);
      else for (const decision of item.overlap_decisions) {
        const hasPrTarget = isPositiveInteger(decision.target_pr);
        const hasContentTarget = nonEmpty(decision.target_content_id)
          && /^content\.[a-z0-9._-]+$/u.test(decision.target_content_id);
        if (Number(hasPrTarget) + Number(hasContentTarget) !== 1) {
          errors.push(`${label}의 overlap 대상은 target_pr 또는 target_content_id 중 하나여야 합니다.`);
        }
        if (hasPrTarget && decision.target_pr === item.pr_number) {
          errors.push(`${label}가 자기 PR을 overlap 대상으로 사용합니다.`);
        }
        if (!overlapRelationships.has(decision.relationship)) {
          errors.push(`${label}의 overlap relationship이 올바르지 않습니다.`);
        }
        if (!nonEmpty(decision.rationale_ko)) errors.push(`${label}의 overlap 근거가 필요합니다.`);
      }
    }

    if (item.supersedes_prs !== undefined) {
      if (!Array.isArray(item.supersedes_prs)) {
        errors.push(`${label}.supersedes_prs는 배열이어야 합니다.`);
      } else {
        if (!['integrated', 'merged_pending_publication'].includes(item.status)) errors.push(`${label}.supersedes_prs는 integrated 또는 merged_pending_publication 항목에만 사용할 수 있습니다.`);
        const seenSuperseded = new Set();
        for (const supersededPr of item.supersedes_prs) {
          if (!isPositiveInteger(supersededPr)) {
            errors.push(`${label}의 대체 대상 PR 번호가 올바르지 않습니다.`);
            continue;
          }
          if (supersededPr === item.pr_number) errors.push(`${label}가 자기 PR을 대체할 수 없습니다.`);
          if (seenSuperseded.has(supersededPr)) errors.push(`${label}의 대체 대상 PR이 중복됩니다: #${supersededPr}`);
          seenSuperseded.add(supersededPr);
        }
      }
    }

    if (activeWipStatuses.has(item.status)) {
      const count = (activeWipByOwner.get(item.owner_role) || 0) + 1;
      activeWipByOwner.set(item.owner_role, count);
    }
  }

  for (const [owner, count] of activeWipByOwner) {
    const limit = queue.policy?.wip_limit_per_producer;
    if (!isPositiveInteger(limit) || count > limit) {
      errors.push(`${owner}의 동시 진행 항목 ${count}개가 제한 ${limit || 0}개를 초과합니다.`);
    }
  }

  for (const item of queue.items) {
    for (const dependency of item.depends_on_prs || []) {
      const target = byPr.get(dependency);
      if (!target) errors.push(`#${item.pr_number}의 의존 PR #${dependency}가 대기열에 없습니다.`);
      else if (terminalStatuses.has(target.status) && target.status !== 'integrated') {
        errors.push(`#${item.pr_number}가 사용할 수 없는 #${dependency}(${target.status})에 의존합니다.`);
      } else {
        if (['ready_for_integration', 'integrated'].includes(item.status) && target.status !== 'integrated') errors.push(`#${item.pr_number}의 ${item.status} 상태에는 통합되지 않은 의존 PR #${dependency}가 남을 수 없습니다.`);
        if (isPositiveInteger(item.integration_order) && isPositiveInteger(target.integration_order) && target.integration_order >= item.integration_order) errors.push(`#${item.pr_number}의 통합 순서가 선행 PR #${dependency}보다 앞서거나 같습니다.`);
      }
    }
    for (const decision of item.overlap_decisions || []) {
      if (decision.target_pr && !byPr.has(decision.target_pr)) {
        errors.push(`#${item.pr_number}의 중복 판정 대상 #${decision.target_pr}가 대기열에 없습니다.`);
      }
    }
  }

  for (const item of queue.items) {
    for (const supersededPr of item.supersedes_prs || []) {
      const supersededItem = byPr.get(supersededPr);
      if (supersededItem && supersededItem.status !== 'superseded') {
        errors.push(`#${item.pr_number}가 대체한 #${supersededPr}은 삭제하지 않고 superseded 이력으로 보존해야 합니다.`);
      }
    }
  }

  if (publishedBundle) {
    let publishedHubIds = new Set();
    try { publishedHubIds = new Set(publicationArray(publishedBundle, 'topic_hubs').map(hub => hub?.hub_id).filter(nonEmpty)); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    if (publishedSnapshot) {
      if (publishedSnapshot.snapshot_id !== publishedBundle.snapshot_id) {
        errors.push('immutable snapshot의 snapshot_id가 current bundle과 다릅니다.');
      }
      if (canonicalJson(publishedSnapshot) !== canonicalJson(publishedBundle)) {
        errors.push('immutable snapshot과 current bundle의 합성 결과가 다릅니다.');
      }
    }
    for (const item of queue.items) {
      if (item.status === 'integrated' && !publishedHubIds.has(item.topic_id)) errors.push(`#${item.pr_number}의 integrated 주제가 current bundle에 없습니다: ${item.topic_id}`);
      if (item.status === 'merged_pending_publication' && publishedHubIds.has(item.topic_id)) errors.push(`#${item.pr_number}의 pending 주제가 이미 current bundle에 있으므로 integrated로 전환해야 합니다: ${item.topic_id}`);
      if (item.status === 'migration_required' && !publishedHubIds.has(item.topic_id)) errors.push(`#${item.pr_number}의 기존 개정 대상 주제가 current bundle에 없습니다: ${item.topic_id}`);
      if (item.change_mode === 'existing_topic_revision' && existingTopicPublishedStatuses.has(item.status)) {
        if (!publishedHubIds.has(item.topic_id)) errors.push(`#${item.pr_number}의 완료된 기존 주제가 current bundle에 없습니다: ${item.topic_id}`);
        if (item.integrated_snapshot_id !== publishedBundle.snapshot_id) {
          errors.push(`#${item.pr_number}.integrated_snapshot_id가 current bundle과 다릅니다.`);
        }
        if (!publishedSnapshot) errors.push(`#${item.pr_number}의 immutable snapshot 증거가 필요합니다.`);
        if (!(topicReceipts instanceof Map)) {
          errors.push(`#${item.pr_number}의 topic receipt 검증 입력이 필요합니다.`);
        } else if (topicReceipts.get(item.topic_file) !== item.topic_receipt) {
          errors.push(`#${item.pr_number}.topic_receipt가 현재 주제 원본과 다릅니다.`);
        }
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(pr) {
    if (visiting.has(pr)) {
      errors.push(`PR 의존성 순환이 있습니다: #${pr}`);
      return;
    }
    if (visited.has(pr)) return;
    visiting.add(pr);
    for (const dependency of byPr.get(pr)?.depends_on_prs || []) if (byPr.has(dependency)) visit(dependency);
    visiting.delete(pr);
    visited.add(pr);
  }
  for (const pr of byPr.keys()) visit(pr);

  const summary = queue.audit_summary || {};
  const openContentPrs = queue.items.filter(item => openPrStatuses.has(item.status)).length;
  if (summary.open_content_prs !== openContentPrs) errors.push(`audit_summary.open_content_prs와 실제 열린 상태 수가 다릅니다: expected=${openContentPrs}, actual=${String(summary.open_content_prs)}`);
  const sourceTotal = queue.items.reduce((sum, item) => sum + (item.counts?.sources || 0), 0);
  if (summary.official_source_references_checked !== sourceTotal) {
    errors.push('audit_summary.official_source_references_checked와 대기열 근거 합계가 다릅니다.');
  }
  const statusSummaryKeys = ['ready_for_integration', 'needs_rework', 'migration_required', 'blocked', 'integrated', 'merged_pending_publication'];
  for (const status of statusSummaryKeys) {
    const actual = queue.items.filter(item => item.status === status).length;
    if (summary[status] !== actual) {
      errors.push(`audit_summary.${status}와 실제 상태 수가 다릅니다: expected=${actual}, actual=${String(summary[status])}`);
    }
  }
  const overlapTotal = queue.items.reduce((sum, item) => sum + (item.overlap_decisions?.length || 0), 0);
  if (summary.semantic_overlap_decisions !== overlapTotal) errors.push('audit_summary.semantic_overlap_decisions와 실제 판정 수가 다릅니다.');
  if (summary.official_url_failures !== 0) errors.push('공식 URL 실패가 남아 있습니다.');
  if (summary.exact_cross_pr_content_id_collisions !== 0) errors.push('대기 PR 사이 content_id 충돌이 남아 있습니다.');
  if (summary.broken_related_content_ids !== 0) errors.push('깨진 관련 콘텐츠 참조가 남아 있습니다.');

  return [...new Set(errors)];
}

async function main() {
  const args = process.argv.slice(2);
  const queueArgument = args.find(value => !value.startsWith('--'));
  const queuePath = queueArgument ? path.resolve(queueArgument) : defaultQueuePath;
  const publishedBundle = JSON.parse(await readFile(defaultPublishedBundlePath, 'utf8'));
  const loadedQueue = JSON.parse(await readFile(queuePath, 'utf8'));
  const itemRegistry = args.includes('--write-item-registry')
    ? await synchronizeQueueItemRegistryFile(defaultQueueRegistryPath, loadedQueue)
    : JSON.parse(await readFile(defaultQueueRegistryPath, 'utf8'));
  const queue = args.includes('--write-current-publication')
    ? await synchronizeCurrentPublicationFile(queuePath, publishedBundle, {itemRegistry})
    : loadedQueue;
  const evidence = await loadQueuePublicationEvidence(queue, publishedBundle, {itemRegistry});
  const errors = validateProductionQueue(queue, {publishedBundle, ...evidence});
  if (errors.length) {
    console.error(`공개 콘텐츠 생산 대기열 검증 실패: ${errors.length}건`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  if (args.includes('--write-item-registry')) console.log(`생산 대기열 append-only item registry 동기화: ${itemRegistry.registrations.length}개`);
  if (args.includes('--write-current-publication')) console.log(`생산 대기열 공개본 표지 원자적 동기화: ${queue.current_publication.snapshot_id}`);
  const ready = queue.items.filter(item => item.status === 'ready_for_integration').length;
  const rework = queue.items.filter(item => item.status === 'needs_rework').length;
  const migration = queue.items.filter(item => item.status === 'migration_required').length;
  const blocked = queue.items.filter(item => item.status === 'blocked').length;
  console.log(`공개 콘텐츠 생산 대기열 검증 통과: 전체 ${queue.items.length}개 / 통합 준비 ${ready}개 / 재작업 ${rework}개 / 이관 필요 ${migration}개 / 의존 차단 ${blocked}개`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(`공개 콘텐츠 생산 대기열 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
