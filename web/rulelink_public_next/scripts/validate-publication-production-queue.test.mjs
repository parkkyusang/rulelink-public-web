import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import test from 'node:test';

import {
  createAuthorityEvidenceFixtures,
  githubContentsFixture,
  producerContractPayload,
  sourceCiWorkflowPayload,
} from './authority-evidence-test-fixtures.mjs';
import {
  AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY,
  AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS,
  AUTHORITY_EVIDENCE_SOURCE_FILENAMES,
  AUTHORITY_EVIDENCE_TRUSTED_PRODUCER_COMMIT_SHA,
  AUTHORITY_EVIDENCE_VERIFICATION_CONTRACT,
} from './validate-authority-evidence-artifacts.mjs';
import {
  OWNER_ROLE_CONTRACTS,
  PRODUCTION_WORK_CONTRACTS,
  buildPublicationStatusFromBundle,
  appendPrerequisiteGateReceipts,
  appendReleaseCheckReceipts,
  appendQueueHeadReceipts,
  appendQueueItemRegistrations,
  appendQueuePrBindings,
  compareQueueCurrentPublication,
  deriveCurrentPublication,
  inspectMigrationCommit,
  inspectQueueItemRegistryHistory,
  loadQueuePublicationEvidence,
  synchronizeCurrentPublicationFile,
  synchronizeQueueItemRegistryFile,
  topicReceipt,
  updateQueueCurrentPublication,
  verifyProductionQueueExternalEvidence,
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
const publicationCompletionFields = [
  'integrated_snapshot_id',
  'migration_commit_sha',
  'absorbed_head_sha',
  'topic_receipt',
  'integration_mode',
];

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
    value.items.reduce(
      (sum, item) => sum + (
        item.official_url_check?.status === 'passed'
          ? item.official_url_check.referenced_count || 0
          : 0
      ),
      0,
    );
  value.audit_summary.semantic_overlap_decisions =
    value.items.reduce((sum, item) => sum + (item.overlap_decisions?.length || 0), 0);
  return value;
}

const productionWorkIds = new Set(Object.keys(PRODUCTION_WORK_CONTRACTS));
const workQueueBaseline = refreshSummary({
  ...clone(queue),
  items: queue.items.filter(item => !productionWorkIds.has(item.work_id)),
});
const firstWorkRegistration = registry.registrations.findIndex(
  item => productionWorkIds.has(item.work_id),
);
const workBaselineRegistrations = firstWorkRegistration < 0
  ? registry.registrations
  : registry.registrations.slice(0, firstWorkRegistration);
assert.ok(
  registry.registrations.slice(workBaselineRegistrations.length)
    .every(item => productionWorkIds.has(item.work_id)),
  '024 생산 work registration은 append-only registry의 마지막 연속 구간이어야 합니다.',
);
const workRegistryBaseline = {
  ...clone(registry),
  registrations: clone(workBaselineRegistrations),
  registry_receipt: workBaselineRegistrations.at(-1)?.receipt ?? null,
};

function validateProductionQueue(value, options = {}) {
  return validateProductionQueueRaw(value, {itemRegistry: registry, ...options});
}

function validateWorkQueue(value, itemRegistry) {
  return validateProductionQueueRaw(value, {...publicationEvidence, itemRegistry});
}

function plannedAuthorityWork({
  workId = 'reader-backfill-crime-victim-wave1',
} = {}) {
  const contract = PRODUCTION_WORK_CONTRACTS[workId];
  assert.ok(contract, `회귀시험 production work contract 누락: ${workId}`);
  const value = clone(workQueueBaseline);
  value.items.push({
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
    official_url_check: {status: 'pending', referenced_count: 0},
    source_freshness: {status: 'pending', mismatch_count: 0},
    integration_checks: clone(contract.integration_checks),
  });
  return refreshSummary(value);
}

function appendWorkRegistrations(value) {
  return appendQueueItemRegistrations(workRegistryBaseline, value);
}

const authorityEvidenceFixtures = createAuthorityEvidenceFixtures();
const evidenceArtifactFixtures = new Map([
  ['canonical-url-regression', Buffer.from('canonical url regression fixture', 'utf8')],
  ['official-url-check', Buffer.from('official url check fixture', 'utf8')],
  ['responsive-smoke', Buffer.from('responsive smoke fixture', 'utf8')],
  ['keyboard-reading-path', Buffer.from('keyboard reading path fixture', 'utf8')],
  ['fragment-state-restore', Buffer.from('fragment state restore fixture', 'utf8')],
  ['search-hub-sitemap-200', Buffer.from('search hub sitemap fixture', 'utf8')],
]);
const sourceEvidencePrNumber = '903';
const sourceEvidenceHead = 'e'.repeat(40);
const sourceEvidenceMergeCommit = '5'.repeat(40);
const sourceEvidenceRepository = 'parkkyusang/liale-rulelink-ir';
const sourcePr4Head = authorityEvidenceFixtures.authorityDbValue.upstream.pr4_sha;
const sourcePr3P2Head = authorityEvidenceFixtures.authorityDbValue.upstream.pr3_p2_sha;
const sourceCiWorkflowId = 2400;
const sourceCiCheckRunId = 2401;
const sourceCiRunId = 2402;
const sourceCiJobId = 2403;
const sourceCiRunHead = '6'.repeat(40);

function authoritySourceCiApiFixture(url) {
  const attestation = authorityEvidenceFixtures.authorityDbValue.source_ci_attestation;
  if (
    url.includes(`/commits/${sourceEvidenceHead}/check-runs?`) &&
    url.includes(`check_name=${encodeURIComponent(attestation.check_name)}`)
  ) {
    return {
      total_count: 1,
      check_runs: [{
        id: sourceCiCheckRunId,
        name: attestation.check_name,
        head_sha: sourceEvidenceHead,
        status: attestation.required_status,
        conclusion: attestation.required_conclusion,
        completed_at: '2026-07-23T18:30:00Z',
        app: {slug: attestation.required_app_slug},
        details_url:
          `https://github.com/${sourceEvidenceRepository}/actions/runs/${sourceCiRunId}`,
      }],
    };
  }
  if (url.endsWith(`/actions/runs/${sourceCiRunId}`)) {
    return {
      id: sourceCiRunId,
      workflow_id: sourceCiWorkflowId,
      head_sha: sourceCiRunHead,
      status: attestation.required_status,
      conclusion: attestation.required_conclusion,
      event: attestation.required_event,
      path: attestation.workflow_path,
      pull_requests: [{
        number: Number(sourceEvidencePrNumber),
        head: {sha: sourceEvidenceHead},
      }],
    };
  }
  if (url.endsWith(`/actions/workflows/${sourceCiWorkflowId}`)) {
    return {
      id: sourceCiWorkflowId,
      path: attestation.workflow_path,
      state: 'active',
    };
  }
  if (url.endsWith(`/actions/runs/${sourceCiRunId}/jobs?per_page=100`)) {
    return {
      jobs: [{
        id: sourceCiJobId,
        run_id: sourceCiRunId,
        head_sha: sourceCiRunHead,
        name: `${attestation.check_name}-runner`,
        status: attestation.required_status,
        conclusion: attestation.required_conclusion,
        labels: attestation.runner_labels,
      }],
    };
  }
  return null;
}

function authoritySourceContentsPayload(repositoryPath, commitSha, fileOverrides = new Map()) {
  const attestation = authorityEvidenceFixtures.authorityDbValue.source_ci_attestation;
  const provenance = authorityEvidenceFixtures.authorityDbValue.provenance;
  if (
    repositoryPath === attestation.workflow_path &&
    [
      AUTHORITY_EVIDENCE_TRUSTED_PRODUCER_COMMIT_SHA,
      sourceCiRunHead,
    ].includes(commitSha)
  ) {
    return fileOverrides.get(`${commitSha}:${repositoryPath}`) ||
      fileOverrides.get(repositoryPath) ||
      sourceCiWorkflowPayload;
  }
  if (
    repositoryPath === provenance.producer_contract_path &&
    commitSha === provenance.producer_source_commit_sha
  ) {
    return fileOverrides.get(`${commitSha}:${repositoryPath}`) ||
      fileOverrides.get(repositoryPath) ||
      producerContractPayload;
  }
  assert.ok(
    [
      sourceEvidenceHead,
      sourceEvidenceMergeCommit,
      AUTHORITY_EVIDENCE_TRUSTED_PRODUCER_COMMIT_SHA,
    ].includes(commitSha),
    `authority source artifact는 승인 PR head·병합 commit 또는 결박된 생산자 commit에서만 읽습니다: ${commitSha}`,
  );
  return fileOverrides.get(`${commitSha}:${repositoryPath}`) ||
    fileOverrides.get(repositoryPath) ||
    authorityEvidenceFixtures.approvedFiles.get(repositoryPath);
}

