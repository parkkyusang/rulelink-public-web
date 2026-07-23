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
const defaultLivePublicationUrl = 'https://rulelink.lolphysical.xyz/publication.json';
const execFileAsync = promisify(execFile);
const contentTypeContract = JSON.parse(
  await readFile(path.join(appRoot, 'src', 'lib', 'knowledge-content-types.json'), 'utf8'),
);
const canonicalContentTypes = new Set(Object.keys(contentTypeContract.canonical));

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
const prePrStatuses = new Set([
  'planned',
  'claimed',
  'in_progress',
  'blocked',
  'needs_rework',
  'withdrawn',
]);
const prerequisiteGateKinds = new Set([
  'publication',
  'external_pr',
  'artifact',
  'quality_schema',
  'runtime',
]);
const prerequisiteGateStatuses = new Set(['pending', 'satisfied']);
const releaseCheckStatuses = new Set(['pending', 'passed']);
const gateProtectedStatuses = new Set([
  'claimed',
  'in_progress',
  'pr_open',
  'ready_for_integration',
  'migration_required',
  'integrated',
  'merged_pending_publication',
]);
const dependencyProtectedStatuses = new Set([
  'claimed',
  'in_progress',
  'pr_open',
  'ready_for_integration',
  'migration_required',
  'integrated',
  'merged_pending_publication',
]);
const completedMeasurementStatuses = new Set([
  'migration_required',
  'integrated',
  'merged_pending_publication',
]);

const wave1GateContract = {
  'publication.snapshot-023-released': {
    gate_kind: 'publication',
    owner_role: 'release',
    verification_method: 'publication_live_parity',
    evidence_pattern: /^publication:kr-knowledge-core-\d{8}-023@status-sha256:[0-9a-f]{64}@bundle-sha256:[0-9a-f]{64}$/u,
  },
  'source-maintenance.db-pr-4': {
    gate_kind: 'external_pr',
    owner_role: 'source_maintenance',
    verification_method: 'github_merged_head',
    evidence_pattern: /^parkkyusang\/liale-rulelink-ir#4@[0-9a-f]{40}$/u,
  },
  'source-maintenance.db-pr-3-p2': {
    gate_kind: 'external_pr',
    owner_role: 'source_maintenance',
    verification_method: 'github_merged_head',
    evidence_pattern: /^parkkyusang\/liale-rulelink-ir#3@[0-9a-f]{40}$/u,
  },
  'authority-db.regenerated': {
    gate_kind: 'artifact',
    owner_role: 'source_maintenance',
    verification_method: 'artifact_sha256',
    evidence_pattern: /^artifact:authority-db-regenerated@sha256:[0-9a-f]{64}$/u,
  },
  'authority-db.citation-audit-approved': {
    gate_kind: 'artifact',
    owner_role: 'source_maintenance',
    verification_method: 'artifact_sha256',
    evidence_pattern: /^artifact:authority-citation-audit-approved@sha256:[0-9a-f]{64}$/u,
  },
  'quality.authority-reading-unit-schema': {
    gate_kind: 'quality_schema',
    owner_role: 'quality_governance',
    verification_method: 'git_ancestor',
    evidence_pattern: /^parkkyusang\/rulelink-public-web#\d+@[0-9a-f]{40}$/u,
  },
  'runtime.statute-reading-ui': {
    gate_kind: 'runtime',
    owner_role: 'runtime_design',
    verification_method: 'git_ancestor',
    evidence_pattern: /^parkkyusang\/rulelink-public-web#\d+@[0-9a-f]{40}$/u,
  },
};
const releaseCheckEvidencePatterns = {
  'current-equals-snapshot-024': /^publication:kr-knowledge-core-\d{8}-024@status-sha256:[0-9a-f]{64}@bundle-sha256:[0-9a-f]{64}$/u,
  'canonical-urls-unchanged': /^artifact:canonical-url-regression@sha256:[0-9a-f]{64}$/u,
  'official-urls-pass': /^artifact:official-url-check@sha256:[0-9a-f]{64}$/u,
  'runtime-responsive-no-overflow': /^artifact:responsive-smoke@sha256:[0-9a-f]{64}$/u,
  'runtime-keyboard-reading-path': /^artifact:keyboard-reading-path@sha256:[0-9a-f]{64}$/u,
  'runtime-fragment-state-restore': /^artifact:fragment-state-restore@sha256:[0-9a-f]{64}$/u,
  'search-hub-sitemap-200': /^artifact:search-hub-sitemap-200@sha256:[0-9a-f]{64}$/u,
};
const evidenceArtifactPaths = {
  'authority-db-regenerated': path.join(
    repoRoot,
    'artifacts',
    'publication',
    'evidence',
    'authority-db-regenerated.json',
  ),
  'authority-citation-audit-approved': path.join(
    repoRoot,
    'artifacts',
    'publication',
    'evidence',
    'authority-citation-audit-approved.json',
  ),
  'canonical-url-regression': path.join(repoRoot, 'artifacts', 'publication', 'evidence', 'releases', '024', 'canonical-url-regression.json'),
  'official-url-check': path.join(repoRoot, 'artifacts', 'publication', 'evidence', 'releases', '024', 'official-url-check.json'),
  'responsive-smoke': path.join(repoRoot, 'artifacts', 'publication', 'evidence', 'releases', '024', 'responsive-smoke.json'),
  'keyboard-reading-path': path.join(repoRoot, 'artifacts', 'publication', 'evidence', 'releases', '024', 'keyboard-reading-path.json'),
  'fragment-state-restore': path.join(repoRoot, 'artifacts', 'publication', 'evidence', 'releases', '024', 'fragment-state-restore.json'),
  'search-hub-sitemap-200': path.join(repoRoot, 'artifacts', 'publication', 'evidence', 'releases', '024', 'search-hub-sitemap-200.json'),
};
const verifiedEvidenceBrand = Symbol('rulelink-production-evidence-v1');

export const PRODUCTION_WORK_CONTRACTS = {
  'reader-backfill-crime-victim-wave1': {
    topic_id: 'hub.crime-victim-response',
    topic_file: 'artifacts/publication/topics/crime-victim-response.json',
    test_file: 'web/rulelink_public_next/scripts/crime-victim-response-topic-reader-backfill.test.mjs',
    branch: 'codex/content-crime-victim-reader-backfill-20260723',
    change_mode: 'existing_topic_revision',
    counts: {
      sources: 24,
      rule_cards: 16,
      scenario_branches: 17,
      content_entries: 13,
      topic_hubs: 1,
      authority_units: 5,
    },
    quality_targets: {
      duplicate_rule_before: 2,
      duplicate_rule_after: 0,
      blank_audience_before: 2,
      blank_audience_after: 0,
      copied_search_before: 2,
      copied_search_after: 0,
      nonstandard_content_type_before: 0,
      nonstandard_content_type_after: 0,
      typed_relation_after: 10,
    },
    measurement_scope: {
      content_ids: [
        'content.compensation-order-eligible-damages',
        'content.compensation-order-application-deadline',
      ],
      rule_ids: [
        'rule.crime-victim-response.crime-victim-10',
        'rule.crime-victim-response.crime-victim-11',
      ],
    },
    prerequisite_gates: wave1GateContract,
    depends_on_work_ids: [],
    release_check_ids: [
      'current-equals-snapshot-024',
      'canonical-urls-unchanged',
      'official-urls-pass',
      'runtime-responsive-no-overflow',
      'runtime-keyboard-reading-path',
      'runtime-fragment-state-restore',
    ],
  },
  'reader-backfill-debt-enforcement-wave2': {
    topic_id: 'hub.debt-enforcement',
    topic_file: 'artifacts/publication/topics/debt-enforcement.json',
    test_file: 'web/rulelink_public_next/scripts/debt-enforcement-topic-backfill.test.mjs',
    branch: 'codex/content-debt-enforcement-reader-backfill-20260723',
    change_mode: 'existing_topic_revision',
    counts: {
      sources: 16,
      rule_cards: 13,
      scenario_branches: 12,
      content_entries: 13,
      topic_hubs: 1,
      authority_units: 16,
    },
    quality_targets: {
      duplicate_rule_before: 13,
      duplicate_rule_after: 0,
      blank_audience_before: 13,
      blank_audience_after: 0,
      copied_search_before: 13,
      copied_search_after: 0,
      nonstandard_content_type_before: 8,
      nonstandard_content_type_after: 0,
      typed_relation_after: 39,
    },
    measurement_scope: {
      content_ids: [
        'content.when-default-interest-starts',
        'content.debt-limitation-is-not-always-ten-years',
        'content.content-certified-demand-needs-followup',
        'content.judgment-debt-limitation-ten-years',
        'content.when-payment-order-fits',
        'content.payment-order-objection-two-weeks',
        'content.documents-that-allow-compulsory-enforcement',
        'content.provisional-attachment-before-judgment',
        'content.bank-account-seizure-and-collection-order',
        'content.wage-and-protected-claim-seizure',
        'content.2026-livelihood-account-protection',
        'content.property-disclosure-when-assets-unknown',
        'content.fraudulent-transfer-before-enforcement',
      ],
      rule_ids: [
        'rule.debt-enforcement.delay-and-default-interest',
        'rule.debt-enforcement.general-claim-limitation',
        'rule.debt-enforcement.demand-six-month-followup',
        'rule.debt-enforcement.judgment-claim-ten-years',
        'rule.debt-enforcement.payment-order-scope',
        'rule.debt-enforcement.payment-order-objection-finality',
        'rule.debt-enforcement.enforceable-title-required',
        'rule.debt-enforcement.provisional-attachment-preservation',
        'rule.debt-enforcement.claim-seizure-and-collection',
        'rule.debt-enforcement.protected-claims',
        'rule.debt-enforcement.livelihood-account',
        'rule.debt-enforcement.property-disclosure',
        'rule.debt-enforcement.fraudulent-transfer-revocation',
      ],
    },
    prerequisite_gates: {
      ...wave1GateContract,
      'wave1.crime-victim-complete': {
        gate_kind: 'artifact',
        owner_role: 'content_production',
        verification_method: 'work_status_receipt',
        evidence_pattern: /^work:reader-backfill-crime-victim-wave1@(migration_required|integrated):[0-9a-f]{64}$/u,
      },
    },
    depends_on_work_ids: ['reader-backfill-crime-victim-wave1'],
    release_check_ids: [
      'current-equals-snapshot-024',
      'canonical-urls-unchanged',
      'official-urls-pass',
      'runtime-responsive-no-overflow',
      'runtime-keyboard-reading-path',
      'runtime-fragment-state-restore',
      'search-hub-sitemap-200',
    ],
  },
};


