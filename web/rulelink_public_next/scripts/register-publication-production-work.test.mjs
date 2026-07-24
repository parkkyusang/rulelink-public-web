import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  buildPlannedProductionWorkItem,
  prepareProductionWorkRegistration,
  registerProductionWorkFiles,
} from './register-publication-production-work.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const queuePath = path.join(repoRoot, 'artifacts', 'publication', 'production-queue.json');
const registryPath = path.join(
  repoRoot,
  'artifacts',
  'publication',
  'production-queue-registry.json',
);
const bundlePath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

async function readJson(filePath) {
  const value = JSON.parse(await readFile(filePath, 'utf8'));
  const workIds = new Set([
    'reader-backfill-crime-victim-wave1',
    'reader-backfill-debt-enforcement-wave2',
  ]);
  if (filePath === queuePath) {
    value.items = value.items.filter(item => !workIds.has(item.work_id));
    const openStatuses = new Set([
      'pr_open',
      'ready_for_integration',
      'needs_rework',
      'migration_required',
      'blocked',
    ]);
    value.audit_summary.open_content_prs =
      value.items.filter(item => openStatuses.has(item.status)).length;
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
      value.audit_summary[status] =
        value.items.filter(item => item.status === status).length;
    }
  }
  if (filePath === registryPath) {
    value.registrations = value.registrations.filter(
      item => !workIds.has(item.work_id),
    );
    value.registry_receipt = value.registrations.at(-1)?.receipt || null;
    value.prerequisite_gate_receipts = value.prerequisite_gate_receipts.filter(
      item => !workIds.has(item.work_id),
    );
    if (value.prerequisite_gate_receipts.length === 0) {
      delete value.prerequisite_gate_receipts;
      delete value.prerequisite_gate_receipt;
    } else {
      value.prerequisite_gate_receipt =
        value.prerequisite_gate_receipts.at(-1).receipt;
    }
    for (const [entriesKey, receiptKey] of [
      ['release_check_receipts', 'release_check_receipt'],
      ['pr_bindings', 'pr_binding_receipt'],
      ['head_receipts', 'head_receipt'],
    ]) {
      if (value[entriesKey]?.length === 0) {
        delete value[entriesKey];
        delete value[receiptKey];
      }
    }
  }
  return value;
}