function authorityEvidenceRef(filename, payload) {
  return [
    `github-artifact:${sourceEvidenceRepository}#${sourceEvidencePrNumber}@${sourceEvidenceHead}:`,
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${filename}`,
    `@sha256:${rawSha256(payload)}`,
  ].join('');
}

function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sourceMaintenancePullFixture(url) {
  const matched = /\/pulls\/(3|4|903)$/u.exec(url);
  assert.ok(matched, `알 수 없는 source-maintenance PR fixture: ${url}`);
  const headByPr = {
    3: sourcePr3P2Head,
    4: sourcePr4Head,
    903: sourceEvidenceHead,
  };
  return {
    merged_at: '2026-07-23T00:00:00Z',
    head: {
      sha: headByPr[matched[1]],
      repo: {full_name: sourceEvidenceRepository},
    },
    changed_files: matched[1] === sourceEvidencePrNumber
      ? AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS.length
      : 1,
    merge_commit_sha:
      matched[1] === '4'
        ? '1'.repeat(40)
        : matched[1] === sourceEvidencePrNumber
          ? sourceEvidenceMergeCommit
          : '2'.repeat(40),
  };
}

function authoritySourceFetchFixture({
  fileOverrides = new Map(),
  sourceMerged = true,
  comparison = {status: 'ahead', ahead_by: 1},
  upstreamComparisons = new Map(),
} = {}) {
  return async url => {
    const sourceCiResponse = authoritySourceCiApiFixture(url);
    if (sourceCiResponse) return sourceCiResponse;
    if (url.endsWith(`/pulls/${sourceEvidencePrNumber}/files?per_page=100`)) {
      return AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS.map(
        filename => ({filename, status: 'added'}),
      );
    }
    const contentsMatch =
      /repos\/parkkyusang\/liale-rulelink-ir\/contents\/([^?]+)\?ref=([0-9a-f]{40})$/u.exec(url);
    if (contentsMatch) {
      const repositoryPath = contentsMatch[1]
        .split('/')
        .map(decodeURIComponent)
        .join('/');
      const payload = authoritySourceContentsPayload(
        repositoryPath,
        contentsMatch[2],
        fileOverrides,
      );
      assert.ok(payload, `지원하지 않는 authority source artifact fixture: ${repositoryPath}`);
      return githubContentsFixture(repositoryPath, payload);
    }
    const compareMatch =
      /repos\/parkkyusang\/liale-rulelink-ir\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/u.exec(
        url,
      );
    if (compareMatch) {
      assert.equal(compareMatch[2], sourceEvidenceHead);
      if (
        compareMatch[1] ===
        authorityEvidenceFixtures.authorityDbValue.provenance.generator_source_commit_sha
      ) {
        return comparison;
      }
      if (['1'.repeat(40), '2'.repeat(40)].includes(compareMatch[1])) {
        return upstreamComparisons.get(compareMatch[1]) || {status: 'ahead', ahead_by: 2};
      }
      assert.fail(`지원하지 않는 authority source compare fixture: ${url}`);
    }
    const pull = await sourceMaintenancePullFixture(url);
    if (url.endsWith(`/pulls/${sourceEvidencePrNumber}`) && !sourceMerged) {
      return {...pull, merged_at: null};
    }
    return pull;
  };
}

function publicationEvidenceRef(snapshotId = bundle.snapshot_id) {
  const status = buildPublicationStatusFromBundle(bundle);
  return [
    `publication:${snapshotId}`,
    `status-sha256:${topicReceipt(status)}`,
    `bundle-sha256:${topicReceipt(bundle)}`,
  ].join('@');
}

function satisfyWorkGates(item) {
  const evidenceByGate = {
    'publication.snapshot-023-released':
      publicationEvidenceRef(),
    'source-maintenance.db-pr-4':
      `parkkyusang/liale-rulelink-ir#4@${sourcePr4Head}`,
    'source-maintenance.db-pr-3-p2':
      `parkkyusang/liale-rulelink-ir#3@${sourcePr3P2Head}`,
    'authority-db.regenerated':
      authorityEvidenceRef(
        AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
        authorityEvidenceFixtures.authorityDbPayload,
      ),
    'authority-db.citation-audit-approved':
      authorityEvidenceRef(
        AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation,
        authorityEvidenceFixtures.citationPayload,
      ),
    'quality.authority-reading-unit-schema':
      `parkkyusang/rulelink-public-web#901@${'6'.repeat(40)}`,
    'runtime.statute-reading-ui':
      `parkkyusang/rulelink-public-web#902@${'7'.repeat(40)}`,
    'wave1.crime-victim-complete':
      `work:reader-backfill-crime-victim-wave1@migration_required:${'8'.repeat(64)}`,
  };
  for (const gate of item.prerequisite_gates) {
    gate.status = 'satisfied';
    gate.evidence_ref = evidenceByGate[gate.gate_id];
  }
}

function completeWorkSourceChecks(item) {
  const contract = PRODUCTION_WORK_CONTRACTS[item.work_id];
  item.official_url_check = {
    status: 'passed',
    referenced_count: contract.counts.sources,
  };
  item.source_freshness = {
    status: 'current',
    mismatch_count: 0,
  };
}

async function verifiedEvidenceFor(value, itemRegistry = null) {
  return verifyProductionQueueExternalEvidence(value, {
    registry: itemRegistry,
    fetchJson: async url => {
      if (url.endsWith('/publication.json')) return buildPublicationStatusFromBundle(bundle);
      const sourceCiResponse = authoritySourceCiApiFixture(url);
      if (sourceCiResponse) return sourceCiResponse;
      if (url.endsWith(`/pulls/${sourceEvidencePrNumber}/files?per_page=100`)) {
        return AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS.map(
          filename => ({filename, status: 'added'}),
        );
      }
      const contentsMatch =
        /repos\/parkkyusang\/liale-rulelink-ir\/contents\/([^?]+)\?ref=([0-9a-f]{40})$/u.exec(url);
      if (contentsMatch) {
        const repositoryPath = contentsMatch[1]
          .split('/')
          .map(decodeURIComponent)
          .join('/');
        const payload = authoritySourceContentsPayload(repositoryPath, contentsMatch[2]);
        assert.ok(payload, `지원하지 않는 authority source artifact fixture: ${repositoryPath}`);
        return githubContentsFixture(repositoryPath, payload);
      }
      const compareMatch =
        /repos\/parkkyusang\/liale-rulelink-ir\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/u.exec(
          url,
        );
      if (compareMatch) {
        assert.equal(compareMatch[2], sourceEvidenceHead);
        if (
          compareMatch[1] ===
          authorityEvidenceFixtures.authorityDbValue.provenance.generator_source_commit_sha
        ) {
          return {status: 'ahead', ahead_by: 1};
        }
        if (['a'.repeat(40), 'b'.repeat(40)].includes(compareMatch[1])) {
          return {status: 'ahead', ahead_by: 2};
        }
        assert.fail(`지원하지 않는 source ancestry fixture: ${url}`);
      }
      const match = /repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/u.exec(url);
      assert.ok(match, `알 수 없는 외부 조회 fixture: ${url}`);
      const [, repository, prNumber] = match;
      const byPull = {
        'parkkyusang/liale-rulelink-ir#4': {
          head: sourcePr4Head,
          merge: 'a'.repeat(40),
        },
        'parkkyusang/liale-rulelink-ir#3': {
          head: sourcePr3P2Head,
          merge: 'b'.repeat(40),
        },
        [`parkkyusang/liale-rulelink-ir#${sourceEvidencePrNumber}`]: {
          head: sourceEvidenceHead,
          merge: '5'.repeat(40),
        },
        'parkkyusang/rulelink-public-web#901': {
          head: 'c'.repeat(40),
          merge: '6'.repeat(40),
        },
        'parkkyusang/rulelink-public-web#902': {
          head: 'd'.repeat(40),
          merge: '7'.repeat(40),
        },
      };
      const fixture = byPull[`${repository}#${prNumber}`];
      assert.ok(fixture, `알 수 없는 PR fixture: ${repository}#${prNumber}`);
      return {
        merged_at: '2026-07-23T00:00:00Z',
        head: {
          sha: fixture.head,
          repo: {full_name: repository},
        },
        merge_commit_sha: fixture.merge,
        changed_files:
          repository === sourceEvidenceRepository &&
          prNumber === sourceEvidencePrNumber
            ? AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS.length
            : 1,
      };
    },
    readFile: async (filePath, ...args) => {
      const normalized = String(filePath).replaceAll('\\', '/');
      for (const [artifactId, payload] of evidenceArtifactFixtures) {
        if (normalized.endsWith(`/${artifactId}.json`)) return payload;
      }
      return readFile(filePath, ...args);
    },
    execFile: async () => ({stdout: '', stderr: ''}),
  });
}

async function appendVerifiedGates(itemRegistry, value) {
  const verifiedEvidence = await verifiedEvidenceFor(value, itemRegistry);
  return appendPrerequisiteGateReceipts(itemRegistry, value, {verifiedEvidence});
}

