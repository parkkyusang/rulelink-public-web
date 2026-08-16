import {createHash} from 'node:crypto';
import path from 'node:path';

export const TOPIC_CANDIDATE_V3_SCHEMA = 'rulelink_topic_candidate_import_v3';
const sha40 = /^[0-9a-f]{40}$/u;
const sha64 = /^[0-9a-f]{64}$/u;
const topicPathPattern =
  /^artifacts\/publication\/topics\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u;
const testPathPattern =
  /^web\/rulelink_public_next\/scripts\/[a-z0-9]+(?:-[a-z0-9]+)*\.test\.mjs$/u;
const terminalStatuses = new Set(['withdrawn', 'superseded']);
const allowedStatuses = new Set([
  'awaiting_pr',
  'blocked',
  'needs_rework',
  'pr_open',
  'ready_for_integration',
  'migration_required',
  'integrated',
  'merged_pending_publication',
]);
const claimHoldingStatuses = new Set([
  'awaiting_pr',
  'blocked',
  'needs_rework',
  'pr_open',
  'ready_for_integration',
  'migration_required',
  'merged_pending_publication',
]);
const replacementTargetStatuses = new Set([
  ...claimHoldingStatuses,
  'integrated',
]);
const supportedGateVerificationMethods = new Set([
  'publication_live_parity',
  'github_merged_head',
  'github_authority_evidence',
  'git_ancestor',
  'legal_answer_packet_activation_v1',
  'work_status_receipt',
  'source_locator_selection_v2',
]);
const supportedReleaseCheckIds = new Set([
  'current-equals-snapshot-024',
  'canonical-urls-unchanged',
  'official-urls-pass',
  'runtime-responsive-no-overflow',
  'runtime-keyboard-reading-path',
  'runtime-fragment-state-restore',
  'search-hub-sitemap-200',
]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function uniqueStrings(value) {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'string' && item.length > 0) &&
    new Set(value).size === value.length
  );
}

