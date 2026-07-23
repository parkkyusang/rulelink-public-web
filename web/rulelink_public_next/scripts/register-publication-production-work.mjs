import {open, readFile, rename, stat, unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';

import {
  PRODUCTION_WORK_CONTRACTS,
  appendQueueItemRegistrations,
  loadQueuePublicationEvidence,
  validateProductionQueue,
} from './validate-publication-production-queue.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const defaultQueuePath = path.join(repoRoot, 'artifacts', 'publication', 'production-queue.json');
const defaultRegistryPath = path.join(
  repoRoot,
  'artifacts',
  'publication',
  'production-queue-registry.json',
);
const defaultBundlePath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function refreshProductionQueueAuditSummary(queue) {
  const next = clone(queue);
  const openStatuses = new Set([
    'pr_open',
    'ready_for_integration',
    'needs_rework',
    'migration_required',
    'blocked',
  ]);
  next.audit_summary.open_content_prs =
    next.items.filter(item => openStatuses.has(item.status)).length;
  for (const status of [
    'ready_for_integration',
    'needs_rework',
    'migration_required',
    'blocked',
    'integrated',
    'merged_pending_publication',
    'superseded',
    'withdrawn',
  ]) {
    next.audit_summary[status] = next.items.filter(item => item.status === status).length;
  }
  next.audit_summary.official_source_references_checked =
    next.items.reduce(
      (sum, item) => sum + (
        item.official_url_check?.status === 'passed'
          ? item.official_url_check.referenced_count || 0
          : 0
      ),
      0,
    );
  next.audit_summary.semantic_overlap_decisions =
    next.items.reduce((sum, item) => sum + (item.overlap_decisions?.length || 0), 0);
  return next;
}

export function buildPlannedProductionWorkItem(workId) {
  const contract = PRODUCTION_WORK_CONTRACTS[workId];
  if (!contract) {
    throw new Error(`승인된 production work_id가 아닙니다: ${workId}`);
  }
  return {
    queue_id: `publication-work-${workId}`,
    work_id: workId,
    title_ko: contract.title_ko,
    owner_role: 'content_production',
    topic_id: contract.topic_id,
    topic_file: contract.topic_file,
    test_file: contract.test_file,
    change_mode: contract.change_mode,
    status: 'planned',
    counts: clone(contract.counts),
    quality_targets: clone(contract.quality_targets),
    prerequisite_gates: Object.entries(contract.prerequisite_gates).map(
      ([gateId, gate]) => ({
        gate_id: gateId,
        gate_kind: gate.gate_kind,
        owner_role: gate.owner_role,
        status: 'pending',
      }),
    ),
    release_checks: contract.release_check_ids.map(
      checkId => ({check_id: checkId, status: 'pending'}),
    ),
    depends_on_prs: [],
    depends_on_work_ids: clone(contract.depends_on_work_ids),
    integration_order: null,
    direct_merge: false,
    integrate_requires: [
      'current_bundle',
      'new_immutable_snapshot',
      'migrate_publication',
    ],
    official_url_check: {
      status: 'pending',
      referenced_count: 0,
    },
    source_freshness: {
      status: 'pending',
      mismatch_count: 0,
    },
    integration_checks: clone(contract.integration_checks),
  };
}

export function prepareProductionWorkRegistration(queue, registry, workIds) {
  if (!Array.isArray(workIds) || workIds.length === 0) {
    throw new Error('등록할 work_id가 하나 이상 필요합니다.');
  }
  const uniqueWorkIds = [...new Set(workIds)];
  if (uniqueWorkIds.length !== workIds.length) {
    throw new Error('같은 work_id를 한 번의 등록 요청에 중복해서 사용할 수 없습니다.');
  }
  let nextQueue = clone(queue);
  const existingWorkIds = new Set(
    nextQueue.items.filter(item => nonEmpty(item.work_id)).map(item => item.work_id),
  );
  for (const workId of uniqueWorkIds) {
    if (existingWorkIds.has(workId)) {
      throw new Error(`이미 생산 대기열에 등록된 work_id입니다: ${workId}`);
    }
    const item = buildPlannedProductionWorkItem(workId);
    for (const dependency of item.depends_on_work_ids) {
      if (!existingWorkIds.has(dependency)) {
        throw new Error(`${workId}의 선행 work_id를 먼저 등록해야 합니다: ${dependency}`);
      }
    }
    nextQueue.items.push(item);
    existingWorkIds.add(workId);
  }
  nextQueue = refreshProductionQueueAuditSummary(nextQueue);
  const nextRegistry = appendQueueItemRegistrations(registry, nextQueue, {
    previousRegistry: registry,
  });
  return {queue: nextQueue, registry: nextRegistry};
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function registrationTransactionPaths(queuePath, registryPath, transactionId = randomUUID()) {
  const queueDirectory = path.dirname(queuePath);
  if (queueDirectory !== path.dirname(registryPath)) {
    throw new Error('queue와 registry는 같은 디렉터리에 있어야 합니다.');
  }
  return {
    lock: path.join(queueDirectory, '.production-work-registration.lock'),
    journal: path.join(queueDirectory, '.production-work-registration.transaction.json'),
    journalTemp: path.join(queueDirectory, '.production-work-registration.transaction.next'),
    queueBackup: `${queuePath}.registration-backup-${transactionId}`,
    registryBackup: `${registryPath}.registration-backup-${transactionId}`,
    queueTemp: `${queuePath}.registration-next-${transactionId}`,
    registryTemp: `${registryPath}.registration-next-${transactionId}`,
  };
}

function fsOperations(io = {}) {
  return {
    open: io.open || open,
    readFile: io.readFile || readFile,
    rename: io.rename || rename,
    stat: io.stat || stat,
    unlink: io.unlink || unlink,
  };
}

async function pathExists(filePath, fsOps) {
  try {
    await fsOps.stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function writeSyncedFile(filePath, value, fsOps, flag = 'w') {
  const handle = await fsOps.open(filePath, flag);
  try {
    await handle.writeFile(value);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncParentDirectory(filePath, fsOps) {
  let handle;
  try {
    handle = await fsOps.open(path.dirname(filePath), 'r');
    await handle.sync();
    return 'synced';
  } catch (error) {
    // Node on Windows cannot fsync directory handles (EPERM). File contents,
    // the append-only journal and startup recovery still cover process
    // interruption; full power-loss directory durability is only guaranteed
    // on platforms where the directory handle can be synced.
    if (
      process.platform === 'win32'
      && ['EPERM', 'EISDIR', 'EINVAL'].includes(error?.code)
    ) {
      return 'unsupported_on_win32';
    }
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function acquireRegistrationLock(lockPath, fsOps) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fsOps.open(lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify({
          schema: 'rulelink_production_work_registration_lock_v1',
          pid: process.pid,
          created_at: new Date().toISOString(),
        }));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await syncParentDirectory(lockPath, fsOps);
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let lock;
      try {
        lock = JSON.parse(await fsOps.readFile(lockPath, 'utf8'));
      } catch {
        throw new Error(`생산 작업 등록 lock을 해석할 수 없습니다: ${lockPath}`);
      }
      if (processIsAlive(lock.pid)) {
        throw new Error(`다른 생산 작업 등록 프로세스가 실행 중입니다: pid ${lock.pid}`);
      }
      await fsOps.unlink(lockPath);
    }
  }
  throw new Error('생산 작업 등록 lock을 획득하지 못했습니다.');
}

async function removeTransactionFiles(transaction, fsOps) {
  for (const filePath of [
    transaction.queueTemp,
    transaction.registryTemp,
    transaction.queueBackup,
    transaction.registryBackup,
    transaction.journal,
    transaction.journalTemp,
  ]) {
    await fsOps.unlink(filePath).catch(error => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  await syncParentDirectory(transaction.journal, fsOps);
}

function validateRegistrationTransaction(
  transaction,
  {journalPath, queuePath, registryPath},
) {
  if (transaction.schema !== 'rulelink_production_work_registration_transaction_v1') {
    throw new Error(`알 수 없는 생산 작업 등록 transaction입니다: ${journalPath}`);
  }
  if (!/^[a-z0-9-]{1,64}$/u.test(String(transaction.transaction_id || ''))) {
    throw new Error(`생산 작업 등록 transaction_id가 올바르지 않습니다: ${journalPath}`);
  }
  if (!['initializing', 'prepared', 'queue_replaced', 'both_replaced', 'committed']
    .includes(transaction.phase)) {
    throw new Error(`생산 작업 등록 transaction 단계가 올바르지 않습니다: ${journalPath}`);
  }
  if (![
    'process_interruption_recovery',
    'process_and_power_loss_recovery',
  ].includes(transaction.durability_scope)) {
    throw new Error(`생산 작업 등록 transaction 내구성 범위가 올바르지 않습니다: ${journalPath}`);
  }
  for (const hashField of [
    'queue_before_sha256',
    'registry_before_sha256',
    'queue_after_sha256',
    'registry_after_sha256',
  ]) {
    if (!/^[0-9a-f]{64}$/u.test(String(transaction[hashField] || ''))) {
      throw new Error(`생산 작업 등록 transaction hash가 올바르지 않습니다: ${hashField}`);
    }
  }
  const expected = registrationTransactionPaths(
    queuePath,
    registryPath,
    transaction.transaction_id,
  );
  const exactPaths = {
    queue_path: queuePath,
    registry_path: registryPath,
    queue_backup: expected.queueBackup,
    registry_backup: expected.registryBackup,
    queue_temp: expected.queueTemp,
    registry_temp: expected.registryTemp,
  };
  for (const [field, expectedPath] of Object.entries(exactPaths)) {
    if (transaction[field] !== expectedPath) {
      throw new Error(`생산 작업 등록 transaction 경로가 작업범위를 벗어났습니다: ${field}`);
    }
  }
  if (journalPath !== expected.journal) {
    throw new Error('생산 작업 등록 transaction journal 경로가 작업범위를 벗어났습니다.');
  }
  return expected;
}

async function recoverRegistrationTransaction(
  journalPath,
  queuePath,
  registryPath,
  fsOps,
) {
  if (!(await pathExists(journalPath, fsOps))) return 'none';
  const transaction = JSON.parse(await fsOps.readFile(journalPath, 'utf8'));
  const expectedPaths = validateRegistrationTransaction(
    transaction,
    {journalPath, queuePath, registryPath},
  );
  if (transaction.phase === 'committed') {
    const [queueValue, registryValue] = await Promise.all([
      fsOps.readFile(transaction.queue_path),
      fsOps.readFile(transaction.registry_path),
    ]);
    if (
      sha256(queueValue) !== transaction.queue_after_sha256 ||
      sha256(registryValue) !== transaction.registry_after_sha256
    ) {
      throw new Error('committed 생산 작업 등록 transaction의 정본 hash가 다릅니다.');
    }
    await removeTransactionFiles({
      queueTemp: transaction.queue_temp,
      registryTemp: transaction.registry_temp,
      queueBackup: transaction.queue_backup,
      registryBackup: transaction.registry_backup,
      journal: journalPath,
      journalTemp: expectedPaths.journalTemp,
    }, fsOps);
    return 'committed';
  }
  for (const [targetKey, backupKey, hashKey] of [
    ['queue_path', 'queue_backup', 'queue_before_sha256'],
    ['registry_path', 'registry_backup', 'registry_before_sha256'],
  ]) {
    const backupPath = transaction[backupKey];
    if (await pathExists(backupPath, fsOps)) {
      const backup = await fsOps.readFile(backupPath);
      if (sha256(backup) !== transaction[hashKey]) {
        throw new Error(`생산 작업 등록 rollback 백업 hash가 다릅니다: ${backupPath}`);
      }
      await fsOps.rename(backupPath, transaction[targetKey]);
    } else {
      const target = await fsOps.readFile(transaction[targetKey]);
      if (sha256(target) !== transaction[hashKey]) {
        throw new Error(`생산 작업 등록 rollback 백업이 없고 정본도 원본 hash가 아닙니다: ${backupPath}`);
      }
    }
  }
  await removeTransactionFiles({
    queueTemp: transaction.queue_temp,
    registryTemp: transaction.registry_temp,
    queueBackup: transaction.queue_backup,
    registryBackup: transaction.registry_backup,
    journal: journalPath,
    journalTemp: expectedPaths.journalTemp,
  }, fsOps);
  return 'rolled_back';
}

async function writeProductionWorkTransaction({
  queuePath,
  registryPath,
  queueBefore,
  registryBefore,
  queueAfter,
  registryAfter,
  fsOps,
}) {
  const paths = registrationTransactionPaths(queuePath, registryPath);
  const transaction = {
    schema: 'rulelink_production_work_registration_transaction_v1',
    transaction_id: path.basename(paths.queueTemp).split('registration-next-').at(-1),
    durability_scope: process.platform === 'win32'
      ? 'process_interruption_recovery'
      : 'process_and_power_loss_recovery',
    phase: 'initializing',
    queue_path: queuePath,
    registry_path: registryPath,
    queue_backup: paths.queueBackup,
    registry_backup: paths.registryBackup,
    queue_temp: paths.queueTemp,
    registry_temp: paths.registryTemp,
    queue_before_sha256: sha256(queueBefore),
    registry_before_sha256: sha256(registryBefore),
    queue_after_sha256: sha256(queueAfter),
    registry_after_sha256: sha256(registryAfter),
  };
  const writeJournal = async phase => {
    transaction.phase = phase;
    await writeSyncedFile(paths.journalTemp, jsonText(transaction), fsOps);
    await fsOps.rename(paths.journalTemp, paths.journal);
    await syncParentDirectory(paths.journal, fsOps);
  };
  await writeJournal('initializing');
  try {
    await writeSyncedFile(paths.queueBackup, queueBefore, fsOps, 'wx');
    await writeSyncedFile(paths.registryBackup, registryBefore, fsOps, 'wx');
    await writeSyncedFile(paths.queueTemp, queueAfter, fsOps, 'wx');
    await writeSyncedFile(paths.registryTemp, registryAfter, fsOps, 'wx');
    await writeJournal('prepared');
    await fsOps.rename(paths.queueTemp, queuePath);
    await writeJournal('queue_replaced');
    await fsOps.rename(paths.registryTemp, registryPath);
    await writeJournal('both_replaced');
    const [writtenQueue, writtenRegistry] = await Promise.all([
      fsOps.readFile(queuePath),
      fsOps.readFile(registryPath),
    ]);
    if (
      sha256(writtenQueue) !== transaction.queue_after_sha256 ||
      sha256(writtenRegistry) !== transaction.registry_after_sha256
    ) {
      throw new Error('생산 작업 등록 후 두 정본 파일 hash가 예상값과 다릅니다.');
    }
    await writeJournal('committed');
    await removeTransactionFiles({...paths, journal: paths.journal}, fsOps);
  } catch (error) {
    try {
      const recovery = await recoverRegistrationTransaction(
        paths.journal,
        queuePath,
        registryPath,
        fsOps,
      );
      if (recovery === 'committed') return;
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        '생산 작업 등록과 원본 byte rollback이 모두 실패했습니다.',
      );
    }
    throw error;
  }
}

export async function registerProductionWorkFiles({
  workIds,
  queuePath = defaultQueuePath,
  registryPath = defaultRegistryPath,
  bundlePath = defaultBundlePath,
  write = false,
  io = {},
} = {}) {
  queuePath = path.resolve(queuePath);
  registryPath = path.resolve(registryPath);
  bundlePath = path.resolve(bundlePath);
  const fsOps = fsOperations(io);
  const transactionPaths = registrationTransactionPaths(queuePath, registryPath, 'inspection');
  let lockHeld = false;
  if (write) {
    await acquireRegistrationLock(transactionPaths.lock, fsOps);
    lockHeld = true;
    try {
      if (
        !(await pathExists(transactionPaths.journal, fsOps))
        && await pathExists(transactionPaths.journalTemp, fsOps)
      ) {
        await fsOps.unlink(transactionPaths.journalTemp);
      }
      await recoverRegistrationTransaction(
        transactionPaths.journal,
        queuePath,
        registryPath,
        fsOps,
      );
    } catch (error) {
      await fsOps.unlink(transactionPaths.lock).catch(() => {});
      throw error;
    }
  } else if (await pathExists(transactionPaths.journal, fsOps)) {
    throw new Error('미완료 생산 작업 등록 transaction이 있습니다. --write로 복구한 뒤 다시 확인하세요.');
  }
  try {
    const [queueBytes, registryBytes, bundleText] = await Promise.all([
      fsOps.readFile(queuePath),
      fsOps.readFile(registryPath),
      fsOps.readFile(bundlePath, 'utf8'),
    ]);
    const queue = JSON.parse(queueBytes.toString('utf8'));
    const registry = JSON.parse(registryBytes.toString('utf8'));
    const bundle = JSON.parse(bundleText);
    const prepared = prepareProductionWorkRegistration(queue, registry, workIds);
    const evidence = await loadQueuePublicationEvidence(prepared.queue, bundle, {
      itemRegistry: prepared.registry,
    });
    const errors = validateProductionQueue(prepared.queue, {
      publishedBundle: bundle,
      itemRegistry: prepared.registry,
      ...evidence,
    });
    if (errors.length) {
      throw new Error(`생산 작업 등록 검증 실패: ${errors.join(' | ')}`);
    }
    if (write) {
      await writeProductionWorkTransaction({
        queuePath,
        registryPath,
        queueBefore: queueBytes,
        registryBefore: registryBytes,
        queueAfter: Buffer.from(jsonText(prepared.queue), 'utf8'),
        registryAfter: Buffer.from(jsonText(prepared.registry), 'utf8'),
        fsOps,
      });
    }
    return prepared;
  } finally {
    if (lockHeld) await fsOps.unlink(transactionPaths.lock).catch(() => {});
  }
}

function parseArgs(args) {
  const workIds = [];
  let write = false;
  let list = false;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--write') {
      write = true;
    } else if (value === '--list') {
      list = true;
    } else if (value === '--work-id') {
      const workId = args[index + 1];
      if (!nonEmpty(workId)) throw new Error('--work-id 뒤에 식별자가 필요합니다.');
      workIds.push(workId);
      index += 1;
    } else {
      throw new Error(`알 수 없는 인자입니다: ${value}`);
    }
  }
  return {workIds, write, list};
}

async function main() {
  const {workIds, write, list} = parseArgs(process.argv.slice(2));
  if (list) {
    for (const workId of Object.keys(PRODUCTION_WORK_CONTRACTS)) console.log(workId);
    return;
  }
  const prepared = await registerProductionWorkFiles({workIds, write});
  const registered = prepared.queue.items
    .filter(item => workIds.includes(item.work_id))
    .map(item => item.work_id);
  console.log(
    `${write ? '생산 작업 등록 완료' : '생산 작업 등록 사전검증 통과'}: ${registered.join(', ')}`,
  );
  if (!write) console.log('파일은 변경하지 않았습니다. 실제 등록에는 --write를 추가하세요.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(`생산 작업 등록 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