function migrationEvidence(value, overrides = {}) {
  const item = value.items.find(entry => entry.pr_number === 166);
  return {
    exists: true,
    is_ancestor: true,
    is_first_parent_ancestor: true,
    is_head: false,
    evidence_is_direct_first_parent_child: true,
    shallow: false,
    evidence_commit_sha: 'e'.repeat(40),
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
  const migrationCommits = new Map(publicationEvidence.migrationCommits ?? []);
  migrationCommits.set(item.migration_commit_sha, migrationEvidence(value, overrides));
  return {
    ...publicationEvidence,
    migrationCommits,
  };
}

function completeExistingRevision(status = 'integrated', integrationMode = 'exact') {
  const value = clone(queue);
  const item = value.items.find(entry => entry.pr_number === 166);
  clearPublicationCompletion(item);
  item.status = status;
  item.integration_order = null;
  item.integrated_snapshot_id = bundle.snapshot_id;
  item.migration_commit_sha = testMigrationCommitSha;
  item.absorbed_head_sha = item.head_sha;
  item.topic_receipt = publicationEvidence.topicReceipts.get(item.topic_file);
  item.integration_mode = integrationMode;
  return refreshSummary(value);
}

function clearPublicationCompletion(item) {
  for (const field of publicationCompletionFields) delete item[field];
  delete item.terminal_reason_ko;
  item.integration_order = null;
}

test('현재 생산 대기열은 실제 current 공개 정본·역할·의존성 계약을 만족한다', () => {
  assert.deepEqual(validateProductionQueue(queue, {publishedBundle: bundle, ...publicationEvidence}), []);
  assert.deepEqual(compareQueueCurrentPublication(queue, bundle), []);
  const {live_parity: _liveParity, ...queuePublication} = queue.current_publication;
  assert.deepEqual(deriveCurrentPublication(bundle), queuePublication);
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

test('학교폭력 #153 상태는 current 공개 여부와 일치한다', () => {
  assert.equal(queue.items.some(item => item.pr_number === 103), false);
  const item = queue.items.find(value => value.pr_number === 153);
  assert.ok(item);
  assert.equal(item.head_sha, 'f78d4002ef9e223156dc92425c8d047bb82a5604');
  assert.deepEqual(item.supersedes_prs, [103]);
  assert.equal(item.source_freshness.status, 'current');
  assert.equal(item.integration_order, null);
  assert.deepEqual(item.integrate_requires, ['current_bundle', 'new_immutable_snapshot', 'migrate_publication']);
  const publishedHubIds = new Set((bundle.knowledge?.topic_hubs || bundle.topic_hubs).map(hub => hub.hub_id));
  assert.equal(
    item.status,
    publishedHubIds.has('hub.school-violence') ? 'integrated' : 'merged_pending_publication',
  );
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
  assert.ok(OWNER_ROLE_CONTRACTS.migrate_publication.owned_paths.includes('README.md'));
  assert.ok(OWNER_ROLE_CONTRACTS.migrate_publication.owned_paths.includes('artifacts/publication/concepts/*.json'));
  assert.ok(OWNER_ROLE_CONTRACTS.migrate_publication.owned_paths.includes('artifacts/publication/concepts/manifest.json'));
  assert.ok(OWNER_ROLE_CONTRACTS.migrate_publication.owned_paths.includes('artifacts/publication/production-queue.json'));
  assert.ok(OWNER_ROLE_CONTRACTS.migrate_publication.owned_paths.includes('artifacts/publication/production-queue-registry.json'));
  assert.equal(queue.items.find(item => item.pr_number === 166).test_file, 'web/rulelink_public_next/scripts/money-guarantee-topic-backfill.test.mjs');
  const invalid = clone(queue);
  invalid.items[0].owner_role = 'unknown_role';
  assert.ok(validateProductionQueue(invalid).some(error => error.includes('owner_role')));
});

test('역할별 WIP 1과 같은 topic_file의 활성 중복 소유를 차단한다', () => {
  const activeItems = queue.items.filter(item => (
    ['pr_open', 'ready_for_integration', 'needs_rework', 'migration_required', 'blocked'].includes(item.status)
  ));
  assert.ok(activeItems.length >= 2, '활성 항목 회귀시험에 사용할 대기열 항목이 부족합니다.');

  const wip = clone(queue);
  const sameOwner = activeItems.filter(item => item.owner_role === activeItems[0].owner_role);
  assert.ok(sameOwner.length >= 2, '같은 역할의 WIP 회귀시험 항목이 부족합니다.');
  wip.items.find(item => item.queue_id === sameOwner[0].queue_id).status = 'in_progress';
  wip.items.find(item => item.queue_id === sameOwner[1].queue_id).status = 'in_progress';
  assert.ok(validateProductionQueue(wip).some(error => error.includes('동시 진행 항목 2개')));

  const duplicate = clone(queue);
  duplicate.items.find(item => item.queue_id === activeItems[0].queue_id).topic_file =
    duplicate.items.find(item => item.queue_id === activeItems[1].queue_id).topic_file;
  assert.ok(validateProductionQueue(duplicate).some(error => error.includes('활성 topic_file 중복')));

  const pendingClaim = clone(queue);
  const pending = pendingClaim.items.find(item => item.queue_id === activeItems[0].queue_id);
  const competing = pendingClaim.items.find(item => item.queue_id === activeItems[1].queue_id);
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
  assert.equal(updated.current_publication.snapshot_id, bundle.snapshot_id);
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
    assert.equal(result.current_publication.snapshot_id, bundle.snapshot_id);
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

  const staleQueue = clone(queue);
  const publishedNewTopic = staleQueue.items.find(item => (
    item.change_mode === 'new_topic'
    && item.status === 'integrated'
    && bundle.knowledge.topic_hubs.some(hub => hub.hub_id === item.topic_id)
  ));
  assert.ok(publishedNewTopic);
  publishedNewTopic.status = 'merged_pending_publication';
  refreshSummary(staleQueue);
  assert.ok(validateProductionQueue(staleQueue, {publishedBundle: bundle}).some(error => error.includes('integrated로 전환해야 합니다')));
});

test('기존 정본 백필 #166은 직접 병합이 아닌 publication migration으로만 등록한다', () => {
  const item = queue.items.find(value => value.pr_number === 166);
  assert.ok(item);
  assert.ok(['migration_required', 'integrated', 'superseded'].includes(item.status));
  assert.equal(item.owner_role, 'content_production');
  assert.equal(item.change_mode, 'existing_topic_revision');
  assert.equal(item.direct_merge, false);
  assert.deepEqual(item.integrate_requires, ['current_bundle', 'new_immutable_snapshot', 'migrate_publication']);
  assert.equal(item.head_sha, '237bff8a1a8c58ad3961f215236bc3f3df0d3197');
  if (['integrated', 'superseded'].includes(item.status)) {
    assert.equal(item.integrated_snapshot_id, bundle.snapshot_id);
    assert.equal(item.absorbed_head_sha, item.head_sha);
    assert.equal(item.topic_receipt, publicationEvidence.topicReceipts.get(item.topic_file));
  }

  const invalid = clone(queue);
  const invalidItem = invalid.items.find(value => value.pr_number === 166);
  clearPublicationCompletion(invalidItem);
  invalidItem.status = 'migration_required';
  invalidItem.direct_merge = true;
  refreshSummary(invalid);
  assert.ok(validateProductionQueue(invalid).some(error => error.includes('direct_merge=false')));
});

test('#169와 #171도 기존 정본 직접 병합 없이 publication migration lifecycle을 사용한다', () => {
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
    assert.ok(['migration_required', 'integrated', 'superseded'].includes(item.status));
    assert.equal(item.change_mode, 'existing_topic_revision');
    assert.equal(item.direct_merge, false);
    assert.equal(item.head_sha, fixture.head);
    assert.equal(item.topic_id, fixture.topic);
    assert.equal(item.test_file, fixture.testFile);
    assert.deepEqual(item.integrate_requires, ['current_bundle', 'new_immutable_snapshot', 'migrate_publication']);
    if (['integrated', 'superseded'].includes(item.status)) {
      assert.equal(item.integrated_snapshot_id, bundle.snapshot_id);
      assert.equal(item.absorbed_head_sha, item.head_sha);
      assert.equal(item.topic_receipt, publicationEvidence.topicReceipts.get(item.topic_file));
    }
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
  const publishedHubIds = new Set((bundle.knowledge?.topic_hubs || bundle.topic_hubs).map(hub => hub.hub_id));
  assert.equal(
    replacement.status,
    publishedHubIds.has(replacement.topic_id) ? 'integrated' : 'ready_for_integration',
  );
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

  const registration = registry.registrations.find(
    entry => entry.queue_id === 'publication-pr-174',
  );
  assert.equal(registration.sequence, 24);
  assert.equal(registration.queue_id, 'publication-pr-174');
  assert.equal(
    registration.previous_receipt,
    registry.registrations[registration.sequence - 2].receipt,
  );
  assert.equal(
    registry.registrations[registration.sequence].previous_receipt,
    registration.receipt,
  );
  assert.equal(registry.registrations.at(-1).receipt, registry.registry_receipt);

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
    clearPublicationCompletion(item);
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
    clearPublicationCompletion(item);
    item.status = status;
    if (status === 'ready_for_integration') item.integration_order = 1;
    refreshSummary(value);
    assert.ok(validateProductionQueue(value).some(error => error.includes('topic-only 공개 승격 상태')), status);
  }

  const withdrawn = clone(queue);
  const item = withdrawn.items.find(entry => entry.pr_number === 166);
  clearPublicationCompletion(item);
  item.status = 'withdrawn';
  item.terminal_reason_ko = '생산자가 개정을 철회했습니다.';
  refreshSummary(withdrawn);
  assert.deepEqual(validateProductionQueue(
    withdrawn,
    {publishedBundle: bundle, ...publicationEvidence},
  ), []);
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
      ...completedPublicationEvidence(value, {is_first_parent_ancestor: false}),
    },
  ).some(error => error.includes('현재 HEAD의 first-parent 이력에 있어야 합니다')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {is_head: true}),
    },
  ).some(error => error.includes('후속 커밋보다 앞선 데이터 이관 커밋')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {
        evidence_is_direct_first_parent_child: false,
      }),
    },
  ).some(error => error.includes('migration_commit_sha의 직접 first-parent 자식이어야 합니다')));

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

  assert.deepEqual(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {
        changed_files: [
          ...migrationEvidence(value).changed_files,
          'README.md',
          'artifacts/publication/concepts/inheritance.json',
          'artifacts/publication/concepts/manifest.json',
        ],
      }),
    },
  ), []);

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {evidence_changed_files: []}),
    },
  ).some(error => error.includes('production-queue.json을 변경하는 queue 증거 커밋이어야 합니다')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {evidence_commit_count: 2}),
    },
  ).some(error => error.includes('첫 queue 증거까지는 정확히 1개 커밋이어야 합니다')));

  assert.ok(validateProductionQueue(
    value,
    {
      publishedBundle: bundle,
      ...completedPublicationEvidence(value, {evidence_merge_commits: ['c'.repeat(40)]}),
    },
  ).some(error => error.includes('첫 queue 증거 커밋은 merge 커밋일 수 없습니다')));

  const forbiddenEvidenceFiles = [
    value.items.find(item => item.pr_number === 166).topic_file,
    'README.md',
    'artifacts/publication/current/bundle.json',
    'artifacts/publication/topics/manifest.json',
    'artifacts/publication/concepts/inheritance.json',
    'artifacts/publication/concepts/manifest.json',
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
    ).some(error => error.includes(`첫 queue 증거 커밋이 허용되지 않은 파일을 변경했습니다: ${forbiddenFile}`)));
  }

  assert.match(workflow, /uses:\s*actions\/checkout@v4[\s\S]*?fetch-depth:\s*0/u);
  assert.equal(
    workflow.match(/artifacts\/publication\/production-queue-registry\.json/gu)?.length,
    2,
    'registry-only 변경도 pull_request와 main push 검증 workflow를 실행해야 합니다.',
  );
});