async function fileHash(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function valueHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function withTemporaryProductionFiles(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rulelink-production-work-'));
  const paths = {
    directory,
    queue: path.join(directory, 'production-queue.json'),
    registry: path.join(directory, 'production-queue-registry.json'),
    bundle: path.join(directory, 'bundle.json'),
  };
  const [queue, registry] = await Promise.all([
    readJson(queuePath),
    readJson(registryPath),
  ]);
  await Promise.all([
    writeFile(paths.queue, `${JSON.stringify(queue, null, 2)}\n`, 'utf8'),
    writeFile(paths.registry, `${JSON.stringify(registry, null, 2)}\n`, 'utf8'),
    cp(bundlePath, paths.bundle),
  ]);
  try {
    return await callback(paths);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

async function registrationArtifacts(directory) {
  return (await readdir(directory))
    .filter(name => name.includes('production-work-registration')
      || name.includes('registration-backup')
      || name.includes('registration-next'));
}

test('Wave1 planned 항목을 승인 계약에서 결정론적으로 만든다', () => {
  const item = buildPlannedProductionWorkItem('reader-backfill-crime-victim-wave1');
  assert.equal(item.queue_id, 'publication-work-reader-backfill-crime-victim-wave1');
  assert.equal(item.status, 'planned');
  assert.equal(item.pr_number, undefined);
  assert.equal(item.head_sha, undefined);
  assert.equal(item.branch, undefined);
  assert.equal(item.counts.authority_units, 5);
  assert.equal(item.quality_targets.typed_relation_after, 10);
  assert.equal(item.prerequisite_gates.length, 7);
  assert.ok(item.prerequisite_gates.every(gate => gate.status === 'pending'));
  assert.ok(item.release_checks.every(check => check.status === 'pending'));
  assert.deepEqual(item.official_url_check, {status: 'pending', referenced_count: 0});
  assert.deepEqual(item.source_freshness, {status: 'pending', mismatch_count: 0});
});

test('Wave1과 Wave2를 순서대로 등록하고 queue와 append-only registry를 함께 갱신한다', async () => {
  const queue = await readJson(queuePath);
  const registry = await readJson(registryPath);
  const prepared = prepareProductionWorkRegistration(queue, registry, [
    'reader-backfill-crime-victim-wave1',
    'reader-backfill-debt-enforcement-wave2',
  ]);
  const workItems = prepared.queue.items.filter(item => item.work_id);
  assert.deepEqual(
    workItems.map(item => item.work_id),
    [
      'reader-backfill-crime-victim-wave1',
      'reader-backfill-debt-enforcement-wave2',
    ],
  );
  assert.deepEqual(
    workItems[1].depends_on_work_ids,
    ['reader-backfill-crime-victim-wave1'],
  );
  assert.equal(
    prepared.queue.audit_summary.official_source_references_checked,
    queue.audit_summary.official_source_references_checked,
  );
  assert.deepEqual(
    prepared.registry.registrations.slice(-2).map(item => item.work_id),
    [
      'reader-backfill-crime-victim-wave1',
      'reader-backfill-debt-enforcement-wave2',
    ],
  );
  assert.equal(
    prepared.registry.registrations.at(-1).previous_receipt,
    prepared.registry.registrations.at(-2).receipt,
  );
  assert.equal(prepared.registry.registry_receipt, prepared.registry.registrations.at(-1).receipt);
});

test('Wave2 단독 등록과 unknown·중복 work_id를 명시적으로 거부한다', async () => {
  const queue = await readJson(queuePath);
  const registry = await readJson(registryPath);
  assert.throws(
    () => prepareProductionWorkRegistration(queue, registry, [
      'reader-backfill-debt-enforcement-wave2',
    ]),
    /선행 work_id를 먼저 등록/u,
  );
  assert.throws(
    () => prepareProductionWorkRegistration(queue, registry, [
      'reader-backfill-debt-enforcement-wave2',
      'reader-backfill-crime-victim-wave1',
    ]),
    /선행 work_id를 먼저 등록/u,
  );
  assert.throws(
    () => prepareProductionWorkRegistration(queue, registry, ['unknown-work']),
    /승인된 production work_id가 아닙니다/u,
  );
  assert.throws(
    () => prepareProductionWorkRegistration(queue, registry, [
      'reader-backfill-crime-victim-wave1',
      'reader-backfill-crime-victim-wave1',
    ]),
    /중복해서 사용할 수 없습니다/u,
  );
});

test('사전검증은 전체 생산 대기열 검증을 통과하고 두 정본 파일을 바꾸지 않는다', async () => {
  const before = {
    queue: await fileHash(queuePath),
    registry: await fileHash(registryPath),
  };
  await withTemporaryProductionFiles(async paths => {
    const prepared = await registerProductionWorkFiles({
      workIds: ['reader-backfill-crime-victim-wave1'],
      queuePath: paths.queue,
      registryPath: paths.registry,
      bundlePath: paths.bundle,
      write: false,
    });
    assert.equal(
      prepared.queue.items.at(-1).work_id,
      'reader-backfill-crime-victim-wave1',
    );
  });
  assert.deepEqual(
    {
      queue: await fileHash(queuePath),
      registry: await fileHash(registryPath),
    },
    before,
  );
});

test('package 진입점은 실제 등록 명령과 정규 출판 시험에 연결된다', async () => {
  const packageJson = await readJson(path.join(appRoot, 'package.json'));
  assert.equal(
    packageJson.scripts['register:production-work'],
    'node scripts/register-publication-production-work.mjs',
  );
  assert.match(
    packageJson.scripts['test:publication'],
    /register-publication-production-work\.test\.mjs/u,
  );
});

test('쓰기 성공은 queue와 registry를 한 세대로 갱신하고 transaction 흔적을 남기지 않는다', async () => {
  await withTemporaryProductionFiles(async paths => {
    const before = {
      queue: await fileHash(paths.queue),
      registry: await fileHash(paths.registry),
    };
    await registerProductionWorkFiles({
      workIds: ['reader-backfill-crime-victim-wave1'],
      queuePath: paths.queue,
      registryPath: paths.registry,
      bundlePath: paths.bundle,
      write: true,
    });
    const [writtenQueue, writtenRegistry] = await Promise.all([
      readJson(paths.queue),
      readJson(paths.registry),
    ]);
    assert.equal(
      writtenQueue.items.at(-1).work_id,
      'reader-backfill-crime-victim-wave1',
    );
    assert.equal(
      writtenRegistry.registrations.at(-1).work_id,
      'reader-backfill-crime-victim-wave1',
    );
    assert.notEqual(await fileHash(paths.queue), before.queue);
    assert.notEqual(await fileHash(paths.registry), before.registry);
    assert.deepEqual(await registrationArtifacts(paths.directory), []);
  });
});

for (const failingTarget of ['queue', 'registry']) {
  test(`${failingTarget} 정본 교체 실패는 두 파일의 원본 byte를 정확히 복원한다`, async () => {
    await withTemporaryProductionFiles(async paths => {
      const before = {
        queue: await readFile(paths.queue),
        registry: await readFile(paths.registry),
      };
      let injected = false;
      await assert.rejects(
        registerProductionWorkFiles({
          workIds: ['reader-backfill-crime-victim-wave1'],
          queuePath: paths.queue,
          registryPath: paths.registry,
          bundlePath: paths.bundle,
          write: true,
          io: {
            rename: async (source, target) => {
              const targetPath = failingTarget === 'queue' ? paths.queue : paths.registry;
              if (!injected && target === targetPath && source.includes('registration-next')) {
                injected = true;
                const error = new Error(`${failingTarget} rename failure`);
                error.code = 'EIO';
                throw error;
              }
              return rename(source, target);
            },
          },
        }),
        new RegExp(`${failingTarget} rename failure`, 'u'),
      );
      assert.equal(Buffer.compare(await readFile(paths.queue), before.queue), 0);
      assert.equal(Buffer.compare(await readFile(paths.registry), before.registry), 0);
      assert.deepEqual(await registrationArtifacts(paths.directory), []);
    });
  });
}

test('다른 플랫폼에서 중단되어 queue만 교체된 journal도 다음 writer가 원본 복구 후 등록한다', async () => {
  await withTemporaryProductionFiles(async paths => {
    const [queueBefore, registryBefore] = await Promise.all([
      readFile(paths.queue),
      readFile(paths.registry),
    ]);
    const queueBackup = `${paths.queue}.registration-backup-interrupted`;
    const registryBackup = `${paths.registry}.registration-backup-interrupted`;
    const queueTemp = `${paths.queue}.registration-next-interrupted`;
    const registryTemp = `${paths.registry}.registration-next-interrupted`;
    const journal = path.join(
      paths.directory,
      '.production-work-registration.transaction.json',
    );
    await Promise.all([
      writeFile(queueBackup, queueBefore),
      writeFile(registryBackup, registryBefore),
      writeFile(paths.queue, 'interrupted queue bytes'),
      writeFile(registryTemp, 'interrupted registry next bytes'),
    ]);
    await writeFile(journal, `${JSON.stringify({
      schema: 'rulelink_production_work_registration_transaction_v1',
      transaction_id: 'interrupted',
      durability_scope: process.platform === 'win32'
        ? 'process_and_power_loss_recovery'
        : 'process_interruption_recovery',
      phase: 'queue_replaced',
      queue_path: paths.queue,
      registry_path: paths.registry,
      queue_backup: queueBackup,
      registry_backup: registryBackup,
      queue_temp: queueTemp,
      registry_temp: registryTemp,
      queue_before_sha256: valueHash(queueBefore),
      registry_before_sha256: valueHash(registryBefore),
      queue_after_sha256: valueHash('unused queue after'),
      registry_after_sha256: valueHash('unused registry after'),
    }, null, 2)}\n`);

    await registerProductionWorkFiles({
      workIds: ['reader-backfill-crime-victim-wave1'],
      queuePath: paths.queue,
      registryPath: paths.registry,
      bundlePath: paths.bundle,
      write: true,
    });
    assert.equal(
      (await readJson(paths.queue)).items.at(-1).work_id,
      'reader-backfill-crime-victim-wave1',
    );
    assert.equal(
      (await readJson(paths.registry)).registrations.at(-1).work_id,
      'reader-backfill-crime-victim-wave1',
    );
    assert.deepEqual(await registrationArtifacts(paths.directory), []);
  });
});

test('조작된 journal 경로는 현재 queue와 registry 작업범위 밖 파일에 접근하지 못한다', async () => {
  await withTemporaryProductionFiles(async paths => {
    const [queueBefore, registryBefore] = await Promise.all([
      readFile(paths.queue),
      readFile(paths.registry),
    ]);
    const transactionId = 'escaped';
    const journal = path.join(
      paths.directory,
      '.production-work-registration.transaction.json',
    );
    await writeFile(journal, `${JSON.stringify({
      schema: 'rulelink_production_work_registration_transaction_v1',
      transaction_id: transactionId,
      durability_scope: process.platform === 'win32'
        ? 'process_interruption_recovery'
        : 'process_and_power_loss_recovery',
      phase: 'initializing',
      queue_path: path.join(paths.directory, '..', 'outside-queue.json'),
      registry_path: paths.registry,
      queue_backup: `${paths.queue}.registration-backup-${transactionId}`,
      registry_backup: `${paths.registry}.registration-backup-${transactionId}`,
      queue_temp: `${paths.queue}.registration-next-${transactionId}`,
      registry_temp: `${paths.registry}.registration-next-${transactionId}`,
      queue_before_sha256: valueHash(queueBefore),
      registry_before_sha256: valueHash(registryBefore),
      queue_after_sha256: valueHash('unused queue after'),
      registry_after_sha256: valueHash('unused registry after'),
    }, null, 2)}\n`);
    const before = {
      queue: await fileHash(paths.queue),
      registry: await fileHash(paths.registry),
    };
    await assert.rejects(
      registerProductionWorkFiles({
        workIds: ['reader-backfill-crime-victim-wave1'],
        queuePath: paths.queue,
        registryPath: paths.registry,
        bundlePath: paths.bundle,
        write: true,
      }),
      /작업범위를 벗어났습니다/u,
    );
    assert.deepEqual(
      {
        queue: await fileHash(paths.queue),
        registry: await fileHash(paths.registry),
      },
      before,
    );
    assert.ok((await registrationArtifacts(paths.directory)).length > 0);
  });
});

test('교체된 정본의 backup이 없고 원본 hash도 아니면 journal을 보존하고 hard fail한다', async () => {
  await withTemporaryProductionFiles(async paths => {
    const [queueBefore, registryBefore] = await Promise.all([
      readFile(paths.queue),
      readFile(paths.registry),
    ]);
    const transactionId = 'missing-backup';
    const queueBackup = `${paths.queue}.registration-backup-${transactionId}`;
    const registryBackup = `${paths.registry}.registration-backup-${transactionId}`;
    const queueTemp = `${paths.queue}.registration-next-${transactionId}`;
    const registryTemp = `${paths.registry}.registration-next-${transactionId}`;
    const journal = path.join(
      paths.directory,
      '.production-work-registration.transaction.json',
    );
    await Promise.all([
      writeFile(registryBackup, registryBefore),
      writeFile(paths.queue, 'queue replaced without backup'),
      writeFile(registryTemp, 'interrupted registry next bytes'),
    ]);
    await writeFile(journal, `${JSON.stringify({
      schema: 'rulelink_production_work_registration_transaction_v1',
      transaction_id: transactionId,
      durability_scope: process.platform === 'win32'
        ? 'process_interruption_recovery'
        : 'process_and_power_loss_recovery',
      phase: 'queue_replaced',
      queue_path: paths.queue,
      registry_path: paths.registry,
      queue_backup: queueBackup,
      registry_backup: registryBackup,
      queue_temp: queueTemp,
      registry_temp: registryTemp,
      queue_before_sha256: valueHash(queueBefore),
      registry_before_sha256: valueHash(registryBefore),
      queue_after_sha256: valueHash('unused queue after'),
      registry_after_sha256: valueHash('unused registry after'),
    }, null, 2)}\n`);

    await assert.rejects(
      registerProductionWorkFiles({
        workIds: ['reader-backfill-crime-victim-wave1'],
        queuePath: paths.queue,
        registryPath: paths.registry,
        bundlePath: paths.bundle,
        write: true,
      }),
      /rollback 백업이 없고 정본도 원본 hash가 아닙니다/u,
    );
    assert.equal(await fileHash(paths.queue), valueHash('queue replaced without backup'));
    assert.ok((await registrationArtifacts(paths.directory)).some(name => (
      name === '.production-work-registration.transaction.json'
    )));
  });
});

test('동시에 살아 있는 writer lock은 stale generation 덮어쓰기를 차단한다', async () => {
  await withTemporaryProductionFiles(async paths => {
    const lockPath = path.join(paths.directory, '.production-work-registration.lock');
    await writeFile(lockPath, JSON.stringify({
      schema: 'rulelink_production_work_registration_lock_v1',
      pid: process.pid,
      created_at: new Date().toISOString(),
    }));
    const before = {
      queue: await fileHash(paths.queue),
      registry: await fileHash(paths.registry),
    };
    await assert.rejects(
      registerProductionWorkFiles({
        workIds: ['reader-backfill-crime-victim-wave1'],
        queuePath: paths.queue,
        registryPath: paths.registry,
        bundlePath: paths.bundle,
        write: true,
      }),
      /pid/u,
    );
    assert.deepEqual(
      {
        queue: await fileHash(paths.queue),
        registry: await fileHash(paths.registry),
      },
      before,
    );
  });
});