export const OWNER_ROLE_CONTRACTS = {
  orchestration: {assignment: 'coordination_only', owned_paths: ['artifacts/publication/production-queue.json', 'artifacts/publication/production-queue-registry.json'], forbidden_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**']},
  reader_research: {assignment: 'read_only', owned_paths: [], forbidden_paths: ['**/*']},
  quality_governance: {assignment: 'governance_contracts', owned_paths: ['artifacts/publication/production-queue.json', 'artifacts/publication/production-queue-registry.json', 'web/rulelink_public_next/scripts/*publication*.mjs', 'web/rulelink_public_next/scripts/*publication*.test.mjs'], forbidden_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**', 'artifacts/publication/release.json']},
  runtime_design: {assignment: 'runtime_design', owned_paths: ['web/rulelink_public_next/src/**', 'web/rulelink_public_next/scripts/*runtime*.test.mjs', 'web/rulelink_public_next/scripts/*knowledge*.test.mjs'], forbidden_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**']},
  content_production: {assignment: 'topic_handoff', owned_paths: ['artifacts/publication/topics/<topic>.json', 'web/rulelink_public_next/scripts/<topic>-topic-*.test.mjs'], forbidden_paths: ['artifacts/publication/current/**', 'artifacts/publication/snapshots/**', 'artifacts/publication/manifest.json', 'artifacts/publication/release.json']},
  migrate_publication: {assignment: 'publication_migration', owned_paths: ['README.md', 'artifacts/publication/topics/*.json', 'web/rulelink_public_next/scripts/*topic*.test.mjs', 'web/rulelink_public_next/scripts/*handoff*.test.mjs', 'artifacts/publication/concepts/*.json', 'artifacts/publication/concepts/manifest.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**', 'artifacts/publication/topics/manifest.json', 'artifacts/publication/production-queue.json', 'artifacts/publication/production-queue-registry.json'], forbidden_paths: ['artifacts/publication/release.json']},
  release: {assignment: 'release', owned_paths: ['artifacts/publication/release.json', 'web/rulelink_public_next/publication.json'], forbidden_paths: ['artifacts/publication/topics/*.json']},
  source_maintenance: {assignment: 'external_repository', owned_paths: [], forbidden_paths: ['**/*']},
  product_policy: {assignment: 'read_only', owned_paths: [], forbidden_paths: ['**/*']},
};

function canonicalJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(item => JSON.parse(canonicalJson(item))));
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonicalJson(value[key]))])));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function defaultFetchJson(url) {
  const headers = {
    Accept: 'application/vnd.github+json, application/json',
    'User-Agent': 'rulelink-publication-evidence-verifier',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, {headers});
  if (!response.ok) throw new Error(`외부 증거 조회 실패: ${response.status} ${url}`);
  return response.json();
}