test('실제 Git의 첫 후속 queue 증거만 고정하고 이후 정상 개발은 과거 증거를 바꾸지 않는다', async () => {
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
    await writeRepoFile('artifacts/publication/concepts/inheritance.json', '{"revision":1}\n');
    await writeRepoFile('artifacts/publication/concepts/manifest.json', '{"revision":1}\n');
    await writeRepoFile(snapshotFile, '{"revision":1}\n');
    await git(['add', '--', item.topic_file, 'artifacts/publication/current/bundle.json', 'artifacts/publication/topics/manifest.json', 'artifacts/publication/concepts/inheritance.json', 'artifacts/publication/concepts/manifest.json', snapshotFile]);
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
    assert.equal(validEvidence.is_first_parent_ancestor, true);
    assert.equal(validEvidence.is_head, false);
    assert.equal(validEvidence.evidence_is_direct_first_parent_child, true);
    assert.deepEqual(new Set(validEvidence.evidence_changed_files), new Set([
      'artifacts/publication/production-queue.json',
      'artifacts/publication/production-queue-registry.json',
    ]));
    assert.deepEqual(validateProductionQueue(
      value,
      {publishedBundle: bundle, ...completedPublicationEvidence(value, validEvidence)},
    ), []);

    await writeRepoFile(item.topic_file, '{"revision":2}\n');
    await git(['add', '--', item.topic_file]);
    await git(['commit', '-m', 'later topic revision']);
    const evidenceAfterLaterDevelopment = await inspectMigrationCommit(dataCommit, {runGit: git});
    assert.equal(
      evidenceAfterLaterDevelopment.evidence_commit_sha,
      validEvidence.evidence_commit_sha,
    );
    assert.deepEqual(
      evidenceAfterLaterDevelopment.evidence_changed_files,
      validEvidence.evidence_changed_files,
    );
    assert.deepEqual(validateProductionQueue(
      value,
      {
        publishedBundle: bundle,
        ...completedPublicationEvidence(value, evidenceAfterLaterDevelopment),
      },
    ), []);

    await git(['checkout', '-b', 'invalid-first-evidence', dataCommit]);
    await writeRepoFile('artifacts/publication/production-queue.json', '{"evidence":2}\n');
    await writeRepoFile('artifacts/publication/production-queue-registry.json', '{"evidence":2}\n');
    await writeRepoFile(item.topic_file, '{"revision":3}\n');
    await git([
      'add',
      '--',
      'artifacts/publication/production-queue.json',
      'artifacts/publication/production-queue-registry.json',
      item.topic_file,
    ]);
    await git(['commit', '-m', 'invalid mixed evidence']);
    const invalidEvidence = await inspectMigrationCommit(dataCommit, {runGit: git});
    assert.ok(validateProductionQueue(
      value,
      {publishedBundle: bundle, ...completedPublicationEvidence(value, invalidEvidence)},
    ).some(error => error.includes(`첫 queue 증거 커밋이 허용되지 않은 파일을 변경했습니다: ${item.topic_file}`)));

    await git(['checkout', '-b', 'invalid-merge-base', dataCommit]);
    await git(['checkout', '-b', 'invalid-merge-side', dataCommit]);
    await writeRepoFile('docs/merge-only-forbidden.md', 'forbidden\n');
    await git(['add', '--', 'docs/merge-only-forbidden.md']);
    await git(['commit', '-m', 'forbidden side commit']);
    await git(['checkout', 'invalid-merge-base']);
    await git(['merge', '--no-ff', 'invalid-merge-side', '-m', 'forbidden evidence merge']);
    const mergeEvidence = await inspectMigrationCommit(dataCommit, {runGit: git});
    const mergeErrors = validateProductionQueue(
      value,
      {publishedBundle: bundle, ...completedPublicationEvidence(value, mergeEvidence)},
    );
    assert.ok(mergeErrors.some(error => error.includes('첫 queue 증거 커밋은 merge 커밋일 수 없습니다')));
    assert.ok(mergeErrors.some(error => error.includes('docs/merge-only-forbidden.md')));
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('side-branch PR head는 이관 커밋이 아니며 first-parent 통합 merge 커밋만 허용한다', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rulelink-side-branch-migration-'));
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
    const mainBranch = String((await git(['branch', '--show-current'])).stdout).trim();

    await git(['checkout', '-b', 'migration-side']);
    const snapshotFile = `artifacts/publication/snapshots/${bundle.snapshot_id}/bundle.json`;
    await writeRepoFile(item.topic_file, '{"revision":1}\n');
    await writeRepoFile('artifacts/publication/current/bundle.json', '{"revision":1}\n');
    await writeRepoFile('artifacts/publication/topics/manifest.json', '{"revision":1}\n');
    await writeRepoFile(snapshotFile, '{"revision":1}\n');
    await git([
      'add',
      '--',
      item.topic_file,
      'artifacts/publication/current/bundle.json',
      'artifacts/publication/topics/manifest.json',
      snapshotFile,
    ]);
    await git(['commit', '-m', 'side branch migration payload']);
    const sideBranchHead = String((await git(['rev-parse', 'HEAD'])).stdout).trim();

    await git(['checkout', mainBranch]);
    await writeRepoFile('docs/main-line.md', 'main line\n');
    await git(['add', '--', 'docs/main-line.md']);
    await git(['commit', '-m', 'main line development']);
    await git(['merge', '--no-ff', 'migration-side', '-m', 'integrate migration payload']);
    const integrationCommit = String((await git(['rev-parse', 'HEAD'])).stdout).trim();

    await writeRepoFile('artifacts/publication/production-queue.json', '{"evidence":1}\n');
    await writeRepoFile('artifacts/publication/production-queue-registry.json', '{"evidence":1}\n');
    await git([
      'add',
      '--',
      'artifacts/publication/production-queue.json',
      'artifacts/publication/production-queue-registry.json',
    ]);
    await git(['commit', '-m', 'queue evidence']);

    item.migration_commit_sha = sideBranchHead;
    const sideBranchEvidence = await inspectMigrationCommit(sideBranchHead, {runGit: git});
    assert.equal(sideBranchEvidence.is_ancestor, true);
    assert.equal(sideBranchEvidence.is_first_parent_ancestor, false);
    assert.ok(validateProductionQueue(
      value,
      {
        publishedBundle: bundle,
        ...completedPublicationEvidence(value, sideBranchEvidence),
      },
    ).some(error => error.includes('현재 HEAD의 first-parent 이력에 있어야 합니다')));

    item.migration_commit_sha = integrationCommit;
    const integrationEvidence = await inspectMigrationCommit(integrationCommit, {runGit: git});
    assert.equal(integrationEvidence.is_ancestor, true);
    assert.equal(integrationEvidence.is_first_parent_ancestor, true);
    assert.equal(integrationEvidence.evidence_is_direct_first_parent_child, true);
    assert.deepEqual(new Set(integrationEvidence.changed_files), new Set([
      item.topic_file,
      'artifacts/publication/current/bundle.json',
      'artifacts/publication/topics/manifest.json',
      snapshotFile,
    ]));
    assert.deepEqual(validateProductionQueue(
      value,
      {
        publishedBundle: bundle,
        ...completedPublicationEvidence(value, integrationEvidence),
      },
    ), []);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('기존 주제 개정의 integrated 증거는 current와 immutable snapshot의 동일 합성을 요구한다', () => {
  const value = completeExistingRevision();
  const wrongSnapshotId = completeExistingRevision();
  wrongSnapshotId.items.find(entry => entry.pr_number === 166).integrated_snapshot_id = `${bundle.snapshot_id}-wrong`;
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

test('PR 전 planned 작업은 불변 work_id로 등록하고 PR 번호·head를 요구하지 않는다', () => {
  const value = plannedAuthorityWork();
  const workRegistry = appendWorkRegistrations(value);
  assert.deepEqual(
    validateWorkQueue(value, workRegistry),
    [],
  );
  const registration = workRegistry.registrations.at(-1);
  assert.equal(registration.work_id, 'reader-backfill-crime-victim-wave1');
  assert.equal(registration.pr_number, undefined);
  assert.equal(registration.queue_id, 'publication-work-reader-backfill-crime-victim-wave1');
});

test('planned 작업은 source-maintenance 영수증 없이 근거 검증 완료를 자기신고할 수 없다', () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  item.official_url_check = {
    status: 'passed',
    referenced_count: PRODUCTION_WORK_CONTRACTS[item.work_id].counts.sources,
  };
  item.source_freshness = {status: 'current', mismatch_count: 0};
  refreshSummary(value);
  const workRegistry = appendWorkRegistrations(value);
  const errors = validateWorkQueue(value, workRegistry);
  assert.ok(errors.filter(error => error.includes('source_maintenance')).length >= 2);
});

test('planned 이후에는 모든 구조화 선행 게이트가 증거와 함께 충족되어야 한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  item.status = 'claimed';
  refreshSummary(value);
  const workRegistry = appendWorkRegistrations(value);
  assert.ok(
    validateWorkQueue(value, workRegistry)
      .some(error => error.includes('모든 선행 게이트가 충족되기 전 claimed')),
  );

  satisfyWorkGates(item);
  const gatedRegistry = await appendVerifiedGates(workRegistry, value);
  assert.deepEqual(
    validateWorkQueue(value, gatedRegistry),
    [],
  );
});

test('pending gate는 blocked·needs_rework 기록을 허용하지만 claimed·pr_open 진입은 차단한다', () => {
  for (const status of ['blocked', 'needs_rework']) {
    const value = plannedAuthorityWork();
    const item = value.items.at(-1);
    item.status = status;
    item.blocking_reason_ko = 'authority 선행 게이트 미완료';
    refreshSummary(value);
    const workRegistry = appendWorkRegistrations(value);
    assert.deepEqual(validateWorkQueue(value, workRegistry), []);
  }

  const claimed = plannedAuthorityWork();
  claimed.items.at(-1).status = 'claimed';
  refreshSummary(claimed);
  const claimedRegistry = appendWorkRegistrations(claimed);
  assert.ok(
    validateWorkQueue(claimed, claimedRegistry)
      .some(error => error.includes('모든 선행 게이트가 충족되기 전 claimed')),
  );
});

test('외부 PR 게이트는 저장소·PR·감사 head가 모두 있는 증거만 수락한다', () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  satisfyWorkGates(item);
  item.prerequisite_gates.find(gate => gate.gate_kind === 'external_pr').evidence_ref =
    'https://github.com/parkkyusang/liale-rulelink-ir/pull/4';
  const workRegistry = appendWorkRegistrations(value);
  assert.ok(
    validateWorkQueue(value, workRegistry)
      .some(error => error.includes('owner/repo#PR@40SHA')),
  );
});

test('형식상 맞는 satisfied gate도 owner 역할의 append-only 영수증 없이는 통과하지 않는다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  satisfyWorkGates(item);
  item.status = 'claimed';
  refreshSummary(value);
  const registered = appendWorkRegistrations(value);
  assert.ok(
    validateWorkQueue(value, registered)
      .some(error => error.includes('소유자 영수증이 없습니다')),
  );
  assert.throws(
    () => appendPrerequisiteGateReceipts(registered, value),
    /실제 외부 사실 검증 없이/u,
  );
  const gated = await appendVerifiedGates(registered, value);
  assert.deepEqual(validateWorkQueue(value, gated), []);

  const missingFinalReceipt = clone(gated);
  delete missingFinalReceipt.prerequisite_gate_receipt;
  assert.ok(
    validateQueueItemRegistry(missingFinalReceipt, value)
      .some(error => error.includes('선행 게이트 최종 영수증이 필요합니다')),
  );
});

test('authority 의미계약 버전이 없는 구 영수증은 재검증하고 새 버전 영수증을 append한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  satisfyWorkGates(item);
  item.status = 'claimed';
  refreshSummary(value);
  const registered = appendWorkRegistrations(value);
  const current = await appendVerifiedGates(registered, value);
  const legacy = clone(current);
  const authorityGateIds = new Set([
    'authority-db.regenerated',
    'authority-db.citation-audit-approved',
  ]);
  for (const receipt of legacy.prerequisite_gate_receipts) {
    if (authorityGateIds.has(receipt.gate_id)) {
      receipt.verification_contract = 'rulelink_authority_evidence_verification_v2';
    }
  }
  let previousReceipt = legacy.prerequisite_gate_receipts[0].previous_receipt;
  for (const receipt of legacy.prerequisite_gate_receipts) {
    receipt.previous_receipt = previousReceipt;
    const {receipt: _discarded, ...payload} = receipt;
    receipt.receipt = topicReceipt(payload);
    previousReceipt = receipt.receipt;
  }
  legacy.prerequisite_gate_receipt = previousReceipt;

  assert.equal(
    legacy.prerequisite_gate_receipts.filter(
      receipt =>
        authorityGateIds.has(receipt.gate_id) &&
        receipt.verification_contract === 'rulelink_authority_evidence_verification_v2',
    ).length,
    2,
  );
  const verifiedEvidence = await verifiedEvidenceFor(value, legacy);
  assert.equal(verifiedEvidence.gateProofs.size, 2);
  const upgraded = appendPrerequisiteGateReceipts(legacy, value, {
    previousRegistry: legacy,
    verifiedEvidence,
  });
  assert.equal(upgraded.prerequisite_gate_receipts.length, legacy.prerequisite_gate_receipts.length + 2);
  assert.equal(
    upgraded.prerequisite_gate_receipts.filter(
      receipt =>
        authorityGateIds.has(receipt.gate_id) &&
        receipt.verification_contract === AUTHORITY_EVIDENCE_VERIFICATION_CONTRACT,
    ).length,
    2,
  );
  assert.deepEqual(validateWorkQueue(value, upgraded), []);

  const calls = {fetchJson: 0, readFile: 0, execFile: 0};
  const noNewEvidence = await verifyProductionQueueExternalEvidence(value, {
    registry: upgraded,
    fetchJson: async () => {
      calls.fetchJson += 1;
      throw new Error('현재 의미계약 영수증은 다시 네트워크 조회하면 안 됩니다.');
    },
    readFile: async () => {
      calls.readFile += 1;
      throw new Error('현재 의미계약 영수증은 다시 파일을 읽으면 안 됩니다.');
    },
    execFile: async () => {
      calls.execFile += 1;
      throw new Error('현재 의미계약 영수증은 다시 Git을 실행하면 안 됩니다.');
    },
  });
  assert.equal(noNewEvidence.gateProofs.size, 0);
  assert.deepEqual(calls, {fetchJson: 0, readFile: 0, execFile: 0});
});