function validateRegisteredProductionContract(item, candidate, label) {
  const errors = [];
  const exactFields = [
    ['counts', 'expected_counts'],
    ['quality_targets', 'expected_quality_targets'],
    ['depends_on_work_ids', 'expected_depends_on_work_ids'],
    ['integration_checks', 'expected_integration_checks'],
  ];
  for (const [itemField, candidateField] of exactFields) {
    if (
      canonicalJson(item[itemField] ?? []) !==
      canonicalJson(candidate[candidateField] ?? [])
    ) {
      errors.push(
        `${label}: ${itemField}가 등록된 v3 생산계약과 다릅니다.`,
      );
    }
  }
  if (
    !candidate.expected_counts ||
    typeof candidate.expected_counts !== 'object' ||
    Array.isArray(candidate.expected_counts)
  ) {
    errors.push(`${label}: expected_counts가 필요합니다.`);
  }
  if (
    !candidate.expected_quality_targets ||
    typeof candidate.expected_quality_targets !== 'object' ||
    Array.isArray(candidate.expected_quality_targets)
  ) {
    errors.push(`${label}: expected_quality_targets가 필요합니다.`);
  }
  if (!uniqueStrings(candidate.expected_depends_on_work_ids ?? [])) {
    errors.push(`${label}: expected_depends_on_work_ids가 올바르지 않습니다.`);
  }
  if (
    !uniqueStrings(candidate.expected_integration_checks ?? []) ||
    candidate.expected_integration_checks.length === 0
  ) {
    errors.push(`${label}: expected_integration_checks가 올바르지 않습니다.`);
  }

  const expectedGates = candidate.expected_prerequisite_gates;
  if (
    !Array.isArray(expectedGates) ||
    expectedGates.length === 0 ||
    expectedGates.some(gate =>
      !gate ||
      typeof gate.gate_id !== 'string' ||
      typeof gate.gate_kind !== 'string' ||
      typeof gate.owner_role !== 'string' ||
      typeof gate.verification_method !== 'string' ||
      !supportedGateVerificationMethods.has(gate.verification_method) ||
      typeof gate.evidence_pattern !== 'string' ||
      gate.evidence_pattern_flags !== 'u'
    ) ||
    new Set((expectedGates ?? []).map(gate => gate.gate_id)).size !==
      (expectedGates ?? []).length
  ) {
    errors.push(`${label}: expected_prerequisite_gates가 올바르지 않습니다.`);
  } else {
    for (const gate of expectedGates) {
      let pattern;
      try {
        pattern = new RegExp(gate.evidence_pattern, gate.evidence_pattern_flags);
      } catch {
        errors.push(`${label}: ${gate.gate_id}의 evidence_pattern이 올바르지 않습니다.`);
        continue;
      }
      if (
        !gate.evidence_pattern.startsWith('^') ||
        !gate.evidence_pattern.endsWith('$') ||
        pattern.test('')
      ) {
        errors.push(
          `${label}: ${gate.gate_id}의 evidence_pattern은 비어 있지 않은 전체 증거를 결박해야 합니다.`,
        );
      }
      if (
        gate.verification_contract !== undefined &&
        typeof gate.verification_contract !== 'string'
      ) {
        errors.push(
          `${label}: ${gate.gate_id}의 verification_contract가 올바르지 않습니다.`,
        );
      }
    }
    const actualGates = (item.prerequisite_gates ?? []).map(gate => ({
      gate_id: gate.gate_id,
      gate_kind: gate.gate_kind,
      owner_role: gate.owner_role,
    }));
    const expectedGateIdentities = expectedGates.map(gate => ({
      gate_id: gate.gate_id,
      gate_kind: gate.gate_kind,
      owner_role: gate.owner_role,
    }));
    if (
      canonicalJson(actualGates) !== canonicalJson(expectedGateIdentities)
    ) {
      errors.push(`${label}: prerequisite_gates가 등록된 v3 생산계약과 다릅니다.`);
    }
    if (
      item.status === 'awaiting_pr' &&
      (item.prerequisite_gates ?? []).some(gate => gate.status !== 'pending')
    ) {
      errors.push(`${label}: awaiting_pr 선행 게이트는 pending이어야 합니다.`);
    }
  }

  if (
    !uniqueStrings(candidate.expected_release_check_ids ?? []) ||
    candidate.expected_release_check_ids.length === 0 ||
    candidate.expected_release_check_ids.some(
      checkId => !supportedReleaseCheckIds.has(checkId),
    )
  ) {
    errors.push(`${label}: expected_release_check_ids가 올바르지 않습니다.`);
  } else {
    const actualReleaseCheckIds = (item.release_checks ?? [])
      .map(check => check.check_id);
    if (
      canonicalJson(actualReleaseCheckIds) !==
      canonicalJson(candidate.expected_release_check_ids)
    ) {
      errors.push(`${label}: release_checks가 등록된 v3 생산계약과 다릅니다.`);
    }
    if (
      item.status === 'awaiting_pr' &&
      (item.release_checks ?? []).some(check => check.status !== 'pending')
    ) {
      errors.push(`${label}: awaiting_pr 운영검증은 pending이어야 합니다.`);
    }
  }
  return errors;
}

function sorted(values) {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, 'en'),
  );
}