function publicationStatusNow() {
  const override = process.env.RULELINK_PUBLICATION_NOW;
  if (!override) return new Date();
  const parsed = new Date(override);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function buildPublicationStatusFromBundle(bundle, now = publicationStatusNow()) {
  const nowTime = new Date(now).getTime();
  const fresh = values => (values || []).filter(value => {
    const expiresAt = new Date(value?.expires_at || '').getTime();
    return Number.isFinite(expiresAt) && expiresAt > nowTime;
  });
  const cards = fresh(bundle?.cards);
  const changeBriefs = fresh(bundle?.change_briefs);
  const concepts = fresh(bundle?.knowledge?.concept_cards);
  const knowledgeEntries = fresh(bundle?.knowledge?.content_entries);
  const visibleEntryIds = new Set(knowledgeEntries.map(entry => entry.content_id));
  const knowledgeHubs = (bundle?.knowledge?.topic_hubs || [])
    .filter(hub => hub.content_ids?.some(contentId => visibleEntryIds.has(contentId)));
  const visibleCardIds = new Set(cards.map(card => card.issue_card_id));
  const publicTopics = (bundle?.catalog?.topics || [])
    .filter(topic => topic.issue_card_ids?.some(cardId => visibleCardIds.has(cardId)));
  const reviewDates = [
    ...cards,
    ...changeBriefs,
    ...concepts,
    ...knowledgeEntries,
  ].map(value => value.reviewed_at);
  const expiryDates = [
    ...cards,
    ...changeBriefs,
    ...concepts,
    ...knowledgeEntries,
  ].map(value => value.expires_at);
  const extremeDate = (values, direction) => {
    if (!values.length) return null;
    return values.reduce((selected, candidate) => {
      const selectedTime = new Date(selected).getTime();
      const candidateTime = new Date(candidate).getTime();
      return direction === 'earliest'
        ? candidateTime < selectedTime ? candidate : selected
        : candidateTime > selectedTime ? candidate : selected;
    });
  };
  const published = bundle?.schema === 'rulelink_published_bundle_v1';
  return {
    schema: 'rulelink_publication_status_v1',
    status: published ? 'published' : bundle ? 'preview' : 'empty',
    snapshot_id: published ? bundle.snapshot_id : null,
    built_at: published ? bundle.built_at : null,
    counts: {
      issue_cards: cards.length,
      change_briefs: changeBriefs.length,
      concept_cards: concepts.length,
      knowledge_entries: knowledgeEntries.length,
      knowledge_hubs: knowledgeHubs.length,
      public_topics: publicTopics.length,
    },
    latest_reviewed_at: extremeDate(reviewDates, 'latest'),
    earliest_expires_at: extremeDate(expiryDates, 'earliest'),
  };
}

async function verifyEvidenceReference({
  evidenceRef,
  verificationMethod,
  queue,
  io,
}) {
  const read = io.readFile || readFile;
  const fetchJson = io.fetchJson || defaultFetchJson;
  const run = io.execFile || execFileAsync;
  if (verificationMethod === 'publication_live_parity') {
    const matched = /^publication:([^@]+)@status-sha256:([0-9a-f]{64})@bundle-sha256:([0-9a-f]{64})$/u.exec(evidenceRef);
    if (!matched) throw new Error(`운영 출판 증거 형식 오류: ${evidenceRef}`);
    const [, snapshotId, expectedStatusHash, expectedBundleHash] = matched;
    const snapshotPath = path.join(
      repoRoot,
      'artifacts',
      'publication',
      'snapshots',
      snapshotId,
      'bundle.json',
    );
    const [live, current, immutableSnapshot] = await Promise.all([
      fetchJson(io.livePublicationUrl || defaultLivePublicationUrl),
      read(defaultPublishedBundlePath, 'utf8').then(JSON.parse),
      read(snapshotPath, 'utf8').then(JSON.parse),
    ]);
    if (
      live.snapshot_id !== snapshotId ||
      current.snapshot_id !== snapshotId ||
      immutableSnapshot.snapshot_id !== snapshotId
    ) {
      throw new Error(`운영 표지·현재 정본·불변 스냅샷 ID 불일치: ${snapshotId}`);
    }
    const expectedStatus = buildPublicationStatusFromBundle(current);
    if (canonicalJson(live) !== canonicalJson(expectedStatus)) {
      throw new Error(`운영 출판 표지가 현재 정본의 공개 상태와 다릅니다: ${snapshotId}`);
    }
    const liveStatusHash = sha256(canonicalJson(live));
    const currentBundleHash = sha256(canonicalJson(current));
    const immutableBundleHash = sha256(canonicalJson(immutableSnapshot));
    if (
      liveStatusHash !== expectedStatusHash ||
      currentBundleHash !== expectedBundleHash ||
      immutableBundleHash !== expectedBundleHash
    ) {
      throw new Error(`운영 표지 또는 정본 번들 해시 불일치: ${snapshotId}`);
    }
    return sha256(canonicalJson({
      verificationMethod,
      evidenceRef,
      liveStatusHash,
      currentBundleHash,
      immutableBundleHash,
    }));
  }
  if (verificationMethod === 'github_merged_head' || verificationMethod === 'git_ancestor') {
    const matched = /^([^/]+\/[^#]+)#(\d+)@([0-9a-f]{40})$/u.exec(evidenceRef);
    if (!matched) throw new Error(`GitHub 증거 형식 오류: ${evidenceRef}`);
    const [, repository, prNumber, expectedSha] = matched;
    const pull = await fetchJson(`https://api.github.com/repos/${repository}/pulls/${prNumber}`);
    if (!pull.merged_at) throw new Error(`병합되지 않은 PR은 증거가 될 수 없습니다: ${repository}#${prNumber}`);
    if (verificationMethod === 'github_merged_head') {
      if (pull.head?.sha !== expectedSha) {
        throw new Error(`병합된 PR head가 증거 SHA와 다릅니다: ${repository}#${prNumber}`);
      }
    } else {
      if (repository !== 'parkkyusang/rulelink-public-web' || pull.merge_commit_sha !== expectedSha) {
        throw new Error(`공개 저장소 병합 commit이 증거 SHA와 다릅니다: ${repository}#${prNumber}`);
      }
      await run('git', ['cat-file', '-e', `${expectedSha}^{commit}`], {cwd: repoRoot});
      await run('git', ['merge-base', '--is-ancestor', expectedSha, 'HEAD'], {cwd: repoRoot});
    }
    return sha256(canonicalJson({
      verificationMethod,
      evidenceRef,
      merged_at: pull.merged_at,
      head_sha: pull.head?.sha,
      merge_commit_sha: pull.merge_commit_sha,
    }));
  }
  if (verificationMethod === 'artifact_sha256') {
    const matched = /^artifact:([a-z0-9-]+)@sha256:([0-9a-f]{64})$/u.exec(evidenceRef);
    if (!matched) throw new Error(`산출물 증거 형식 오류: ${evidenceRef}`);
    const [, artifactId, expectedHash] = matched;
    const artifactPath = evidenceArtifactPaths[artifactId];
    if (!artifactPath) throw new Error(`승인되지 않은 증거 산출물입니다: ${artifactId}`);
    const artifact = await read(artifactPath);
    const actualHash = sha256(artifact);
    if (actualHash !== expectedHash) throw new Error(`증거 산출물 해시 불일치: ${artifactId}`);
    return sha256(canonicalJson({verificationMethod, evidenceRef, artifactPath, actualHash}));
  }
  if (verificationMethod === 'work_status_receipt') {
    const matched = /^work:([^@]+)@(migration_required|integrated):([0-9a-f]{64})$/u.exec(evidenceRef);
    if (!matched) throw new Error(`선행 작업 증거 형식 오류: ${evidenceRef}`);
    const [, workId, expectedStatus, expectedHash] = matched;
    const item = queue.items.find(candidate => candidate.work_id === workId);
    if (!item || item.status !== expectedStatus) {
      throw new Error(`선행 작업 상태가 증거와 다릅니다: ${workId}`);
    }
    const topic = await read(path.join(repoRoot, item.topic_file), 'utf8');
    const actualHash = sha256(canonicalJson({
      work_id: item.work_id,
      status: item.status,
      head_sha: item.head_sha,
      topic_sha256: sha256(topic),
    }));
    if (actualHash !== expectedHash) throw new Error(`선행 작업 상태 영수증 불일치: ${workId}`);
    return sha256(canonicalJson({verificationMethod, evidenceRef, actualHash}));
  }
  throw new Error(`지원하지 않는 외부 증거 검증 방법입니다: ${verificationMethod}`);
}

export async function verifyProductionQueueExternalEvidence(queue, {
  registry = null,
  ...io
} = {}) {
  const existingGateKeys = new Set(
    (registry?.prerequisite_gate_receipts || [])
      .map(receipt => `${receipt.work_id}|${receipt.gate_id}|${receipt.evidence_ref}`),
  );
  const existingReleaseKeys = new Set(
    (registry?.release_check_receipts || [])
      .map(receipt => `${receipt.work_id}|${receipt.check_id}|${receipt.evidence_ref}`),
  );
  const gateProofs = new Map();
  const releaseProofs = new Map();
  for (const item of queue.items || []) {
    const contract = PRODUCTION_WORK_CONTRACTS[item.work_id];
    if (!contract) continue;
    for (const gate of item.prerequisite_gates || []) {
      if (gate.status !== 'satisfied') continue;
      const key = `${item.work_id}|${gate.gate_id}|${gate.evidence_ref}`;
      if (existingGateKeys.has(key)) continue;
      const contractGate = contract.prerequisite_gates[gate.gate_id];
      const proof = await verifyEvidenceReference({
        kind: 'prerequisite_gate',
        workId: item.work_id,
        evidenceRef: gate.evidence_ref,
        verificationMethod: contractGate.verification_method,
        queue,
        io,
      });
      if (!/^[0-9a-f]{64}$/u.test(proof || '')) {
        throw new Error(`외부 검증기가 유효한 증거 해시를 반환하지 않았습니다: ${key}`);
      }
      gateProofs.set(key, proof);
    }
    for (const check of item.release_checks || []) {
      if (check.status !== 'passed') continue;
      const key = `${item.work_id}|${check.check_id}|${check.evidence_ref}`;
      if (existingReleaseKeys.has(key)) continue;
      const verificationMethod = check.check_id === 'current-equals-snapshot-024'
        ? 'publication_live_parity'
        : 'artifact_sha256';
      const proof = await verifyEvidenceReference({
        kind: 'release_check',
        workId: item.work_id,
        evidenceRef: check.evidence_ref,
        verificationMethod,
        queue,
        io,
      });
      if (!/^[0-9a-f]{64}$/u.test(proof || '')) {
        throw new Error(`외부 검증기가 유효한 운영 증거 해시를 반환하지 않았습니다: ${key}`);
      }
      releaseProofs.set(key, proof);
    }
  }
  return Object.freeze({
    [verifiedEvidenceBrand]: true,
    gateProofs,
    releaseProofs,
  });
}

function normalizeExactText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function measureWorkTopic(topic, contract) {
  const contentIds = new Set(contract.measurement_scope.content_ids);
  const ruleIds = new Set(contract.measurement_scope.rule_ids);
  const entries = (topic.content_entries || []).filter(entry => contentIds.has(entry.content_id));
  const rules = (topic.rule_cards || []).filter(rule => ruleIds.has(rule.rule_id));
  const copiedSearch = entries.filter(entry => {
    const copiedFrom = new Set(
      [entry.title_ko, entry.slug].map(normalizeExactText).filter(Boolean),
    );
    return (entry.search_intents_ko || [])
      .map(normalizeExactText)
      .filter(Boolean)
      .some(intent => copiedFrom.has(intent));
  }).length;
  const authorityUnits = (
    topic.authority_reading_units ??
    topic.authority_explainers ??
    []
  );
  return {
    counts: {
      sources: (topic.sources || []).length,
      rule_cards: (topic.rule_cards || []).length,
      scenario_branches: (topic.scenario_branches || []).length,
      content_entries: (topic.content_entries || []).length,
      topic_hubs: (topic.topic_hubs || []).length,
      authority_units: Array.isArray(authorityUnits) ? authorityUnits.length : -1,
    },
    quality: {
      duplicate_rule: rules.filter(rule => (
        normalizeExactText(rule.proposition_ko) ===
        normalizeExactText(rule.norm?.legal_effect_ko)
      )).length,
      blank_audience: entries.filter(entry => !nonEmpty(entry.audience_situation_ko)).length,
      copied_search: copiedSearch,
      nonstandard_content_type: entries.filter(entry => (
        !canonicalContentTypes.has(entry.content_type)
      )).length,
      typed_relation: entries.reduce(
        (sum, entry) => sum + (Array.isArray(entry.related_edges) ? entry.related_edges.length : 0),
        0,
      ),
    },
  };
}

export function topicReceipt(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function queueRegistryGenesisReceipt() {
  return topicReceipt({schema: queueRegistrySchema, registry_version: queueRegistryVersion});
}

function queueItemIdentity(item) {
  const identity = {
    queue_id: item.queue_id,
    change_mode: item.change_mode,
    topic_id: item.topic_id,
    topic_file: item.topic_file,
  };
  if (nonEmpty(item.work_id)) identity.work_id = item.work_id;
  else identity.pr_number = item.pr_number;
  return identity;
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
    pr_bindings: [],
    pr_binding_receipt: prBindingGenesisReceipt(),
    head_receipts: [],
    head_receipt: headReceiptGenesisReceipt(),
    prerequisite_gate_receipts: [],
    prerequisite_gate_receipt: prerequisiteGateReceiptGenesis(),
    release_check_receipts: [],
    release_check_receipt: releaseCheckReceiptGenesis(),
  };
}

function prBindingReceipt(binding) {
  const {receipt: _receipt, ...payload} = binding;
  return topicReceipt(payload);
}

function prBindingGenesisReceipt() {
  return topicReceipt({schema: queueRegistrySchema, kind: 'pr_bindings'});
}

function headReceiptReceipt(headReceipt) {
  const {receipt: _receipt, ...payload} = headReceipt;
  return topicReceipt(payload);
}

function headReceiptGenesisReceipt() {
  return topicReceipt({schema: queueRegistrySchema, kind: 'head_receipts'});
}

function prerequisiteGateReceiptReceipt(gateReceipt) {
  const {receipt: _receipt, ...payload} = gateReceipt;
  return topicReceipt(payload);
}

function prerequisiteGateReceiptGenesis() {
  return topicReceipt({schema: queueRegistrySchema, kind: 'prerequisite_gate_receipts'});
}

function releaseCheckReceiptReceipt(releaseReceipt) {
  const {receipt: _receipt, ...payload} = releaseReceipt;
  return topicReceipt(payload);
}

function releaseCheckReceiptGenesis() {
  return topicReceipt({schema: queueRegistrySchema, kind: 'release_check_receipts'});
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
  const queueByPr = new Map(
    (queue?.items || [])
      .filter(item => isPositiveInteger(item?.pr_number))
      .map(item => [item.pr_number, item]),
  );
  const queueByWorkId = new Map(
    (queue?.items || [])
      .filter(item => nonEmpty(item?.work_id))
      .map(item => [item.work_id, item]),
  );
  const registeredIds = new Set();
  const registeredPrs = new Set();
  const registeredWorkIds = new Set();
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
    const hasWorkIdentity = nonEmpty(registration.work_id);
    if (hasWorkIdentity) {
      if (!/^[a-z0-9][a-z0-9._-]*$/u.test(registration.work_id)) {
        errors.push(`${label}.work_id 형식이 올바르지 않습니다.`);
      } else if (registeredWorkIds.has(registration.work_id)) {
        errors.push(`item registry의 work_id가 중복됩니다: ${registration.work_id}`);
      } else {
        registeredWorkIds.add(registration.work_id);
      }
      if (registration.pr_number !== undefined) {
        errors.push(`${label}의 work_id 등록에는 PR 번호를 섞지 말고 pr_bindings에 별도 결박해야 합니다.`);
      }
    } else if (!isPositiveInteger(registration.pr_number)) {
      errors.push(`${label}.pr_number 또는 work_id가 필요합니다.`);
    } else if (registeredPrs.has(registration.pr_number)) {
      errors.push(`item registry의 PR 번호가 중복됩니다: #${registration.pr_number}`);
    } else {
      registeredPrs.add(registration.pr_number);
    }
    if (!modes.has(registration.change_mode)) errors.push(`${label}.change_mode가 올바르지 않습니다.`);
    if (!nonEmpty(registration.topic_id)) errors.push(`${label}.topic_id가 필요합니다.`);
    if (!nonEmpty(registration.topic_file)) errors.push(`${label}.topic_file이 필요합니다.`);
    const expectedReceipt = queueRegistrationReceipt(registration);
    if (registration.receipt !== expectedReceipt) errors.push(`${label}.receipt가 등록 내용과 다릅니다.`);
    previousReceipt = registration.receipt;

    const currentById = queueById.get(registration.queue_id);
    const currentByIdentity = hasWorkIdentity
      ? queueByWorkId.get(registration.work_id)
      : queueByPr.get(registration.pr_number);
    if (!currentById || !currentByIdentity || currentById !== currentByIdentity) {
      const identityLabel = hasWorkIdentity ? registration.work_id : `#${registration.pr_number}`;
      errors.push(`등록된 queue item을 삭제할 수 없습니다: ${registration.queue_id} / ${identityLabel}`);
      continue;
    }
    const expectedIdentity = queueItemIdentity(currentById);
    const identityFields = hasWorkIdentity
      ? ['queue_id', 'work_id', 'change_mode', 'topic_id', 'topic_file']
      : ['queue_id', 'pr_number', 'change_mode', 'topic_id', 'topic_file'];
    for (const field of identityFields) {
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

  const prBindings = registry.pr_bindings ?? [];
  if (!Array.isArray(prBindings)) {
    errors.push('production queue item registry의 pr_bindings는 배열이어야 합니다.');
  } else {
    const boundWorkIds = new Set();
    const boundPrs = new Set();
    let previousBindingReceipt = prBindingGenesisReceipt();
    for (const [index, binding] of prBindings.entries()) {
      const label = `pr_bindings[${index}]`;
      if (binding.sequence !== index + 1) errors.push(`${label}.sequence는 연속 번호여야 합니다.`);
      if (binding.previous_receipt !== previousBindingReceipt) {
        errors.push(`${label}.previous_receipt가 직전 PR 결박 영수증과 다릅니다.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(binding.bound_on || '')) {
        errors.push(`${label}.bound_on은 YYYY-MM-DD 형식이어야 합니다.`);
      }
      if (!nonEmpty(binding.work_id) || !registeredWorkIds.has(binding.work_id)) {
        errors.push(`${label}.work_id는 먼저 등록된 작업이어야 합니다.`);
      } else if (boundWorkIds.has(binding.work_id)) {
        errors.push(`같은 work_id에 PR을 다시 결박할 수 없습니다: ${binding.work_id}`);
      } else {
        boundWorkIds.add(binding.work_id);
      }
      if (!isPositiveInteger(binding.pr_number)) {
        errors.push(`${label}.pr_number는 양의 정수여야 합니다.`);
      } else if (boundPrs.has(binding.pr_number) || registeredPrs.has(binding.pr_number)) {
        errors.push(`PR 번호를 둘 이상의 작업에 결박할 수 없습니다: #${binding.pr_number}`);
      } else {
        boundPrs.add(binding.pr_number);
      }
      if (!/^codex\/content-[a-z0-9._/-]+$/u.test(binding.branch || '')) {
        errors.push(`${label}.branch는 codex/content-* 형식이어야 합니다.`);
      }
      const expectedReceipt = prBindingReceipt(binding);
      if (binding.receipt !== expectedReceipt) errors.push(`${label}.receipt가 PR 결박 내용과 다릅니다.`);
      previousBindingReceipt = binding.receipt;

      const current = queueByWorkId.get(binding.work_id);
      if (
        !current ||
        current.pr_number !== binding.pr_number ||
        current.branch !== binding.branch
      ) {
        errors.push(`PR 결박과 현재 queue item이 다릅니다: ${binding.work_id}`);
      }
    }
    if (prBindings.length > 0 && !nonEmpty(registry.pr_binding_receipt)) {
      errors.push('production queue item registry의 PR 결박 최종 영수증이 필요합니다.');
    } else if (
      registry.pr_binding_receipt !== undefined &&
      registry.pr_binding_receipt !== previousBindingReceipt
    ) {
      errors.push('production queue item registry의 PR 결박 최종 영수증이 다릅니다.');
    }
    for (const item of queue?.items || []) {
      if (!nonEmpty(item.work_id)) continue;
      const hasPr = isPositiveInteger(item.pr_number);
      if (hasPr && !boundWorkIds.has(item.work_id) && !allowUnregisteredQueueItems) {
        errors.push(`queue item의 PR 결박이 registry에 없습니다: ${item.work_id} / #${item.pr_number}`);
      }
      if (!hasPr && boundWorkIds.has(item.work_id)) {
        errors.push(`registry에 결박된 PR을 queue item에서 제거할 수 없습니다: ${item.work_id}`);
      }
    }
    if (previousRegistry?.pr_bindings) {
      if (prBindings.length < previousRegistry.pr_bindings.length) {
        errors.push('production queue item registry의 직전 PR 결박 이력을 삭제할 수 없습니다.');
      } else {
        for (const [index, previousBinding] of previousRegistry.pr_bindings.entries()) {
          if (canonicalJson(prBindings[index]) !== canonicalJson(previousBinding)) {
            errors.push(`production queue item registry의 직전 PR 결박을 바꿀 수 없습니다: sequence ${index + 1}`);
          }
        }
      }
    }
  }

  const headReceipts = registry.head_receipts ?? [];
  if (!Array.isArray(headReceipts)) {
    errors.push('production queue item registry의 head_receipts는 배열이어야 합니다.');
  } else {
    const seenHeads = new Set();
    const latestHeadByWorkId = new Map();
    let previousHeadReceipt = headReceiptGenesisReceipt();
    for (const [index, headReceipt] of headReceipts.entries()) {
      const label = `head_receipts[${index}]`;
      if (headReceipt.sequence !== index + 1) errors.push(`${label}.sequence는 연속 번호여야 합니다.`);
      if (headReceipt.previous_receipt !== previousHeadReceipt) {
        errors.push(`${label}.previous_receipt가 직전 head 영수증과 다릅니다.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(headReceipt.audited_on || '')) {
        errors.push(`${label}.audited_on은 YYYY-MM-DD 형식이어야 합니다.`);
      }
      const binding = prBindings.find(candidate => candidate.work_id === headReceipt.work_id);
      if (
        !binding ||
        binding.pr_number !== headReceipt.pr_number ||
        !/^[0-9a-f]{40}$/u.test(headReceipt.head_sha || '')
      ) {
        errors.push(`${label}는 먼저 결박된 work_id·PR과 40자리 head_sha를 가져야 합니다.`);
      }
      const headKey = `${headReceipt.work_id}|${headReceipt.head_sha}`;
      if (seenHeads.has(headKey)) {
        errors.push(`같은 PR head를 중복 기록할 수 없습니다: ${headKey}`);
      }
      seenHeads.add(headKey);
      latestHeadByWorkId.set(headReceipt.work_id, headReceipt.head_sha);
      const expectedReceipt = headReceiptReceipt(headReceipt);
      if (headReceipt.receipt !== expectedReceipt) errors.push(`${label}.receipt가 head 감사 내용과 다릅니다.`);
      previousHeadReceipt = headReceipt.receipt;
    }
    if (headReceipts.length > 0 && !nonEmpty(registry.head_receipt)) {
      errors.push('production queue item registry의 head 최종 영수증이 필요합니다.');
    } else if (
      registry.head_receipt !== undefined &&
      registry.head_receipt !== previousHeadReceipt
    ) {
      errors.push('production queue item registry의 head 최종 영수증이 다릅니다.');
    }
    for (const item of queue?.items || []) {
      if (!nonEmpty(item.work_id) || !isPositiveInteger(item.pr_number)) continue;
      if (
        latestHeadByWorkId.get(item.work_id) !== item.head_sha &&
        !allowUnregisteredQueueItems
      ) {
        errors.push(`queue item의 현재 head 감사 영수증이 없습니다: ${item.work_id} / ${item.head_sha}`);
      }
    }
    if (previousRegistry?.head_receipts) {
      if (headReceipts.length < previousRegistry.head_receipts.length) {
        errors.push('production queue item registry의 직전 head 이력을 삭제할 수 없습니다.');
      } else {
        for (const [index, previousHead] of previousRegistry.head_receipts.entries()) {
          if (canonicalJson(headReceipts[index]) !== canonicalJson(previousHead)) {
            errors.push(`production queue item registry의 직전 head 영수증을 바꿀 수 없습니다: sequence ${index + 1}`);
          }
        }
      }
    }
  }

  const gateReceipts = registry.prerequisite_gate_receipts ?? [];
  if (!Array.isArray(gateReceipts)) {
    errors.push('production queue item registry의 prerequisite_gate_receipts는 배열이어야 합니다.');
  } else {
    const receivedGateKeys = new Set();
    let previousGateReceipt = prerequisiteGateReceiptGenesis();
    for (const [index, gateReceipt] of gateReceipts.entries()) {
      const label = `prerequisite_gate_receipts[${index}]`;
      if (gateReceipt.sequence !== index + 1) errors.push(`${label}.sequence는 연속 번호여야 합니다.`);
      if (gateReceipt.previous_receipt !== previousGateReceipt) {
        errors.push(`${label}.previous_receipt가 직전 선행 게이트 영수증과 다릅니다.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(gateReceipt.verified_on || '')) {
        errors.push(`${label}.verified_on은 YYYY-MM-DD 형식이어야 합니다.`);
      }
      const item = queueByWorkId.get(gateReceipt.work_id);
      const gate = item?.prerequisite_gates?.find(
        candidate => candidate.gate_id === gateReceipt.gate_id,
      );
      const contractGate = PRODUCTION_WORK_CONTRACTS[gateReceipt.work_id]
        ?.prerequisite_gates?.[gateReceipt.gate_id];
      if (
        !item ||
        !gate ||
        gate.status !== 'satisfied' ||
        gate.evidence_ref !== gateReceipt.evidence_ref
      ) {
        errors.push(`${label}가 현재 satisfied 선행 게이트와 다릅니다.`);
      }
      if (
        !contractGate ||
        gateReceipt.verified_by_role !== contractGate.owner_role ||
        gateReceipt.verification_method !== contractGate.verification_method ||
        !contractGate.evidence_pattern.test(gateReceipt.evidence_ref || '') ||
        !/^[0-9a-f]{64}$/u.test(gateReceipt.verification_proof || '')
      ) {
        errors.push(`${label}의 소유자·검증방법·증거가 승인된 생산계약과 다릅니다.`);
      }
      const gateKey = `${gateReceipt.work_id}|${gateReceipt.gate_id}`;
      if (receivedGateKeys.has(gateKey)) {
        errors.push(`같은 선행 게이트 영수증을 중복 발급할 수 없습니다: ${gateKey}`);
      }
      receivedGateKeys.add(gateKey);
      const expectedReceipt = prerequisiteGateReceiptReceipt(gateReceipt);
      if (gateReceipt.receipt !== expectedReceipt) {
        errors.push(`${label}.receipt가 선행 게이트 감사 내용과 다릅니다.`);
      }
      previousGateReceipt = gateReceipt.receipt;
    }
    if (gateReceipts.length > 0 && !nonEmpty(registry.prerequisite_gate_receipt)) {
      errors.push('production queue item registry의 선행 게이트 최종 영수증이 필요합니다.');
    } else if (
      registry.prerequisite_gate_receipt !== undefined &&
      registry.prerequisite_gate_receipt !== previousGateReceipt
    ) {
      errors.push('production queue item registry의 선행 게이트 최종 영수증이 다릅니다.');
    }
    for (const item of queue?.items || []) {
      if (!nonEmpty(item.work_id)) continue;
      for (const gate of item.prerequisite_gates || []) {
        const gateKey = `${item.work_id}|${gate.gate_id}`;
        if (
          gate.status === 'satisfied' &&
          !receivedGateKeys.has(gateKey) &&
          !allowUnregisteredQueueItems
        ) {
          errors.push(`satisfied 선행 게이트의 소유자 영수증이 없습니다: ${gateKey}`);
        }
        if (gate.status !== 'satisfied' && receivedGateKeys.has(gateKey)) {
          errors.push(`발급된 선행 게이트 영수증을 pending으로 되돌릴 수 없습니다: ${gateKey}`);
        }
      }
    }
    if (previousRegistry?.prerequisite_gate_receipts) {
      if (gateReceipts.length < previousRegistry.prerequisite_gate_receipts.length) {
        errors.push('production queue item registry의 직전 선행 게이트 영수증을 삭제할 수 없습니다.');
      } else {
        for (const [index, previousGate] of previousRegistry.prerequisite_gate_receipts.entries()) {
          if (canonicalJson(gateReceipts[index]) !== canonicalJson(previousGate)) {
            errors.push(`production queue item registry의 직전 선행 게이트 영수증을 바꿀 수 없습니다: sequence ${index + 1}`);
          }
        }
      }
    }
  }

  const releaseReceipts = registry.release_check_receipts ?? [];
  if (!Array.isArray(releaseReceipts)) {
    errors.push('production queue item registry의 release_check_receipts는 배열이어야 합니다.');
  } else {
    const receivedReleaseKeys = new Set();
    let previousReleaseReceipt = releaseCheckReceiptGenesis();
    for (const [index, releaseReceipt] of releaseReceipts.entries()) {
      const label = `release_check_receipts[${index}]`;
      if (releaseReceipt.sequence !== index + 1) {
        errors.push(`${label}.sequence는 연속 번호여야 합니다.`);
      }
      if (releaseReceipt.previous_receipt !== previousReleaseReceipt) {
        errors.push(`${label}.previous_receipt가 직전 운영검증 영수증과 다릅니다.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(releaseReceipt.verified_on || '')) {
        errors.push(`${label}.verified_on은 YYYY-MM-DD 형식이어야 합니다.`);
      }
      const item = queueByWorkId.get(releaseReceipt.work_id);
      const check = item?.release_checks?.find(
        candidate => candidate.check_id === releaseReceipt.check_id,
      );
      if (
        !item ||
        !check ||
        check.status !== 'passed' ||
        check.evidence_ref !== releaseReceipt.evidence_ref
      ) {
        errors.push(`${label}가 현재 통과한 운영검증과 다릅니다.`);
      }
      if (
        !PRODUCTION_WORK_CONTRACTS[releaseReceipt.work_id]
          ?.release_check_ids?.includes(releaseReceipt.check_id) ||
        !releaseCheckEvidencePatterns[releaseReceipt.check_id]
          ?.test(releaseReceipt.evidence_ref || '') ||
        !/^[0-9a-f]{64}$/u.test(releaseReceipt.verification_proof || '')
      ) {
        errors.push(`${label}의 운영검증 종류·증거·검증해시가 승인 계약과 다릅니다.`);
      }
      const releaseKey = `${releaseReceipt.work_id}|${releaseReceipt.check_id}`;
      if (receivedReleaseKeys.has(releaseKey)) {
        errors.push(`같은 운영검증 영수증을 중복 발급할 수 없습니다: ${releaseKey}`);
      }
      receivedReleaseKeys.add(releaseKey);
      const expectedReceipt = releaseCheckReceiptReceipt(releaseReceipt);
      if (releaseReceipt.receipt !== expectedReceipt) {
        errors.push(`${label}.receipt가 운영검증 내용과 다릅니다.`);
      }
      previousReleaseReceipt = releaseReceipt.receipt;
    }
    if (releaseReceipts.length > 0 && !nonEmpty(registry.release_check_receipt)) {
      errors.push('production queue item registry의 운영검증 최종 영수증이 필요합니다.');
    } else if (
      registry.release_check_receipt !== undefined &&
      registry.release_check_receipt !== previousReleaseReceipt
    ) {
      errors.push('production queue item registry의 운영검증 최종 영수증이 올바르지 않습니다.');
    }
    for (const item of queue?.items || []) {
      if (!nonEmpty(item.work_id)) continue;
      for (const check of item.release_checks || []) {
        const releaseKey = `${item.work_id}|${check.check_id}`;
        if (
          check.status === 'passed' &&
          !receivedReleaseKeys.has(releaseKey) &&
          !allowUnregisteredQueueItems
        ) {
          errors.push(`통과한 운영검증의 외부검증 영수증이 없습니다: ${releaseKey}`);
        }
        if (check.status !== 'passed' && receivedReleaseKeys.has(releaseKey)) {
          errors.push(`발급된 운영검증 영수증을 pending으로 되돌릴 수 없습니다: ${releaseKey}`);
        }
      }
    }
    if (previousRegistry?.release_check_receipts) {
      if (releaseReceipts.length < previousRegistry.release_check_receipts.length) {
        errors.push('production queue item registry의 이전 운영검증 영수증을 삭제할 수 없습니다.');
      } else {
        for (const [index, previousRelease] of previousRegistry.release_check_receipts.entries()) {
          if (canonicalJson(releaseReceipts[index]) !== canonicalJson(previousRelease)) {
            errors.push(`production queue item registry의 이전 운영검증 영수증을 바꿀 수 없습니다: sequence ${index + 1}`);
          }
        }
      }
    }
  }

  if (!allowUnregisteredQueueItems) {
    for (const item of queue?.items || []) {
      const identityRegistered = nonEmpty(item.work_id)
        ? registeredWorkIds.has(item.work_id)
        : registeredPrs.has(item.pr_number);
      if (!registeredIds.has(item.queue_id) || !identityRegistered) {
        const identityLabel = nonEmpty(item.work_id) ? item.work_id : `#${item.pr_number}`;
        errors.push(`queue item이 append-only registry에 등록되지 않았습니다: ${item.queue_id} / ${identityLabel}`);
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
  const finalErrors = validateQueueItemRegistry(next, queue, {
    allowUnregisteredQueueItems: true,
    previousRegistry,
  });
  if (finalErrors.length) throw new Error(`production queue item registry 갱신 실패: ${finalErrors.join(' | ')}`);
  return next;
}

export function appendPrerequisiteGateReceipts(
  registry,
  queue,
  {previousRegistry = null, verifiedEvidence = null} = {},
) {
  const next = registry ? JSON.parse(JSON.stringify(registry)) : emptyQueueItemRegistry();
  if (!Array.isArray(next.prerequisite_gate_receipts)) next.prerequisite_gate_receipts = [];
  if (!nonEmpty(next.prerequisite_gate_receipt)) {
    next.prerequisite_gate_receipt = prerequisiteGateReceiptGenesis();
  }
  const preparationErrors = validateQueueItemRegistry(next, queue, {
    allowUnregisteredQueueItems: true,
    previousRegistry,
  });
  if (preparationErrors.length) {
    throw new Error(`production queue 선행 게이트 영수증 준비 실패: ${preparationErrors.join(' | ')}`);
  }
  const receivedGateKeys = new Set(
    next.prerequisite_gate_receipts.map(receipt => `${receipt.work_id}|${receipt.gate_id}`),
  );
  let previousReceipt = next.prerequisite_gate_receipt;
  for (const item of queue.items) {
    if (!nonEmpty(item.work_id)) continue;
    const contract = PRODUCTION_WORK_CONTRACTS[item.work_id];
    for (const gate of item.prerequisite_gates || []) {
      if (gate.status !== 'satisfied') continue;
      const gateKey = `${item.work_id}|${gate.gate_id}`;
      if (receivedGateKeys.has(gateKey)) continue;
      const contractGate = contract?.prerequisite_gates?.[gate.gate_id];
      if (
        !contractGate ||
        gate.owner_role !== contractGate.owner_role ||
        gate.gate_kind !== contractGate.gate_kind ||
        !contractGate.evidence_pattern.test(gate.evidence_ref || '')
      ) {
        throw new Error(`승인된 생산계약과 일치하지 않는 선행 게이트는 영수증을 발급할 수 없습니다: ${gateKey}`);
      }
      const evidenceKey = `${item.work_id}|${gate.gate_id}|${gate.evidence_ref}`;
      if (
        verifiedEvidence?.[verifiedEvidenceBrand] !== true ||
        !verifiedEvidence.gateProofs.has(evidenceKey)
      ) {
        throw new Error(`실제 외부 사실 검증 없이 선행 게이트 영수증을 발급할 수 없습니다: ${gateKey}`);
      }
      const receipt = {
        sequence: next.prerequisite_gate_receipts.length + 1,
        work_id: item.work_id,
        gate_id: gate.gate_id,
        evidence_ref: gate.evidence_ref,
        verified_by_role: contractGate.owner_role,
        verification_method: contractGate.verification_method,
        verification_proof: verifiedEvidence.gateProofs.get(evidenceKey),
        verified_on: queue.audited_on,
        previous_receipt: previousReceipt,
      };
      receipt.receipt = prerequisiteGateReceiptReceipt(receipt);
      next.prerequisite_gate_receipts.push(receipt);
      receivedGateKeys.add(gateKey);
      previousReceipt = receipt.receipt;
    }
  }
  next.prerequisite_gate_receipt = previousReceipt;
  const errors = validateQueueItemRegistry(next, queue, {
    allowUnregisteredQueueItems: true,
    previousRegistry,
  });
  if (errors.length) throw new Error(`production queue 선행 게이트 영수증 실패: ${errors.join(' | ')}`);
  return next;
}

export function appendReleaseCheckReceipts(
  registry,
  queue,
  {previousRegistry = null, verifiedEvidence = null} = {},
) {
  const next = registry ? JSON.parse(JSON.stringify(registry)) : emptyQueueItemRegistry();
  if (!Array.isArray(next.release_check_receipts)) next.release_check_receipts = [];
  if (!nonEmpty(next.release_check_receipt)) {
    next.release_check_receipt = releaseCheckReceiptGenesis();
  }
  const preparationErrors = validateQueueItemRegistry(next, queue, {
    allowUnregisteredQueueItems: true,
    previousRegistry,
  });
  if (preparationErrors.length) {
    throw new Error(`production queue 운영검증 영수증 준비 실패: ${preparationErrors.join(' | ')}`);
  }
  const receivedKeys = new Set(
    next.release_check_receipts
      .map(receipt => `${receipt.work_id}|${receipt.check_id}`),
  );
  let previousReceipt = next.release_check_receipt;
  for (const item of queue.items) {
    if (!nonEmpty(item.work_id)) continue;
    for (const check of item.release_checks || []) {
      if (check.status !== 'passed') continue;
      const releaseKey = `${item.work_id}|${check.check_id}`;
      if (receivedKeys.has(releaseKey)) continue;
      const evidenceKey = `${releaseKey}|${check.evidence_ref}`;
      if (
        verifiedEvidence?.[verifiedEvidenceBrand] !== true ||
        !verifiedEvidence.releaseProofs.has(evidenceKey)
      ) {
        throw new Error(`실제 산출물 검증 없이 운영검증 영수증을 발급할 수 없습니다: ${releaseKey}`);
      }
      const receipt = {
        sequence: next.release_check_receipts.length + 1,
        work_id: item.work_id,
        check_id: check.check_id,
        evidence_ref: check.evidence_ref,
        verification_proof: verifiedEvidence.releaseProofs.get(evidenceKey),
        verified_on: queue.audited_on,
        previous_receipt: previousReceipt,
      };
      receipt.receipt = releaseCheckReceiptReceipt(receipt);
      next.release_check_receipts.push(receipt);
      receivedKeys.add(releaseKey);
      previousReceipt = receipt.receipt;
    }
  }
  next.release_check_receipt = previousReceipt;
  const errors = validateQueueItemRegistry(next, queue, {
    allowUnregisteredQueueItems: true,
    previousRegistry,
  });
  if (errors.length) {
    throw new Error(`production queue 운영검증 영수증 발급 실패: ${errors.join(' | ')}`);
  }
  return next;
}

export function appendQueuePrBindings(registry, queue, {previousRegistry = null} = {}) {
  const next = registry ? JSON.parse(JSON.stringify(registry)) : emptyQueueItemRegistry();
  if (!Array.isArray(next.pr_bindings)) next.pr_bindings = [];
  if (!nonEmpty(next.pr_binding_receipt)) next.pr_binding_receipt = prBindingGenesisReceipt();
  const preparationErrors = validateQueueItemRegistry(next, queue, {
    allowUnregisteredQueueItems: true,
    previousRegistry,
  });
  if (preparationErrors.length) {
    throw new Error(`production queue PR 결박 준비 실패: ${preparationErrors.join(' | ')}`);
  }
  const boundWorkIds = new Set(next.pr_bindings.map(binding => binding.work_id));
  const boundPrs = new Set(next.pr_bindings.map(binding => binding.pr_number));
  let previousReceipt = next.pr_binding_receipt;
  for (const item of queue.items) {
    if (!nonEmpty(item.work_id) || !isPositiveInteger(item.pr_number)) continue;
    if (boundWorkIds.has(item.work_id)) continue;
    if (boundPrs.has(item.pr_number)) {
      throw new Error(`PR 번호를 둘 이상의 작업에 결박할 수 없습니다: #${item.pr_number}`);
    }
    if (!nonEmpty(item.branch)) {
      throw new Error(`PR 결박에는 branch가 필요합니다: ${item.work_id}`);
    }
    const binding = {
      sequence: next.pr_bindings.length + 1,
      work_id: item.work_id,
      pr_number: item.pr_number,
      branch: item.branch,
      bound_on: queue.audited_on,
      previous_receipt: previousReceipt,
    };
    binding.receipt = prBindingReceipt(binding);
    next.pr_bindings.push(binding);
    boundWorkIds.add(item.work_id);
    boundPrs.add(item.pr_number);
    previousReceipt = binding.receipt;
  }
  next.pr_binding_receipt = previousReceipt;
  const errors = validateQueueItemRegistry(next, queue, {
    allowUnregisteredQueueItems: true,
    previousRegistry,
  });
  if (errors.length) throw new Error(`production queue PR 결박 실패: ${errors.join(' | ')}`);
  return next;
}

export function appendQueueHeadReceipts(registry, queue, {previousRegistry = null} = {}) {
  const next = registry ? JSON.parse(JSON.stringify(registry)) : emptyQueueItemRegistry();
  if (!Array.isArray(next.head_receipts)) next.head_receipts = [];
  if (!nonEmpty(next.head_receipt)) next.head_receipt = headReceiptGenesisReceipt();
  const preparationErrors = validateQueueItemRegistry(next, queue, {
    allowUnregisteredQueueItems: true,
    previousRegistry,
  });
  if (preparationErrors.length) {
    throw new Error(`production queue head 감사 준비 실패: ${preparationErrors.join(' | ')}`);
  }
  const latestHeadByWorkId = new Map();
  const seenHeads = new Set();
  for (const receipt of next.head_receipts) {
    latestHeadByWorkId.set(receipt.work_id, receipt.head_sha);
    seenHeads.add(`${receipt.work_id}|${receipt.head_sha}`);
  }
  const bindingsByWorkId = new Map(
    (next.pr_bindings || []).map(binding => [binding.work_id, binding]),
  );
  let previousReceipt = next.head_receipt;
  for (const item of queue.items) {
    if (!nonEmpty(item.work_id) || !isPositiveInteger(item.pr_number)) continue;
    if (latestHeadByWorkId.get(item.work_id) === item.head_sha) continue;
    const binding = bindingsByWorkId.get(item.work_id);
    if (!binding || binding.pr_number !== item.pr_number) {
      throw new Error(`head 감사 전에 work_id와 PR을 먼저 결박해야 합니다: ${item.work_id}`);
    }
    const headKey = `${item.work_id}|${item.head_sha}`;
    if (seenHeads.has(headKey)) {
      throw new Error(`과거 head로 되돌아갈 수 없습니다: ${headKey}`);
    }
    const receipt = {
      sequence: next.head_receipts.length + 1,
      work_id: item.work_id,
      pr_number: item.pr_number,
      head_sha: item.head_sha,
      audited_on: queue.audited_on,
      previous_receipt: previousReceipt,
    };
    receipt.receipt = headReceiptReceipt(receipt);
    next.head_receipts.push(receipt);
    latestHeadByWorkId.set(item.work_id, item.head_sha);
    seenHeads.add(headKey);
    previousReceipt = receipt.receipt;
  }
  next.head_receipt = previousReceipt;
  const errors = validateQueueItemRegistry(next, queue, {previousRegistry});
  if (errors.length) throw new Error(`production queue head 감사 실패: ${errors.join(' | ')}`);
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
  const verifiedEvidence = await verifyProductionQueueExternalEvidence(queue, {
    registry,
    ...(io.evidence || {}),
  });
  const registered = appendQueueItemRegistrations(registry, queue, {previousRegistry});
  const gated = appendPrerequisiteGateReceipts(registered, queue, {
    previousRegistry,
    verifiedEvidence,
  });
  const released = appendReleaseCheckReceipts(gated, queue, {
    previousRegistry,
    verifiedEvidence,
  });
  const bound = appendQueuePrBindings(released, queue, {previousRegistry});
  const updatedRegistry = appendQueueHeadReceipts(bound, queue, {previousRegistry});
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
  return value === 'README.md'
    || value === 'artifacts/publication/production-queue.json'
    || value === 'artifacts/publication/production-queue-registry.json'
    || value === 'artifacts/publication/topics/manifest.json'
    || value === 'artifacts/publication/concepts/manifest.json'
    || /^artifacts\/publication\/topics\/[a-z0-9-]+\.json$/u.test(value)
    || /^artifacts\/publication\/concepts\/[a-z0-9-]+\.json$/u.test(value)
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
  const workTopicMeasurements = new Map();
  const existingRevisionTopicFiles = queue.items
    .filter(item => item?.change_mode === 'existing_topic_revision')
    .map(item => item?.topic_file)
    .filter(nonEmpty);
  for (const topicFile of new Set(existingRevisionTopicFiles)) {
    const topic = JSON.parse(await read(path.join(repoRoot, topicFile), 'utf8'));
    topicReceipts.set(topicFile, topicReceipt(topic));
    for (const item of queue.items.filter(candidate => (
      candidate?.work_id && candidate.topic_file === topicFile
    ))) {
      const contract = PRODUCTION_WORK_CONTRACTS[item.work_id];
      if (contract) workTopicMeasurements.set(item.work_id, measureWorkTopic(topic, contract));
    }
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
    workTopicMeasurements,
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
    workTopicMeasurements = null,
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
  const byWorkId = new Map();
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

    const hasWorkId = nonEmpty(item.work_id);
    if (hasWorkId) {
      if (!/^[a-z0-9][a-z0-9._-]*$/u.test(item.work_id)) {
        errors.push(`${label}.work_id 형식이 올바르지 않습니다.`);
      } else if (byWorkId.has(item.work_id)) {
        errors.push(`중복 work_id: ${item.work_id}`);
      } else {
        byWorkId.set(item.work_id, item);
      }
      if (nonEmpty(item.queue_id) && item.queue_id !== `publication-work-${item.work_id}`) {
        errors.push(`${label}.queue_id는 불변 work_id에서 계산해야 합니다.`);
      }
    }
    if (isPositiveInteger(item.pr_number)) {
      if (byPr.has(item.pr_number)) errors.push(`중복 PR 번호: #${item.pr_number}`);
      else byPr.set(item.pr_number, item);
    } else if (!hasWorkId || !prePrStatuses.has(item.status)) {
      errors.push(`${label}.pr_number는 pr_open 이상 상태에서 필요한 양의 정수입니다.`);
    }

    for (const field of ['title_ko', 'owner_role', 'topic_id', 'topic_file', 'test_file']) {
      if (!nonEmpty(item[field])) errors.push(`${label}.${field}가 필요합니다.`);
    }
    const requiresPr = !hasWorkId || !prePrStatuses.has(item.status);
    if (requiresPr) {
      for (const field of ['branch', 'head_sha']) {
        if (!nonEmpty(item[field])) errors.push(`${label}.${field}가 PR 결박 상태에 필요합니다.`);
      }
    }
    if (nonEmpty(item.branch) && !/^codex\/content-[a-z0-9._/-]+$/u.test(item.branch)) {
      errors.push(`${label}.branch는 codex/content-* 형식이어야 합니다.`);
    }
    if (nonEmpty(item.head_sha) && !/^[0-9a-f]{40}$/u.test(item.head_sha)) {
      errors.push(`${label}.head_sha는 40자리 커밋 SHA여야 합니다.`);
    }
    if (isPositiveInteger(item.pr_number) !== nonEmpty(item.head_sha)) {
      errors.push(`${label}.pr_number와 head_sha는 함께 결박해야 합니다.`);
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
      const claimIdentity = hasWorkId ? item.work_id : `#${item.pr_number}`;
      if (prior) errors.push(`활성 topic_id 중복: ${item.topic_id} (${prior}, ${claimIdentity})`);
      else topicClaims.set(item.topic_id, claimIdentity);
    }
    if (nonEmpty(item.topic_file) && !releasedClaimStatuses.has(item.status)) {
      const prior = fileClaims.get(item.topic_file);
      const claimIdentity = hasWorkId ? item.work_id : `#${item.pr_number}`;
      if (prior) errors.push(`활성 topic_file 중복: ${item.topic_file} (${prior}, ${claimIdentity})`);
      else fileClaims.set(item.topic_file, claimIdentity);
    }

    const counts = item.counts;
    if (!counts || typeof counts !== 'object') errors.push(`${label}.counts가 필요합니다.`);
    else for (const field of ['sources', 'rule_cards', 'scenario_branches', 'content_entries', 'topic_hubs']) {
      if (!isPositiveInteger(counts[field])) errors.push(`${label}.counts.${field}는 양의 정수여야 합니다.`);
    }
    if (counts?.authority_units !== undefined
      && (!Number.isInteger(counts.authority_units) || counts.authority_units < 0)) {
      errors.push(`${label}.counts.authority_units는 0 이상의 정수여야 합니다.`);
    }

    if (!Array.isArray(item.depends_on_prs)) errors.push(`${label}.depends_on_prs 배열이 필요합니다.`);
    else {
      const unique = new Set(item.depends_on_prs);
      if (unique.size !== item.depends_on_prs.length) errors.push(`${label}.depends_on_prs에 중복이 있습니다.`);
      if (isPositiveInteger(item.pr_number) && unique.has(item.pr_number)) errors.push(`${label}가 자기 PR에 의존합니다.`);
      for (const pr of unique) if (!isPositiveInteger(pr)) errors.push(`${label}.depends_on_prs 값은 양의 정수여야 합니다.`);
    }
    if (item.depends_on_work_ids !== undefined) {
      if (!Array.isArray(item.depends_on_work_ids)) {
        errors.push(`${label}.depends_on_work_ids는 배열이어야 합니다.`);
      } else {
        const unique = new Set(item.depends_on_work_ids);
        if (unique.size !== item.depends_on_work_ids.length) {
          errors.push(`${label}.depends_on_work_ids에 중복이 있습니다.`);
        }
        if (hasWorkId && unique.has(item.work_id)) errors.push(`${label}가 자기 work_id에 의존합니다.`);
        for (const workId of unique) {
          if (!nonEmpty(workId)) errors.push(`${label}.depends_on_work_ids 값이 올바르지 않습니다.`);
        }
      }
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

    if (hasWorkId) {
      const workContract = PRODUCTION_WORK_CONTRACTS[item.work_id];
      if (!workContract) {
        errors.push(`${label}.work_id에 승인된 생산계약이 없습니다: ${item.work_id}`);
      } else {
        for (const field of ['topic_id', 'topic_file', 'test_file', 'change_mode']) {
          if (item[field] !== workContract[field]) {
            errors.push(`${label}.${field}가 승인된 생산계약과 다릅니다: ${item.work_id}`);
          }
        }
        if (nonEmpty(item.branch) && item.branch !== workContract.branch) {
          errors.push(`${label}.branch가 승인된 생산계약과 다릅니다: ${item.work_id}`);
        }
        if (canonicalJson(item.counts) !== canonicalJson(workContract.counts)) {
          errors.push(`${label}.counts가 승인된 생산계약과 다릅니다: ${item.work_id}`);
        }
        if (canonicalJson(item.quality_targets) !== canonicalJson(workContract.quality_targets)) {
          errors.push(`${label}.quality_targets가 승인된 생산계약과 다릅니다: ${item.work_id}`);
        }
        if (
          canonicalJson(item.depends_on_work_ids ?? []) !==
          canonicalJson(workContract.depends_on_work_ids)
        ) {
          errors.push(`${label}.depends_on_work_ids가 승인된 생산계약과 다릅니다: ${item.work_id}`);
        }
        if (completedMeasurementStatuses.has(item.status)) {
          const measurement = workTopicMeasurements?.get?.(item.work_id);
          if (!measurement) {
            errors.push(`${label}의 완료 상태에는 실제 topic 품질 측정값이 필요합니다: ${item.work_id}`);
          } else {
            if (canonicalJson(measurement.counts) !== canonicalJson(workContract.counts)) {
              errors.push(`${label}의 실제 topic 객체 수가 생산계약과 다릅니다: ${item.work_id}`);
            }
            const expectedAfter = {
              duplicate_rule: workContract.quality_targets.duplicate_rule_after,
              blank_audience: workContract.quality_targets.blank_audience_after,
              copied_search: workContract.quality_targets.copied_search_after,
              nonstandard_content_type: workContract.quality_targets.nonstandard_content_type_after,
              typed_relation: workContract.quality_targets.typed_relation_after,
            };
            if (canonicalJson(measurement.quality) !== canonicalJson(expectedAfter)) {
              errors.push(`${label}의 실제 topic 품질 수치가 생산계약 after 값과 다릅니다: ${item.work_id}`);
            }
          }
        }
      }

      if (!Array.isArray(item.prerequisite_gates) || item.prerequisite_gates.length === 0) {
        errors.push(`${label}.prerequisite_gates에는 하나 이상의 구조화 선행 게이트가 필요합니다.`);
      } else {
        const gateIds = new Set();
        for (const gate of item.prerequisite_gates) {
          if (!nonEmpty(gate?.gate_id)) errors.push(`${label}.prerequisite_gates.gate_id가 필요합니다.`);
          else if (gateIds.has(gate.gate_id)) errors.push(`${label}.prerequisite_gates.gate_id가 중복됩니다: ${gate.gate_id}`);
          else gateIds.add(gate.gate_id);
          if (!prerequisiteGateKinds.has(gate?.gate_kind)) {
            errors.push(`${label}.prerequisite_gates.gate_kind가 올바르지 않습니다: ${gate?.gate_id || '?'}`);
          }
          if (!Object.hasOwn(OWNER_ROLE_CONTRACTS, gate?.owner_role)) {
            errors.push(`${label}.prerequisite_gates.owner_role이 올바르지 않습니다: ${gate?.gate_id || '?'}`);
          }
          if (!prerequisiteGateStatuses.has(gate?.status)) {
            errors.push(`${label}.prerequisite_gates.status가 올바르지 않습니다: ${gate?.gate_id || '?'}`);
          }
          if (gate?.status === 'satisfied' && !nonEmpty(gate.evidence_ref)) {
            errors.push(`${label}의 충족된 선행 게이트에는 evidence_ref가 필요합니다: ${gate?.gate_id || '?'}`);
          }
          if (
            gate?.gate_kind === 'external_pr' &&
            gate?.status === 'satisfied' &&
            !/^[a-z0-9_.-]+\/[a-z0-9_.-]+#\d+@[0-9a-f]{40}$/u.test(gate.evidence_ref || '')
          ) {
            errors.push(`${label}의 외부 PR 게이트 evidence_ref는 owner/repo#PR@40SHA 형식이어야 합니다: ${gate?.gate_id || '?'}`);
          }
          const expectedGate = workContract?.prerequisite_gates?.[gate?.gate_id];
          if (!expectedGate) {
            errors.push(`${label}의 승인되지 않은 선행 게이트입니다: ${gate?.gate_id || '?'}`);
          } else {
            if (
              gate.gate_kind !== expectedGate.gate_kind ||
              gate.owner_role !== expectedGate.owner_role
            ) {
              errors.push(`${label}의 선행 게이트 종류·소유자가 생산계약과 다릅니다: ${gate.gate_id}`);
            }
            if (
              gate.status === 'satisfied' &&
              !expectedGate.evidence_pattern.test(gate.evidence_ref || '')
            ) {
              errors.push(`${label}의 선행 게이트 증거가 생산계약 형식과 다릅니다: ${gate.gate_id}`);
            }
          }
        }
        const expectedGateIds = Object.keys(workContract?.prerequisite_gates ?? {}).sort();
        const actualGateIds = [...gateIds].sort();
        if (canonicalJson(actualGateIds) !== canonicalJson(expectedGateIds)) {
          errors.push(`${label}.prerequisite_gates가 승인된 필수 게이트 집합과 다릅니다: ${item.work_id}`);
        }
        if (
          gateProtectedStatuses.has(item.status) &&
          item.prerequisite_gates.some(gate => gate.status !== 'satisfied')
        ) {
          errors.push(`${label}는 모든 선행 게이트가 충족되기 전 ${item.status} 상태로 이동할 수 없습니다.`);
        }
      }

      const quality = item.quality_targets;
      const qualityFields = [
        'duplicate_rule_before',
        'duplicate_rule_after',
        'blank_audience_before',
        'blank_audience_after',
        'copied_search_before',
        'copied_search_after',
        'nonstandard_content_type_before',
        'nonstandard_content_type_after',
        'typed_relation_after',
      ];
      if (!quality || typeof quality !== 'object') {
        errors.push(`${label}.quality_targets가 필요합니다.`);
      } else {
        for (const field of qualityFields) {
          if (!Number.isInteger(quality[field]) || quality[field] < 0) {
            errors.push(`${label}.quality_targets.${field}는 0 이상의 정수여야 합니다.`);
          }
        }
        for (const [before, after] of [
          ['duplicate_rule_before', 'duplicate_rule_after'],
          ['blank_audience_before', 'blank_audience_after'],
          ['copied_search_before', 'copied_search_after'],
          ['nonstandard_content_type_before', 'nonstandard_content_type_after'],
        ]) {
          if (Number.isInteger(quality[before]) && Number.isInteger(quality[after]) && quality[after] > quality[before]) {
            errors.push(`${label}.quality_targets.${after}가 ${before}보다 커질 수 없습니다.`);
          }
        }
      }

      if (!Array.isArray(item.release_checks) || item.release_checks.length === 0) {
        errors.push(`${label}.release_checks에는 하나 이상의 운영 검증이 필요합니다.`);
      } else {
        const checkIds = new Set();
        for (const check of item.release_checks) {
          if (!nonEmpty(check?.check_id)) errors.push(`${label}.release_checks.check_id가 필요합니다.`);
          else if (checkIds.has(check.check_id)) errors.push(`${label}.release_checks.check_id가 중복됩니다: ${check.check_id}`);
          else checkIds.add(check.check_id);
          if (!releaseCheckStatuses.has(check?.status)) {
            errors.push(`${label}.release_checks.status가 올바르지 않습니다: ${check?.check_id || '?'}`);
          }
          if (check?.status === 'passed' && !nonEmpty(check.evidence_ref)) {
            errors.push(`${label}의 통과한 release check에는 evidence_ref가 필요합니다: ${check?.check_id || '?'}`);
          } else if (
            check?.status === 'passed' &&
            !releaseCheckEvidencePatterns[check?.check_id]?.test(check.evidence_ref)
          ) {
            errors.push(`${label}의 release check 증거가 승인된 형식과 다릅니다: ${check?.check_id || '?'}`);
          }
        }
        const expectedCheckIds = [...(workContract?.release_check_ids ?? [])].sort();
        const actualCheckIds = [...checkIds].sort();
        if (canonicalJson(actualCheckIds) !== canonicalJson(expectedCheckIds)) {
          errors.push(`${label}.release_checks가 승인된 필수 운영검증 집합과 다릅니다: ${item.work_id}`);
        }
        if (
          ['integrated', 'merged_pending_publication'].includes(item.status) &&
          item.release_checks.some(check => check.status !== 'passed' || !nonEmpty(check.evidence_ref))
        ) {
          errors.push(`${label}는 모든 release check 증거가 통과되기 전 ${item.status} 상태가 될 수 없습니다.`);
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
    if (item.change_mode === 'new_topic' && item.status === 'superseded') {
      if (!nonEmpty(item.terminal_reason_ko)) errors.push(`${label}.terminal_reason_ko는 미출판 신규 주제의 대체 종료 이력에 필요합니다.`);
      if (!item.superseded_by || typeof item.superseded_by !== 'object') {
        errors.push(`${label}.superseded_by는 대체 PR과 감사 head를 보존해야 합니다.`);
      } else {
        if (!isPositiveInteger(item.superseded_by.pr_number) || item.superseded_by.pr_number === item.pr_number) {
          errors.push(`${label}.superseded_by.pr_number가 올바르지 않습니다.`);
        }
        if (!/^[0-9a-f]{40}$/u.test(item.superseded_by.head_sha || '')) {
          errors.push(`${label}.superseded_by.head_sha는 40자리 커밋 SHA여야 합니다.`);
        }
      }
      if (item.integration_order !== null) errors.push(`${label}의 superseded 상태에는 integration_order가 null이어야 합니다.`);
      for (const field of ['integrated_snapshot_id', 'migration_commit_sha', 'absorbed_head_sha', 'topic_receipt', 'integration_mode']) {
        if (item[field] !== undefined) errors.push(`${label}.${field}는 출판되지 않은 신규 주제의 superseded 이력에 사용할 수 없습니다.`);
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
    if (item.source_freshness?.timeline_missing_source_ids !== undefined) {
      const missingIds = item.source_freshness.timeline_missing_source_ids;
      if (!Array.isArray(missingIds) || missingIds.length === 0 || missingIds.some(value => !nonEmpty(value))) {
        errors.push(`${label}.source_freshness.timeline_missing_source_ids는 비어 있지 않은 source_id 배열이어야 합니다.`);
      } else if (new Set(missingIds).size !== missingIds.length) {
        errors.push(`${label}.source_freshness.timeline_missing_source_ids에 중복이 있습니다.`);
      }
      if (item.source_freshness.follow_up_owner_role !== 'source_maintenance') {
        errors.push(`${label}.source_freshness.follow_up_owner_role은 source_maintenance여야 합니다.`);
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
        if (!['ready_for_integration', 'integrated', 'merged_pending_publication'].includes(item.status)) errors.push(`${label}.supersedes_prs는 ready_for_integration, integrated 또는 merged_pending_publication 항목에만 사용할 수 있습니다.`);
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
    for (const dependency of item.depends_on_work_ids || []) {
      const target = byWorkId.get(dependency);
      const itemLabel = nonEmpty(item.work_id) ? item.work_id : `#${item.pr_number}`;
      if (!target) {
        errors.push(`${itemLabel}의 선행 work_id가 대기열에 없습니다: ${dependency}`);
      } else if (
        dependencyProtectedStatuses.has(item.status) &&
        !['migration_required', 'integrated'].includes(target.status)
      ) {
        errors.push(`${itemLabel}가 완료되지 않은 선행 작업 ${dependency}에 의존합니다.`);
      }
    }
  }

  for (const item of queue.items) {
    for (const supersededPr of item.supersedes_prs || []) {
      const supersededItem = byPr.get(supersededPr);
      if (supersededItem && supersededItem.status !== 'superseded') {
        errors.push(`#${item.pr_number}가 대체한 #${supersededPr}은 삭제하지 않고 superseded 이력으로 보존해야 합니다.`);
      } else if (supersededItem) {
        if (supersededItem.superseded_by?.pr_number !== item.pr_number) {
          errors.push(`#${supersededPr}.superseded_by.pr_number는 대체 PR #${item.pr_number}와 일치해야 합니다.`);
        }
        if (supersededItem.superseded_by?.head_sha !== item.head_sha) {
          errors.push(`#${supersededPr}.superseded_by.head_sha는 대체 PR #${item.pr_number}의 감사 head와 일치해야 합니다.`);
        }
        if (supersededItem.topic_id !== item.topic_id || supersededItem.topic_file !== item.topic_file) {
          errors.push(`#${item.pr_number}와 대체 대상 #${supersededPr}의 topic 정체성이 다릅니다.`);
        }
      }
    }
  }
  for (const item of queue.items.filter(value => value.change_mode === 'new_topic' && value.status === 'superseded')) {
    const replacement = byPr.get(item.superseded_by?.pr_number);
    if (!replacement) {
      errors.push(`#${item.pr_number}.superseded_by가 가리키는 대체 PR이 대기열에 없습니다.`);
    } else if (!(replacement.supersedes_prs || []).includes(item.pr_number)) {
      errors.push(`#${item.pr_number}의 대체 관계가 #${replacement.pr_number}.supersedes_prs에 양방향으로 기록되지 않았습니다.`);
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

  const visitingWork = new Set();
  const visitedWork = new Set();
  function visitWork(workId) {
    if (visitingWork.has(workId)) {
      errors.push(`work_id 의존성 순환이 있습니다: ${workId}`);
      return;
    }
    if (visitedWork.has(workId)) return;
    visitingWork.add(workId);
    for (const dependency of byWorkId.get(workId)?.depends_on_work_ids || []) {
      if (byWorkId.has(dependency)) visitWork(dependency);
    }
    visitingWork.delete(workId);
    visitedWork.add(workId);
  }
  for (const workId of byWorkId.keys()) visitWork(workId);

  const summary = queue.audit_summary || {};
  const openContentPrs = queue.items.filter(item => openPrStatuses.has(item.status)).length;
  if (summary.open_content_prs !== openContentPrs) errors.push(`audit_summary.open_content_prs와 실제 열린 상태 수가 다릅니다: expected=${openContentPrs}, actual=${String(summary.open_content_prs)}`);
  const sourceTotal = queue.items.reduce((sum, item) => sum + (item.counts?.sources || 0), 0);
  if (summary.official_source_references_checked !== sourceTotal) {
    errors.push('audit_summary.official_source_references_checked와 대기열 근거 합계가 다릅니다.');
  }
  const statusSummaryKeys = ['ready_for_integration', 'needs_rework', 'migration_required', 'blocked', 'integrated', 'merged_pending_publication', 'superseded', 'withdrawn'];
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