test('실제 PR identity는 한 번만 결박하고 정상 추가 head는 append-only 감사 이력으로 보존한다', async () => {
  const planned = plannedAuthorityWork();
  const registered = appendWorkRegistrations(planned);
  const opened = clone(planned);
  const item = opened.items.at(-1);
  satisfyWorkGates(item);
  item.status = 'pr_open';
  item.pr_number = 999;
  item.branch = 'codex/content-crime-victim-reader-backfill-20260723';
  item.head_sha = 'a'.repeat(40);
  refreshSummary(opened);

  assert.ok(
    validateWorkQueue(opened, registered)
      .some(error => error.includes('PR 결박이 registry에 없습니다')),
  );
  const gated = await appendVerifiedGates(registered, opened);
  const bound = appendQueuePrBindings(gated, opened);
  assert.ok(
    validateWorkQueue(opened, bound)
      .some(error => error.includes('현재 head 감사 영수증이 없습니다')),
  );
  const audited = appendQueueHeadReceipts(bound, opened);
  assert.deepEqual(validateWorkQueue(opened, audited), []);
  assert.equal(bound.pr_bindings.length, 1);
  assert.equal(bound.pr_bindings[0].work_id, item.work_id);
  assert.equal(bound.pr_bindings[0].pr_number, 999);
  assert.equal(audited.head_receipts.length, 1);

  const updated = clone(opened);
  updated.items.at(-1).head_sha = 'b'.repeat(40);
  const updatedRegistry = appendQueueHeadReceipts(audited, updated, {previousRegistry: audited});
  assert.deepEqual(validateWorkQueue(updated, updatedRegistry), []);
  assert.equal(updatedRegistry.head_receipts.length, 2);
  assert.equal(updatedRegistry.head_receipts[0].head_sha, 'a'.repeat(40));
  assert.equal(updatedRegistry.head_receipts[1].head_sha, 'b'.repeat(40));

  const rewrittenHistory = clone(updatedRegistry);
  rewrittenHistory.head_receipts[0].head_sha = 'c'.repeat(40);
  assert.ok(
    validateQueueItemRegistry(rewrittenHistory, updated, {previousRegistry: updatedRegistry})
      .some(error => error.includes('직전 head 영수증을 바꿀 수 없습니다')),
  );
});