function splitLines(value) {
  return String(value ?? '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean);
}

function currentTopicIds(bundle) {
  return new Set(
    (bundle?.knowledge?.topic_hubs ?? []).map(topic => topic.hub_id),
  );
}

export function topicCandidateV3ContractReceipt(item) {
  return sha256(canonicalJson({
    queue_id: item.queue_id,
    work_id: item.work_id,
    title_ko: item.title_ko,
    topic_id: item.topic_id,
    topic_file: item.topic_file,
    test_file: item.test_file,
    change_mode: item.change_mode,
    counts: item.counts,
    quality_targets: item.quality_targets,
    direct_merge: item.direct_merge,
    integrate_requires: item.integrate_requires,
    supersedes_work_ids: item.supersedes_work_ids ?? [],
    candidate_import: item.candidate_import,
  }));
}

function validateItemShape(item, label) {
  const errors = [];
  const candidate = item?.candidate_import;
  if (candidate?.schema !== TOPIC_CANDIDATE_V3_SCHEMA) return errors;
  if (!item.work_id || !item.queue_id) {
    errors.push(`${label}: v3 후보는 queue_id와 work_id가 필요합니다.`);
  }
  if (!topicPathPattern.test(item.topic_file ?? '')) {
    errors.push(`${label}: topic_file 경로가 올바르지 않습니다.`);
  }
  if (!testPathPattern.test(item.test_file ?? '')) {
    errors.push(`${label}: test_file 경로가 올바르지 않습니다.`);
  }
  if (
    candidate.candidate_kind !== 'existing_topic' &&
    candidate.candidate_kind !== 'new_topic'
  ) {
    errors.push(`${label}: candidate_kind가 올바르지 않습니다.`);
  }
  if (
    candidate.lifecycle_gate !== 'awaiting_pr' ||
    candidate.state !== 'approved_source'
  ) {
    errors.push(`${label}: v3 lifecycle/state가 올바르지 않습니다.`);
  }
  for (const field of ['approved_source_base_sha', 'approved_source_head_sha']) {
    if (!sha40.test(candidate[field] ?? '')) {
      errors.push(`${label}: ${field}는 40자리 commit SHA여야 합니다.`);
    }
  }
  if (candidate.approved_source_base_sha === candidate.approved_source_head_sha) {
    errors.push(`${label}: 승인 source base/head가 같을 수 없습니다.`);
  }
  for (const field of ['topic_before_sha256', 'topic_after_sha256']) {
    const value = candidate[field];
    if (
      (candidate.candidate_kind === 'existing_topic' || field === 'topic_after_sha256') &&
      !sha64.test(value ?? '')
    ) {
      errors.push(`${label}: ${field}가 올바르지 않습니다.`);
    }
    if (
      candidate.candidate_kind === 'new_topic' &&
      field === 'topic_before_sha256' &&
      value !== null
    ) {
      errors.push(`${label}: 신규 주제의 topic_before_sha256은 null이어야 합니다.`);
    }
  }
  if (!uniqueStrings(candidate.additional_regression_test_files ?? [])) {
    errors.push(`${label}: additional_regression_test_files가 올바르지 않습니다.`);
  }
  if (
    (candidate.additional_regression_test_files ?? [])
      .some(file => !testPathPattern.test(file))
  ) {
    errors.push(`${label}: 추가 회귀시험은 test.mjs 경로만 허용됩니다.`);
  }
  const expectedPaths = sorted([
    item.topic_file,
    item.test_file,
    ...(candidate.additional_regression_test_files ?? []),
  ]);
  const approvedFiles = candidate.approved_files;
  if (
    !Array.isArray(approvedFiles) ||
    approvedFiles.some(file =>
      !file ||
      typeof file.path !== 'string' ||
      !sha40.test(file.blob_sha ?? ''),
    ) ||
    new Set((approvedFiles ?? []).map(file => file.path)).size !==
      (approvedFiles ?? []).length
  ) {
    errors.push(`${label}: approved_files의 path/blob SHA가 올바르지 않습니다.`);
  } else if (
    canonicalJson(sorted(approvedFiles.map(file => file.path))) !==
    canonicalJson(expectedPaths)
  ) {
    errors.push(`${label}: approved_files가 등록된 topic/test 범위와 다릅니다.`);
  }
  if (!allowedStatuses.has(item.status) && !terminalStatuses.has(item.status)) {
    errors.push(`${label}: v3 후보 상태는 awaiting_pr 또는 종료 상태여야 합니다.`);
  }
  if (item.direct_merge !== false) {
    errors.push(`${label}: v3 후보는 직접 병합할 수 없습니다.`);
  }
  if (
    !['current_bundle', 'new_immutable_snapshot', 'migrate_publication']
      .every(value => (item.integrate_requires ?? []).includes(value))
  ) {
    errors.push(`${label}: publication migration 요구사항이 닫히지 않았습니다.`);
  }
  errors.push(...validateRegisteredProductionContract(item, candidate, label));
  return errors;
}

export function validateTopicCandidateV3QueueContract(
  queue,
  {itemRegistry = null} = {},
) {
  const errors = [];
  const items = queue?.items ?? [];
  const byWorkId = new Map(
    items.filter(item => item?.work_id).map(item => [item.work_id, item]),
  );
  const v3Items = items.filter(
    item => item?.candidate_import?.schema === TOPIC_CANDIDATE_V3_SCHEMA,
  );
  for (const item of v3Items) {
    const label = item.work_id || item.queue_id || 'v3-item';
    errors.push(...validateItemShape(item, label));
    const registrations = (itemRegistry?.registrations ?? [])
      .filter(registration =>
        registration.work_id === item.work_id &&
        registration.queue_id === item.queue_id,
      )
      .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
    const latest = registrations.at(-1);
    if (latest?.contract_sha256 !== topicCandidateV3ContractReceipt(item)) {
      errors.push(`${label}: append-only registry의 최신 계약과 다릅니다.`);
    }
  }

  const activeByTopic = new Map();
  const replacementOwners = new Map();
  for (const item of v3Items.filter(item =>
    claimHoldingStatuses.has(item.status)
  )) {
    const existing = activeByTopic.get(item.topic_file);
    if (existing) {
      errors.push(
        `${item.topic_file}: 활성 v3 후보가 중복됩니다: ${existing.work_id}, ${item.work_id}`,
      );
    }
    activeByTopic.set(item.topic_file, item);
    if (!uniqueStrings(item.supersedes_work_ids ?? [])) {
      errors.push(`${item.work_id}: supersedes_work_ids가 올바르지 않습니다.`);
      continue;
    }
    for (const oldWorkId of item.supersedes_work_ids ?? []) {
      const oldItem = byWorkId.get(oldWorkId);
      if (!oldItem || !terminalStatuses.has(oldItem.status)) {
        errors.push(`${item.work_id}: 대체 대상 ${oldWorkId}가 종료 이력이 아닙니다.`);
        continue;
      }
      if (
        oldItem.superseded_by_work_id !== item.work_id ||
        oldItem.topic_id !== item.topic_id ||
        oldItem.topic_file !== item.topic_file
      ) {
        errors.push(`${item.work_id}: ${oldWorkId}의 양방향 대체 관계가 닫히지 않았습니다.`);
      }
      const owner = replacementOwners.get(oldWorkId);
      if (owner && owner !== item.work_id) {
        errors.push(`${oldWorkId}: 둘 이상의 후속 작업이 같은 종료 이력을 재사용합니다.`);
      }
      replacementOwners.set(oldWorkId, item.work_id);
    }
  }
  for (const item of items.filter(item => item?.superseded_by_work_id)) {
    const replacement = byWorkId.get(item.superseded_by_work_id);
    if (
      !terminalStatuses.has(item.status) ||
      !replacement ||
      !replacementTargetStatuses.has(replacement.status) ||
      !(replacement.supersedes_work_ids ?? []).includes(item.work_id)
    ) {
      errors.push(`${item.work_id}: superseded_by_work_id의 역참조가 닫히지 않았습니다.`);
    }
  }
  return [...new Set(errors)];
}

async function commitRange(runGit, baseSha, headSha) {
  const rows = splitLines(await runGit([
    'rev-list',
    '--reverse',
    '--topo-order',
    '--parents',
    `${baseSha}..${headSha}`,
  ]));
  if (rows.length === 0) throw new Error('후보 PR commit 범위가 비었습니다.');
  for (const row of rows) {
    const [commit, ...parents] = row.split(/\s+/u);
    if (parents.length !== 1) {
      throw new Error(`후보 PR에는 merge commit을 넣을 수 없습니다: ${commit}`);
    }
  }
  return rows.map(row => row.split(/\s+/u)[0]);
}

export async function inspectTopicCandidateV3PullRequest({
  baseSha,
  headSha,
  actualFiles,
  changedTopics,
  runGit,
  queuePath = 'artifacts/publication/production-queue.json',
  registryPath = 'artifacts/publication/production-queue-registry.json',
  manifestPath = 'artifacts/publication/topics/manifest.json',
  currentPath = 'artifacts/publication/current/bundle.json',
}) {
  const [queueText, registryText, manifestText, currentText] = await Promise.all([
    runGit(['show', `${baseSha}:${queuePath}`]),
    runGit(['show', `${baseSha}:${registryPath}`]),
    runGit(['show', `${baseSha}:${manifestPath}`]),
    runGit(['show', `${baseSha}:${currentPath}`]),
  ]);
  const baseQueue = JSON.parse(queueText);
  const baseRegistry = JSON.parse(registryText);
  const queueErrors = validateTopicCandidateV3QueueContract(baseQueue, {
    itemRegistry: baseRegistry,
  });
  if (queueErrors.length > 0) {
    throw new Error(`base의 v3 등록 계약이 유효하지 않습니다: ${queueErrors.join(' | ')}`);
  }
  const registered = [];
  for (const topicFile of changedTopics) {
    const matches = (baseQueue.items ?? []).filter(item =>
      item.topic_file === topicFile &&
      item.status === 'awaiting_pr' &&
      item.candidate_import?.schema === TOPIC_CANDIDATE_V3_SCHEMA,
    );
    if (matches.length === 0) return null;
    if (matches.length !== 1) {
      throw new Error(`${topicFile}: 활성 v3 등록은 정확히 하나여야 합니다.`);
    }
    registered.push(matches[0]);
  }
  if (registered.length === 0) return null;

  const expectedFiles = sorted(registered.flatMap(item =>
    item.candidate_import.approved_files.map(file => file.path),
  ));
  if (canonicalJson(expectedFiles) !== canonicalJson(sorted(actualFiles))) {
    throw new Error('실제 PR 범위에 미등록 파일이 있거나 등록 파일이 누락됐습니다.');
  }
  await commitRange(runGit, baseSha, headSha);
  const manifest = JSON.parse(manifestText);
  const current = JSON.parse(currentText);
  const manifestByFile = new Map(
    (manifest.topics ?? []).map(entry => [
      `artifacts/publication/topics/${entry.file}`,
      entry.topic_id,
    ]),
  );
  const currentIds = currentTopicIds(current);
  const expectedTopics = [];
  for (const item of registered) {
    const candidate = item.candidate_import;
    await runGit(['cat-file', '-e', `${candidate.approved_source_base_sha}^{commit}`]);
    await runGit(['cat-file', '-e', `${candidate.approved_source_head_sha}^{commit}`]);
    await runGit([
      'merge-base',
      '--is-ancestor',
      candidate.approved_source_base_sha,
      candidate.approved_source_head_sha,
    ]);
    const sourceFiles = sorted(splitLines(await runGit([
      'diff',
      '--name-only',
      candidate.approved_source_base_sha,
      candidate.approved_source_head_sha,
    ])));
    const approvedPaths = sorted(candidate.approved_files.map(file => file.path));
    if (canonicalJson(sourceFiles) !== canonicalJson(approvedPaths)) {
      throw new Error(`${item.work_id}: 승인 source base/head의 변경 범위가 등록 blob 범위와 다릅니다.`);
    }
    for (const file of candidate.approved_files) {
      const sourceBlob = String(await runGit([
        'rev-parse',
        `${candidate.approved_source_head_sha}:${file.path}`,
      ])).trim();
      const actualBlob = String(await runGit([
        'rev-parse',
        `${headSha}:${file.path}`,
      ])).trim();
      if (sourceBlob !== file.blob_sha || actualBlob !== file.blob_sha) {
        throw new Error(`${item.work_id}: ${file.path}의 승인 source/실제 PR blob이 다릅니다.`);
      }
    }
    const topicText = await runGit(['show', `${headSha}:${item.topic_file}`]);
    const topic = JSON.parse(topicText);
    const manifestTopicId = manifestByFile.get(item.topic_file);
    if (candidate.candidate_kind === 'existing_topic') {
      if (manifestTopicId !== item.topic_id || !currentIds.has(item.topic_id)) {
        throw new Error(`${item.work_id}: 기존 주제가 base manifest/current에 없습니다.`);
      }
    } else if (
      manifestTopicId !== undefined ||
      currentIds.has(item.topic_id) ||
      [...manifestByFile.values()].includes(item.topic_id)
    ) {
      throw new Error(`${item.work_id}: 신규 주제가 base manifest/current와 충돌합니다.`);
    }
    if (topic.topic_id !== item.topic_id) {
      throw new Error(`${item.work_id}: topic_id가 등록과 다릅니다.`);
    }
    expectedTopics.push({
      workId: item.work_id,
      topicId: item.topic_id,
      topicFile: item.topic_file,
      candidateKind: candidate.candidate_kind,
      counts: candidate.expected_counts,
    });
  }
  return {
    mode: 'candidate',
    reason: 'registered_topic_candidate_v3',
    changedFiles: sorted(actualFiles),
    topicFiles: sorted(changedTopics),
    testFiles: sorted(actualFiles.filter(file => testPathPattern.test(file))),
    workIds: registered.map(item => item.work_id),
    expectedTopics,
  };
}

export function topicFileName(topicFile) {
  return path.basename(topicFile);
}
