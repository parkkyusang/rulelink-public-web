import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const candidateSchema = 'rulelink_existing_topic_candidate_import_v2';
const rangeMergePolicy =
  'exact_pr_base_reject_merge_commits_and_require_exact_path_union';

function canonicalJson(value) {
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

function normalizeExactText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function contentEntryMap(topic) {
  return new Map(
    (topic.content_entries ?? []).map(entry => [entry.content_id, entry]),
  );
}

function changedContentIds(beforeTopic, afterTopic) {
  const before = contentEntryMap(beforeTopic);
  const after = contentEntryMap(afterTopic);
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter(contentId => (
      !before.has(contentId) ||
      !after.has(contentId) ||
      canonicalJson(before.get(contentId)) !== canonicalJson(after.get(contentId))
    ))
    .sort();
}

function measureTopic(topic, canonicalContentTypes) {
  const entries = topic.content_entries ?? [];
  const rules = topic.rule_cards ?? [];
  const authorityUnits =
    topic.authority_reading_units ??
    topic.authority_explainers ??
    [];
  return {
    counts: {
      sources: (topic.sources ?? []).length,
      rule_cards: rules.length,
      scenario_branches: (topic.scenario_branches ?? []).length,
      content_entries: entries.length,
      topic_hubs: (topic.topic_hubs ?? []).length,
      authority_units: Array.isArray(authorityUnits) ? authorityUnits.length : -1,
    },
    quality: {
      duplicate_rule: rules.filter(rule => (
        normalizeExactText(rule.proposition_ko) ===
        normalizeExactText(rule.norm?.legal_effect_ko)
      )).length,
      blank_audience: entries.filter(
        entry => typeof entry.audience_situation_ko !== 'string' ||
          entry.audience_situation_ko.trim().length === 0,
      ).length,
      copied_search: entries.filter(entry => {
        const copiedFrom = new Set(
          [entry.title_ko, entry.slug]
            .map(normalizeExactText)
            .filter(Boolean),
        );
        return (entry.search_intents_ko ?? [])
          .map(normalizeExactText)
          .filter(Boolean)
          .some(intent => copiedFrom.has(intent));
      }).length,
      nonstandard_content_type: entries.filter(
        entry => !canonicalContentTypes.has(entry.content_type),
      ).length,
      typed_relation: entries.reduce(
        (sum, entry) =>
          sum + (Array.isArray(entry.related_edges) ? entry.related_edges.length : 0),
        0,
      ),
    },
  };
}

function contractProjection(contract) {
  return {
    contract_kind: contract.contract_kind,
    topic_id: contract.topic_id,
    topic_file: contract.topic_file,
    planned_test_file: contract.planned_test_file,
    planned_owned_paths: contract.planned_owned_paths,
    forbidden_paths: contract.forbidden_paths,
    target_content_ids: contract.target_content_ids,
    planning_snapshot_id: contract.planning_snapshot_id,
    planning_bundle_sha256: contract.planning_bundle_sha256,
    change_mode: contract.change_mode,
  };
}

function planContractProjection(plan, packet) {
  return {
    contract_kind: 'coverage_plan_existing_topic_v1',
    topic_id: packet.topic_id,
    topic_file: packet.topic_file,
    planned_test_file: packet.self_test_file,
    planned_owned_paths: packet.owned_paths,
    forbidden_paths: packet.forbidden_paths,
    target_content_ids: packet.target_content_ids,
    planning_snapshot_id: plan.generated_from?.snapshot_id,
    planning_bundle_sha256: plan.generated_from?.base_bundle_sha256,
    change_mode: 'existing_topic_revision',
  };
}

function splitLines(value) {
  return String(value ?? '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean);
}

async function commitPathUnion(runGit, baseSha, headSha) {
  const commitRows = splitLines(
    await runGit(['rev-list', '--reverse', '--topo-order', '--parents', `${baseSha}..${headSha}`]),
  );
  if (commitRows.length === 0) {
    throw new Error('candidate Git range에 commit이 없습니다.');
  }
  const commits = [];
  const changed = new Set();
  for (const row of commitRows) {
    const [commitSha, ...parents] = row.split(/\s+/u);
    if (parents.length !== 1) {
      throw new Error(
        `candidate Git range에는 merge commit을 허용하지 않습니다: ${commitSha}`,
      );
    }
    commits.push(commitSha);
    for (const file of splitLines(await runGit([
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      parents[0],
      commitSha,
    ]))) {
      changed.add(file);
    }
  }
  return {commits, changedFiles: [...changed].sort()};
}

export async function verifyExistingTopicCoverageCandidate({
  spec,
  contract,
  runGit,
  contentTypesPath,
  planPath =
    'artifacts/publication/coverage/coverage-expansion-plan.json',
}) {
  if (contract?.contract_kind !== 'coverage_plan_existing_topic_v1') {
    throw new Error(`coverage plan existing-topic work_id가 아닙니다: ${spec?.work_id || '?'}`);
  }
  for (const field of ['source_base_sha', 'source_head_sha', 'required_pr_base_sha']) {
    if (!/^[0-9a-f]{40}$/u.test(spec?.[field] || '')) {
      throw new Error(`${spec.work_id}.${field}는 40자리 commit SHA여야 합니다.`);
    }
  }
  if (
    spec.source_base_sha === spec.source_head_sha ||
    spec.required_pr_base_sha === spec.source_head_sha
  ) {
    throw new Error(`${spec.work_id}의 candidate base/head 경계가 닫히지 않았습니다.`);
  }
  if (!/^codex\/[a-z0-9._/-]+$/u.test(spec.source_branch || '')) {
    throw new Error(`${spec.work_id}.source_branch가 올바르지 않습니다.`);
  }

  const branchRef = `refs/heads/${spec.source_branch}`;
  const [branchHead, mergeBase, requiredPlanText, contentTypesText] =
    await Promise.all([
      runGit(['show-ref', '--verify', '--hash', branchRef]),
      runGit(['merge-base', spec.source_head_sha, spec.required_pr_base_sha]),
      runGit(['show', `${spec.required_pr_base_sha}:${planPath}`]),
      readFile(contentTypesPath, 'utf8'),
    ]);
  if (String(branchHead).trim() !== spec.source_head_sha) {
    throw new Error(
      `${spec.work_id}.source_branch ref가 source_head_sha와 다릅니다.`,
    );
  }
  for (const sha of [
    spec.source_base_sha,
    spec.source_head_sha,
    spec.required_pr_base_sha,
  ]) {
    await runGit(['cat-file', '-e', `${sha}^{commit}`]);
  }
  await runGit([
    'merge-base',
    '--is-ancestor',
    spec.source_base_sha,
    spec.source_head_sha,
  ]);
  await runGit([
    'merge-base',
    '--is-ancestor',
    spec.required_pr_base_sha,
    'HEAD',
  ]);
  const candidatePrMergeBaseSha = String(mergeBase).trim();
  if (
    spec.source_base_sha !== spec.required_pr_base_sha ||
    candidatePrMergeBaseSha !== spec.required_pr_base_sha
  ) {
    throw new Error(
      `${spec.work_id}의 source_base_sha·required_pr_base_sha·실제 PR merge-base가 exact 일치해야 합니다.`,
    );
  }

  const requiredPlan = JSON.parse(requiredPlanText);
  const requiredPacket = requiredPlan.task_packets?.find(
    packet => packet.work_id === spec.work_id,
  );
  if (!requiredPacket) {
    throw new Error(
      `${spec.work_id}가 required_pr_base_sha의 coverage plan에 없습니다.`,
    );
  }
  const plannedContract = planContractProjection(requiredPlan, requiredPacket);
  if (
    canonicalJson(plannedContract) !==
    canonicalJson(contractProjection(contract))
  ) {
    throw new Error(
      `${spec.work_id}.required_pr_base_sha의 planner 계약이 현재 등록계약과 다릅니다.`,
    );
  }

  const finalChangedFiles = splitLines(await runGit([
    'diff',
    '--name-only',
    spec.source_base_sha,
    spec.source_head_sha,
  ])).sort();
  const prChangedFiles = splitLines(await runGit([
    'diff',
    '--name-only',
    `${spec.required_pr_base_sha}...${spec.source_head_sha}`,
  ])).sort();
  const range = await commitPathUnion(
    runGit,
    spec.source_base_sha,
    spec.source_head_sha,
  );
  if (canonicalJson(finalChangedFiles) !== canonicalJson(range.changedFiles)) {
    throw new Error(
      `${spec.work_id}의 commit별 changed-path union과 최종 diff가 다릅니다.`,
    );
  }
  if (
    canonicalJson(prChangedFiles) !== canonicalJson(finalChangedFiles)
  ) {
    throw new Error(
      `${spec.work_id}의 실제 PR 3-dot 변경범위와 candidate 범위가 다릅니다.`,
    );
  }
  const testFiles = finalChangedFiles.filter(
    file => /^web\/rulelink_public_next\/scripts\/[a-z0-9-]+\.test\.mjs$/u.test(file),
  );
  if (
    finalChangedFiles.length !== 2 ||
    !finalChangedFiles.includes(contract.topic_file) ||
    testFiles.length !== 1
  ) {
    throw new Error(
      `${spec.work_id} 후보는 해당 topic+전용 test 정확히 2파일이어야 합니다: ${finalChangedFiles.join(', ')}`,
    );
  }
  for (const forbidden of contract.forbidden_paths) {
    const prefix = forbidden.endsWith('/**') ? forbidden.slice(0, -3) : null;
    if (
      range.changedFiles.some(
        file => file === forbidden || (prefix && file.startsWith(`${prefix}/`)),
      )
    ) {
      throw new Error(
        `${spec.work_id} 후보 Git range가 금지 경로를 변경했습니다: ${forbidden}`,
      );
    }
  }

  const [beforeText, afterText] = await Promise.all([
    runGit(['show', `${spec.source_base_sha}:${contract.topic_file}`]),
    runGit(['show', `${spec.source_head_sha}:${contract.topic_file}`]),
  ]);
  const beforeTopic = JSON.parse(beforeText);
  const afterTopic = JSON.parse(afterText);
  const beforeHubIds = (beforeTopic.topic_hubs ?? []).map(hub => hub.hub_id);
  const afterHubIds = (afterTopic.topic_hubs ?? []).map(hub => hub.hub_id);
  if (
    !beforeHubIds.includes(contract.topic_id) ||
    canonicalJson(beforeHubIds) !== canonicalJson(afterHubIds)
  ) {
    throw new Error(
      `${spec.work_id} 후보가 task packet의 topic identity를 보존하지 않았습니다.`,
    );
  }
  const beforeContentIds = new Set(contentEntryMap(beforeTopic).keys());
  if (contract.target_content_ids.some(contentId => !beforeContentIds.has(contentId))) {
    throw new Error(
      `${spec.work_id} task packet의 target_content_ids가 candidate base에 없습니다.`,
    );
  }
  const canonicalContentTypes = new Set(
    Object.keys(JSON.parse(contentTypesText).canonical),
  );
  const beforeMeasurement = measureTopic(beforeTopic, canonicalContentTypes);
  const afterMeasurement = measureTopic(afterTopic, canonicalContentTypes);
  const changedIds = changedContentIds(beforeTopic, afterTopic);
  if (changedIds.length === 0) {
    throw new Error(`${spec.work_id} 후보가 실제 content entry를 변경하지 않았습니다.`);
  }
  const afterContentIds = new Set(contentEntryMap(afterTopic).keys());
  const addedIds = changedIds.filter(
    contentId => !beforeContentIds.has(contentId) && afterContentIds.has(contentId),
  );
  const qualityTargets = {
    duplicate_rule_before: beforeMeasurement.quality.duplicate_rule,
    duplicate_rule_after: afterMeasurement.quality.duplicate_rule,
    blank_audience_before: beforeMeasurement.quality.blank_audience,
    blank_audience_after: afterMeasurement.quality.blank_audience,
    copied_search_before: beforeMeasurement.quality.copied_search,
    copied_search_after: afterMeasurement.quality.copied_search,
    nonstandard_content_type_before:
      beforeMeasurement.quality.nonstandard_content_type,
    nonstandard_content_type_after:
      afterMeasurement.quality.nonstandard_content_type,
    typed_relation_after: afterMeasurement.quality.typed_relation,
  };
  const plannedOwnerFiles = [...contract.planned_owned_paths].sort();
  return {
    testFile: testFiles[0],
    counts: afterMeasurement.counts,
    qualityTargets,
    candidateImport: {
      schema: candidateSchema,
      state: 'imported_existing_candidate',
      lifecycle_gate: 'awaiting_pr',
      source_branch: spec.source_branch,
      source_branch_ref: branchRef,
      source_base_sha: spec.source_base_sha,
      source_head_sha: spec.source_head_sha,
      required_pr_base_sha: spec.required_pr_base_sha,
      candidate_pr_merge_base_sha: candidatePrMergeBaseSha,
      planner_contract_sha256: sha256(canonicalJson(plannedContract)),
      range_merge_policy: rangeMergePolicy,
      range_commit_shas: range.commits,
      range_changed_files: range.changedFiles,
      pr_changed_files: prChangedFiles,
      observed_owner_files: finalChangedFiles,
      planned_owner_files: plannedOwnerFiles,
      owner_scope_state:
        canonicalJson(finalChangedFiles) === canonicalJson(plannedOwnerFiles)
          ? 'exact'
          : 'repackaging_required',
      changed_content_ids: changedIds,
      added_content_ids: addedIds,
      topic_before_sha256: sha256(canonicalJson(beforeTopic)),
      topic_after_sha256: sha256(canonicalJson(afterTopic)),
      expected_counts: afterMeasurement.counts,
      expected_quality_targets: qualityTargets,
    },
  };
}

export function existingTopicCoverageCandidateContractReceipt(item) {
  return sha256(canonicalJson({
    work_id: item.work_id,
    title_ko: item.title_ko,
    topic_id: item.topic_id,
    topic_file: item.topic_file,
    test_file: item.test_file,
    change_mode: item.change_mode,
    counts: item.counts,
    quality_targets: item.quality_targets,
    depends_on_work_ids: item.depends_on_work_ids ?? [],
    integration_checks: item.integration_checks,
    candidate_import: item.candidate_import,
  }));
}