test('PR 결박과 head 이력이 있으면 각 최종 영수증 필드는 필수다', async () => {
  const planned = plannedAuthorityWork();
  const opened = clone(planned);
  const item = opened.items.at(-1);
  satisfyWorkGates(item);
  item.status = 'pr_open';
  item.pr_number = 999;
  item.branch = PRODUCTION_WORK_CONTRACTS[item.work_id].branch;
  item.head_sha = 'a'.repeat(40);
  refreshSummary(opened);
  const registered = appendWorkRegistrations(planned);
  const gated = await appendVerifiedGates(registered, opened);
  const bound = appendQueuePrBindings(gated, opened);
  const audited = appendQueueHeadReceipts(bound, opened);

  const missingBindingReceipt = clone(audited);
  delete missingBindingReceipt.pr_binding_receipt;
  assert.ok(
    validateQueueItemRegistry(missingBindingReceipt, opened)
      .some(error => error.includes('PR 결박 최종 영수증이 필요합니다')),
  );
  const missingHeadReceipt = clone(audited);
  delete missingHeadReceipt.head_receipt;
  assert.ok(
    validateQueueItemRegistry(missingHeadReceipt, opened)
      .some(error => error.includes('head 최종 영수증이 필요합니다')),
  );
});

test('품질 목표는 개선 방향이어야 하고 release 완료에는 전부 통과한 증거가 필요하다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  item.quality_targets.duplicate_rule_after = 3;
  let workRegistry = appendWorkRegistrations(value);
  assert.ok(
    validateWorkQueue(value, workRegistry)
      .some(error => error.includes('duplicate_rule_after가 duplicate_rule_before보다 커질 수 없습니다')),
  );

  item.quality_targets.duplicate_rule_after = 0;
  satisfyWorkGates(item);
  completeWorkSourceChecks(item);
  item.status = 'integrated';
  item.pr_number = 999;
  item.branch = 'codex/content-crime-victim-reader-backfill-20260723';
  item.head_sha = 'a'.repeat(40);
  item.source_freshness.status = 'current';
  refreshSummary(value);
  workRegistry = await appendVerifiedGates(workRegistry, value);
  workRegistry = appendQueuePrBindings(workRegistry, value);
  assert.ok(
    validateWorkQueue(value, workRegistry)
      .some(error => error.includes('모든 release check 증거가 통과되기 전 integrated')),
  );
});

test('work_id 의존 대상 누락과 순환을 차단한다', () => {
  const value = plannedAuthorityWork();
  value.items.at(-1).depends_on_work_ids = ['missing-wave'];
  let workRegistry = appendWorkRegistrations(value);
  assert.ok(
    validateWorkQueue(value, workRegistry)
      .some(error => error.includes('선행 work_id가 대기열에 없습니다')),
  );

  const second = plannedAuthorityWork({
    workId: 'reader-backfill-debt-enforcement-wave2',
  }).items.at(-1);
  value.items.at(-1).depends_on_work_ids = [second.work_id];
  second.depends_on_work_ids = [value.items.at(-1).work_id];
  value.items.push(second);
  refreshSummary(value);
  workRegistry = appendWorkRegistrations(value);
  assert.ok(
    validateWorkQueue(value, workRegistry)
      .some(error => error.includes('work_id 의존성 순환')),
  );
});

test('Wave2는 Wave1 완료 전 claimed·in_progress·pr_open으로 진행할 수 없다', () => {
  for (const status of ['claimed', 'in_progress', 'pr_open']) {
    const value = plannedAuthorityWork();
    const wave1 = value.items.at(-1);
    const wave2 = plannedAuthorityWork({
      workId: 'reader-backfill-debt-enforcement-wave2',
    }).items.at(-1);
    satisfyWorkGates(wave2);
    wave2.status = status;
    if (status === 'pr_open') {
      wave2.pr_number = 1000;
      wave2.branch = PRODUCTION_WORK_CONTRACTS[wave2.work_id].branch;
      wave2.head_sha = 'd'.repeat(40);
    }
    value.items.push(wave2);
    refreshSummary(value);
    const workRegistry = appendWorkRegistrations(value);
    assert.ok(
      validateWorkQueue(value, workRegistry)
        .some(error => error.includes('완료되지 않은 선행 작업')),
      `${status}에서 Wave1 미완료를 차단해야 합니다.`,
    );
    assert.equal(wave1.status, 'planned');
  }
});

test('024 work contract는 필수 gate·품질 수치·release check 집합을 exact 고정한다', () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  item.prerequisite_gates.pop();
  item.quality_targets.typed_relation_after = 0;
  item.counts.authority_units = 0;
  item.release_checks.pop();
  const workRegistry = appendWorkRegistrations(value);
  const errors = validateWorkQueue(value, workRegistry);
  assert.ok(errors.some(error => error.includes('필수 게이트 집합')));
  assert.ok(errors.some(error => error.includes('quality_targets가 승인된 생산계약과 다릅니다')));
  assert.ok(errors.some(error => error.includes('counts가 승인된 생산계약과 다릅니다')));
  assert.ok(errors.some(error => error.includes('필수 운영검증 집합')));
});

test('완료 상태의 quality target은 실제 topic 측정값과 일치해야 한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  satisfyWorkGates(item);
  completeWorkSourceChecks(item);
  item.status = 'migration_required';
  item.pr_number = 999;
  item.branch = PRODUCTION_WORK_CONTRACTS[item.work_id].branch;
  item.head_sha = 'a'.repeat(40);
  refreshSummary(value);
  let workRegistry = appendWorkRegistrations(value);
  workRegistry = await appendVerifiedGates(workRegistry, value);
  workRegistry = appendQueuePrBindings(workRegistry, value);
  workRegistry = appendQueueHeadReceipts(workRegistry, value);
  const wrongMeasurements = new Map([[item.work_id, {
    counts: clone(item.counts),
    quality: {
      duplicate_rule: 0,
      blank_audience: 0,
      copied_search: 0,
      nonstandard_content_type: 0,
      typed_relation: 0,
    },
  }]]);
  assert.ok(
    validateProductionQueueRaw(value, {
      ...publicationEvidence,
      itemRegistry: workRegistry,
      workTopicMeasurements: wrongMeasurements,
    }).some(error => error.includes('실제 topic 품질 수치')),
  );
});

test('40·64자리 모양만 맞춘 외부 증거는 실제 조회 결과가 없으면 영수증으로 바뀌지 않는다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  const gate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'source-maintenance.db-pr-4',
  );
  gate.status = 'satisfied';
  gate.evidence_ref = `parkkyusang/liale-rulelink-ir#4@${'2'.repeat(40)}`;
  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      verifyReference: async () => 'f'.repeat(64),
      fetchJson: async () => ({
        merged_at: null,
        head: {sha: '2'.repeat(40)},
        merge_commit_sha: '3'.repeat(40),
      }),
    }),
    /병합되지 않은 PR/u,
  );
});

test('authority DB 증거는 PR4와 PR3-P2의 실제 충족 head보다 먼저 영수증을 발급할 수 없다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    authorityEvidenceFixtures.authorityDbPayload,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture(),
    }),
    /먼저 외부 source-maintenance PR 게이트가 충족/u,
  );
});

test('authority evidence head는 PR4와 PR3-P2의 실제 병합 commit을 모두 조상으로 가져야 한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  for (const [gateId, prNumber, head] of [
    ['source-maintenance.db-pr-4', 4, sourcePr4Head],
    ['source-maintenance.db-pr-3-p2', 3, sourcePr3P2Head],
  ]) {
    const gate = item.prerequisite_gates.find(candidate => candidate.gate_id === gateId);
    gate.status = 'satisfied';
    gate.evidence_ref = `parkkyusang/liale-rulelink-ir#${prNumber}@${head}`;
  }
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    authorityEvidenceFixtures.authorityDbPayload,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture({
        upstreamComparisons: new Map([
          ['1'.repeat(40), {status: 'diverged', ahead_by: 0}],
        ]),
      }),
    }),
    /upstream 병합 commit의 후손이 아닙니다/u,
  );
});

test('authority evidence는 PR head가 아니라 실제 병합 commit의 같은 blob까지 일치해야 한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  for (const [gateId, prNumber, head] of [
    ['source-maintenance.db-pr-4', 4, sourcePr4Head],
    ['source-maintenance.db-pr-3-p2', 3, sourcePr3P2Head],
  ]) {
    const gate = item.prerequisite_gates.find(candidate => candidate.gate_id === gateId);
    gate.status = 'satisfied';
    gate.evidence_ref = `parkkyusang/liale-rulelink-ir#${prNumber}@${head}`;
  }
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    authorityEvidenceFixtures.authorityDbPayload,
  );
  const sourceFetch = authoritySourceFetchFixture();
  const dbRepositoryPath =
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db}`;

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => {
        if (
          url.includes(`/contents/${dbRepositoryPath}`) &&
          url.endsWith(`?ref=${sourceEvidenceMergeCommit}`)
        ) {
          return githubContentsFixture(
            dbRepositoryPath,
            Buffer.from('{"schema":"forged-merge"}\n', 'utf8'),
          );
        }
        return sourceFetch(url);
      },
    }),
    /PR head와 실제 병합 commit의 산출물 바이트가 다릅니다/u,
  );
});

test('authority evidence PR의 sibling 4개도 head와 병합 commit이 모두 같아야 한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  for (const [gateId, prNumber, head] of [
    ['source-maintenance.db-pr-4', 4, sourcePr4Head],
    ['source-maintenance.db-pr-3-p2', 3, sourcePr3P2Head],
  ]) {
    const gate = item.prerequisite_gates.find(candidate => candidate.gate_id === gateId);
    gate.status = 'satisfied';
    gate.evidence_ref = `parkkyusang/liale-rulelink-ir#${prNumber}@${head}`;
  }
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    authorityEvidenceFixtures.authorityDbPayload,
  );
  const sourceFetch = authoritySourceFetchFixture();
  const citationRepositoryPath =
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation}`;

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => {
        if (
          url.includes(`/contents/${citationRepositoryPath}`) &&
          url.endsWith(`?ref=${sourceEvidenceMergeCommit}`)
        ) {
          return githubContentsFixture(
            citationRepositoryPath,
            Buffer.from('{"schema":"forged-citation-merge"}\n', 'utf8'),
          );
        }
        return sourceFetch(url);
      },
    }),
    /PR head와 실제 병합 commit의 산출물 바이트가 다릅니다/u,
  );
});

test('authority evidence PR은 승인 산출물 5개 밖의 파일을 함께 변경할 수 없다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  for (const [gateId, prNumber, head] of [
    ['source-maintenance.db-pr-4', 4, sourcePr4Head],
    ['source-maintenance.db-pr-3-p2', 3, sourcePr3P2Head],
  ]) {
    const gate = item.prerequisite_gates.find(candidate => candidate.gate_id === gateId);
    gate.status = 'satisfied';
    gate.evidence_ref = `parkkyusang/liale-rulelink-ir#${prNumber}@${head}`;
  }
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    authorityEvidenceFixtures.authorityDbPayload,
  );
  const sourceFetch = authoritySourceFetchFixture();

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => (
        url.endsWith(`/pulls/${sourceEvidencePrNumber}/files?per_page=100`)
          ? [
              ...AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS.map(
                filename => ({filename, status: 'added'}),
              ),
              {filename: 'src/manual-bypass.py', status: 'added'},
            ]
          : sourceFetch(url)
      ),
    }),
    /승인 산출물 5개만 변경/u,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => (
        url.endsWith(`/pulls/${sourceEvidencePrNumber}/files?per_page=100`)
          ? AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS.map(
              (filename, index) => index === 0
                ? {
                    filename,
                    status: 'renamed',
                    previous_filename: 'data/validation_reports/out-of-scope.json',
                  }
                : {filename, status: 'added'},
            )
          : sourceFetch(url)
      ),
    }),
    /승인 산출물 5개만 변경/u,
  );
});

test('authority evidence는 evidence head에 결박된 최신 GitHub Actions 성공 check와 전용 runner를 요구한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  for (const [gateId, prNumber, head] of [
    ['source-maintenance.db-pr-4', 4, sourcePr4Head],
    ['source-maintenance.db-pr-3-p2', 3, sourcePr3P2Head],
  ]) {
    const gate = item.prerequisite_gates.find(candidate => candidate.gate_id === gateId);
    gate.status = 'satisfied';
    gate.evidence_ref = `parkkyusang/liale-rulelink-ir#${prNumber}@${head}`;
  }
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    authorityEvidenceFixtures.authorityDbPayload,
  );
  const sourceFetch = authoritySourceFetchFixture();

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => {
        if (url.includes(`/commits/${sourceEvidenceHead}/check-runs?`)) {
          const response = await sourceFetch(url);
          response.check_runs[0].conclusion = 'failure';
          return response;
        }
        return sourceFetch(url);
      },
    }),
    /최신 GitHub Actions check가 완료·성공 상태가 아닙니다/u,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => {
        if (url.endsWith(`/actions/runs/${sourceCiRunId}/jobs?per_page=100`)) {
          const response = await sourceFetch(url);
          return {
            ...response,
            jobs: response.jobs.map(job => ({
              ...job,
              labels: ['self-hosted', 'Windows'],
            })),
          };
        }
        return sourceFetch(url);
      },
    }),
    /전용 runner labels가 정본과 다릅니다/u,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => {
        if (url.endsWith(`/actions/runs/${sourceCiRunId}`)) {
          const response = await sourceFetch(url);
          return {
            ...response,
            workflow_id: 9999,
            path: '.github/workflows/lookalike-authority-check.yml',
          };
        }
        if (url.endsWith('/actions/workflows/9999')) {
          return {
            id: 9999,
            path: '.github/workflows/lookalike-authority-check.yml',
            state: 'active',
          };
        }
        return sourceFetch(url);
      },
    }),
    /고정 workflow의 pull_request_target 실행·evidence PR head/u,
  );
});

test('authority evidence는 producer commit의 계약 원문과 evidence head의 고정 workflow 원문에 결박된다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  for (const [gateId, prNumber, head] of [
    ['source-maintenance.db-pr-4', 4, sourcePr4Head],
    ['source-maintenance.db-pr-3-p2', 3, sourcePr3P2Head],
  ]) {
    const gate = item.prerequisite_gates.find(candidate => candidate.gate_id === gateId);
    gate.status = 'satisfied';
    gate.evidence_ref = `parkkyusang/liale-rulelink-ir#${prNumber}@${head}`;
  }
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    authorityEvidenceFixtures.authorityDbPayload,
  );
  const attestation = authorityEvidenceFixtures.authorityDbValue.source_ci_attestation;
  const provenance = authorityEvidenceFixtures.authorityDbValue.provenance;

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture({
        fileOverrides: new Map([[
          attestation.workflow_path,
          Buffer.from('name: forged-authority-workflow\n', 'utf8'),
        ]]),
      }),
    }),
    /source CI workflow 원문 해시/u,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture({
        fileOverrides: new Map([[
          provenance.producer_contract_path,
          Buffer.from('{"contract":"forged"}\n', 'utf8'),
        ]]),
      }),
    }),
    /producer contract 원문 해시/u,
  );
});

test('citation 감사 증거는 같은 authority DB 파일의 재생성 게이트보다 먼저 발급할 수 없다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  for (const [gateId, prNumber, head] of [
    ['source-maintenance.db-pr-4', 4, sourcePr4Head],
    ['source-maintenance.db-pr-3-p2', 3, sourcePr3P2Head],
  ]) {
    const gate = item.prerequisite_gates.find(candidate => candidate.gate_id === gateId);
    gate.status = 'satisfied';
    gate.evidence_ref = `parkkyusang/liale-rulelink-ir#${prNumber}@${head}`;
  }
  const citationGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.citation-audit-approved',
  );
  citationGate.status = 'satisfied';
  citationGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation,
    authorityEvidenceFixtures.citationPayload,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture(),
    }),
    /같은 merged source PR head의 검증된 DB 재생성 gate/u,
  );
});

test('authority DB artifact는 바이트 해시가 맞아도 승인된 21조문 의미 계약이 아니면 거부한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'source-maintenance.db-pr-4',
  ).status = 'satisfied';
  item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'source-maintenance.db-pr-4',
  ).evidence_ref = `parkkyusang/liale-rulelink-ir#4@${sourcePr4Head}`;
  item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'source-maintenance.db-pr-3-p2',
  ).status = 'satisfied';
  item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'source-maintenance.db-pr-3-p2',
  ).evidence_ref = `parkkyusang/liale-rulelink-ir#3@${sourcePr3P2Head}`;
  const invalidPayload = authorityEvidenceFixtures.candidateDbPayload;
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    invalidPayload,
  );
  const dbRepositoryPath =
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db}`;

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture({
        fileOverrides: new Map([[dbRepositoryPath, invalidPayload]]),
      }),
    }),
    /의미 검증 실패[\s\S]*approved여야[\s\S]*integrity_check/u,
  );
});

test('citation 감사 artifact는 현재 authority DB artifact 해시에 결박되어야 한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  const citationGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.citation-audit-approved',
  );
  const invalidValue = clone(authorityEvidenceFixtures.citationValue);
  invalidValue.authority_db_regeneration_evidence.sha256 = 'f'.repeat(64);
  const invalidPayload = Buffer.from(`${JSON.stringify(invalidValue)}\n`, 'utf8');
  citationGate.status = 'satisfied';
  citationGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation,
    invalidPayload,
  );
  item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'source-maintenance.db-pr-4',
  ).status = 'satisfied';
  item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'source-maintenance.db-pr-4',
  ).evidence_ref = `parkkyusang/liale-rulelink-ir#4@${sourcePr4Head}`;
  item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'source-maintenance.db-pr-3-p2',
  ).status = 'satisfied';
  item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'source-maintenance.db-pr-3-p2',
  ).evidence_ref = `parkkyusang/liale-rulelink-ir#3@${sourcePr3P2Head}`;
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    authorityEvidenceFixtures.authorityDbPayload,
  );
  const citationRepositoryPath =
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation}`;

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture({
        fileOverrides: new Map([[citationRepositoryPath, invalidPayload]]),
      }),
    }),
    /DB 증거 SHA-256이 실제 sibling 파일/u,
  );
});

test('운영검증도 실제 산출물 검증 뒤 별도 append-only 영수증을 가져야 한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  const check = item.release_checks.find(
    candidate => candidate.check_id === 'official-urls-pass',
  );
  check.status = 'passed';
  check.evidence_ref =
    `artifact:official-url-check@sha256:${rawSha256(evidenceArtifactFixtures.get('official-url-check'))}`;
  const registered = appendWorkRegistrations(value);
  assert.throws(
    () => appendReleaseCheckReceipts(registered, value),
    /실제 산출물 검증 없이/u,
  );
  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry: registered,
      readFile: async () => Buffer.from('실제 해시가 다른 운영검증 산출물', 'utf8'),
    }),
    /증거 산출물 해시 불일치/u,
  );

  const verifiedEvidence = await verifiedEvidenceFor(value, registered);
  const released = appendReleaseCheckReceipts(registered, value, {verifiedEvidence});
  assert.deepEqual(validateWorkQueue(value, released), []);
  assert.equal(released.release_check_receipts.length, 1);

  const missingFinalReceipt = clone(released);
  delete missingFinalReceipt.release_check_receipt;
  assert.ok(
    validateQueueItemRegistry(missingFinalReceipt, value)
      .some(error => error.includes('운영검증 최종 영수증이 필요합니다')),
  );
});

test('운영 출판 상태표와 전체 번들의 서로 다른 해시를 함께 검증한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  const gate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'publication.snapshot-023-released',
  );
  gate.status = 'satisfied';
  gate.evidence_ref = publicationEvidenceRef();

  const verifiedEvidence = await verifyProductionQueueExternalEvidence(value, {
    registry,
    fetchJson: async url => {
      assert.ok(url.endsWith('/publication.json'));
      return buildPublicationStatusFromBundle(bundle);
    },
  });

  assert.equal(verifiedEvidence.gateProofs.size, 1);
  assert.match([...verifiedEvidence.gateProofs.values()][0], /^[0-9a-f]{64}$/u);
});

test('운영 출판 상태표가 현재 번들의 공개 투영과 다르면 검증을 거부한다', async () => {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  const gate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'publication.snapshot-023-released',
  );
  gate.status = 'satisfied';
  gate.evidence_ref = publicationEvidenceRef();
  const mismatchedStatus = buildPublicationStatusFromBundle(bundle);
  mismatchedStatus.counts.knowledge_entries += 1;

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async () => mismatchedStatus,
    }),
    /운영 출판 표지가 현재 정본의 공개 상태와 다릅니다/u,
  );
});

test('새 외부 증거가 없으면 네트워크·파일·Git 검증을 실행하지 않는다', async () => {
  const value = plannedAuthorityWork();
  const calls = {fetchJson: 0, readFile: 0, execFile: 0};
  const verifiedEvidence = await verifyProductionQueueExternalEvidence(value, {
    registry,
    fetchJson: async () => {
      calls.fetchJson += 1;
      throw new Error('호출되면 안 되는 네트워크 검증');
    },
    readFile: async () => {
      calls.readFile += 1;
      throw new Error('호출되면 안 되는 파일 검증');
    },
    execFile: async () => {
      calls.execFile += 1;
      throw new Error('호출되면 안 되는 Git 검증');
    },
  });

  assert.equal(verifiedEvidence.gateProofs.size, 0);
  assert.equal(verifiedEvidence.releaseProofs.size, 0);
  assert.deepEqual(calls, {fetchJson: 0, readFile: 0, execFile: 0});
});

test('운영 상태 투영은 라우트와 같은 기준시각 환경값을 사용한다', () => {
  const previous = process.env.RULELINK_PUBLICATION_NOW;
  const overriddenNow = '2027-01-01T00:00:00.000Z';
  process.env.RULELINK_PUBLICATION_NOW = overriddenNow;
  try {
    assert.deepEqual(
      buildPublicationStatusFromBundle(bundle),
      buildPublicationStatusFromBundle(bundle, new Date(overriddenNow)),
    );
  } finally {
    if (previous === undefined) delete process.env.RULELINK_PUBLICATION_NOW;
    else process.env.RULELINK_PUBLICATION_NOW = previous;
  }
});

function authorityDbWorkForTrustBoundary(payload = authorityEvidenceFixtures.authorityDbPayload) {
  const value = plannedAuthorityWork();
  const item = value.items.at(-1);
  for (const [gateId, prNumber, head] of [
    ['source-maintenance.db-pr-4', 4, sourcePr4Head],
    ['source-maintenance.db-pr-3-p2', 3, sourcePr3P2Head],
  ]) {
    const gate = item.prerequisite_gates.find(candidate => candidate.gate_id === gateId);
    gate.status = 'satisfied';
    gate.evidence_ref = `parkkyusang/liale-rulelink-ir#${prNumber}@${head}`;
  }
  const dbGate = item.prerequisite_gates.find(
    candidate => candidate.gate_id === 'authority-db.regenerated',
  );
  dbGate.status = 'satisfied';
  dbGate.evidence_ref = authorityEvidenceRef(
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    payload,
  );
  return value;
}

test('pull_request_target attestation은 custom check·run·PR head를 서로 독립적으로 결박한다', async () => {
  const value = authorityDbWorkForTrustBoundary();
  const sourceFetch = authoritySourceFetchFixture();

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => {
        if (url.includes(`/commits/${sourceEvidenceHead}/check-runs?`)) {
          const response = await sourceFetch(url);
          response.check_runs[0].head_sha = 'd'.repeat(40);
          return response;
        }
        return sourceFetch(url);
      },
    }),
    /check가 완료·성공/u,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => {
        if (url.endsWith(`/actions/runs/${sourceCiRunId}`)) {
          const response = await sourceFetch(url);
          return {...response, event: 'pull_request'};
        }
        return sourceFetch(url);
      },
    }),
    /pull_request_target/u,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => {
        if (url.endsWith(`/actions/runs/${sourceCiRunId}`)) {
          const response = await sourceFetch(url);
          return {
            ...response,
            pull_requests: [{
              number: Number(sourceEvidencePrNumber),
              head: {sha: 'd'.repeat(40)},
            }],
          };
        }
        return sourceFetch(url);
      },
    }),
    /evidence PR head/u,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: async url => {
        if (url.includes(`/commits/${sourceEvidenceHead}/check-runs?`)) {
          const response = await sourceFetch(url);
          response.check_runs[0].details_url =
            `https://github.com/${sourceEvidenceRepository}/actions/runs/9999`;
          return response;
        }
        if (url.endsWith('/actions/runs/9999')) {
          const response = await sourceFetch(
            `https://api.github.com/repos/${sourceEvidenceRepository}/actions/runs/${sourceCiRunId}`,
          );
          return {...response, id: 9999, pull_requests: []};
        }
        return sourceFetch(url);
      },
    }),
    /evidence PR head/u,
  );
});

test('고정 producer commit의 workflow·environment·contract 원문이 바뀌면 attestation을 거부한다', async () => {
  const value = authorityDbWorkForTrustBoundary();
  const attestation = authorityEvidenceFixtures.authorityDbValue.source_ci_attestation;
  const provenance = authorityEvidenceFixtures.authorityDbValue.provenance;
  const untrustedEnvironmentWorkflow = Buffer.from(
    sourceCiWorkflowPayload
      .toString('utf8')
      .replace(
        `environment: ${attestation.required_environment}`,
        'environment: untrusted-authority-environment',
      ),
    'utf8',
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture({
        fileOverrides: new Map([[
          attestation.workflow_path,
          untrustedEnvironmentWorkflow,
        ]]),
      }),
    }),
    /workflow 원문 해시/u,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture({
        fileOverrides: new Map([[
          `${sourceCiRunHead}:${attestation.workflow_path}`,
          untrustedEnvironmentWorkflow,
        ]]),
      }),
    }),
    /실행한 workflow 원문/u,
  );

  await assert.rejects(
    verifyProductionQueueExternalEvidence(value, {
      registry,
      fetchJson: authoritySourceFetchFixture({
        fileOverrides: new Map([[
          provenance.producer_contract_path,
          Buffer.from('{"contract":"lookalike-v1"}\n', 'utf8'),
        ]]),
      }),
    }),
    /producer contract 원문 해시/u,
  );

  const forgedDb = clone(authorityEvidenceFixtures.authorityDbValue);
  forgedDb.provenance.producer_source_commit_sha = 'd'.repeat(40);
  const forgedPayload = Buffer.from(`${JSON.stringify(forgedDb, null, 2)}\n`, 'utf8');
  const dbRepositoryPath =
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db}`;
  await assert.rejects(
    verifyProductionQueueExternalEvidence(
      authorityDbWorkForTrustBoundary(forgedPayload),
      {
        registry,
        fetchJson: authoritySourceFetchFixture({
          fileOverrides: new Map([[dbRepositoryPath, forgedPayload]]),
        }),
      },
    ),
    /producer source commit/u,
  );
});
