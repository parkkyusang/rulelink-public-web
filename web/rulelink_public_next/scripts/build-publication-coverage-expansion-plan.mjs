import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveKnowledgeEntryGraph } from '../src/lib/knowledge-search.ts';
import {
  auditPublicationSearchPerformance,
  loadGscInput,
} from './audit-publication-search-performance.mjs';
import {
  loadLegalAnswerActivation,
  validateLegalAnswerPacketFiles,
} from './validate-legal-answer-packets.mjs';
import {
  buildPublicationExpansionBacklog,
  validateJsonSchema,
  validateSupportedSchemaKeywords,
} from './build-publication-expansion-backlog.mjs';
import {
  canonicalJson,
  canonicalSha256,
  loadCoverageDocuments,
  validateCoverageDocuments,
} from './publication-coverage-core.mjs';
import {
  loadQueuePublicationEvidence,
  validateProductionQueue,
} from './validate-publication-production-queue.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPOSITORY_ROOT = path.resolve(WEB_ROOT, '..', '..');

export const DEFAULT_COVERAGE_EXPANSION_PLAN_PATH = path.join(
  REPOSITORY_ROOT,
  'artifacts',
  'publication',
  'coverage',
  'coverage-expansion-plan.json',
);
export const DEFAULT_COVERAGE_EXPANSION_PLAN_SCHEMA_PATH = path.join(
  REPOSITORY_ROOT,
  'artifacts',
  'publication',
  'coverage',
  'coverage-expansion-plan.schema.json',
);
export const DEFAULT_LEGAL_DOMAIN_TAXONOMY_PATH = path.join(
  REPOSITORY_ROOT,
  'artifacts',
  'publication',
  'coverage',
  'legal-domain-taxonomy.json',
);
export const DEFAULT_TOPIC_MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  'artifacts',
  'publication',
  'topics',
  'manifest.json',
);

const TERMINAL_QUEUE_STATUSES = new Set([
  'integrated',
  'superseded',
  'withdrawn',
]);
const STARTABLE_QUEUE_STATUSES = new Set([
  'planned',
  'claimed',
  'in_progress',
  'pr_open',
]);
const DEPENDENCY_COMPLETE_STATUSES = new Set([
  'migration_required',
  'integrated',
]);
const STRUCTURAL_TARGET_GAPS = new Set([
  'action_missing',
  'audience_situation_missing',
  'evidence_missing',
  'scenario_missing',
  'search_intent_missing',
  'typed_relation_missing',
]);
const TARGET_DOMAIN_ID_PATTERN =
  /^target\.[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const FORBIDDEN_PATHS = Object.freeze([
  'README.md',
  'artifacts/publication/current/**',
  'artifacts/publication/snapshots/**',
  'artifacts/publication/release.json',
  'artifacts/publication/topics/manifest.json',
  'artifacts/publication/production-queue.json',
  'artifacts/publication/production-queue-registry.json',
  'web/rulelink_public_next/src/**',
]);

function sorted(values) {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, 'en'),
  );
}

function nonEmpty(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0;
}

function gapStatus(value, minimum = 1) {
  const count = Array.isArray(value)
    ? value.length
    : nonEmpty(value)
      ? 1
      : 0;
  return {
    status: count === 0 ? 'missing' : count < minimum ? 'partial' : 'complete',
    count,
  };
}

function statusGapCode(name, status) {
  return status.status === 'complete' || status.status === 'not_applicable'
    ? []
    : [`${name}_${status.status === 'partial' ? 'partial' : status.status}`];
}

function activeQueueItems(queue) {
  return (queue.items ?? []).filter(
    (item) => !TERMINAL_QUEUE_STATUSES.has(item.status),
  );
}

function assertNoDuplicateActiveTopicAssignments(queue) {
  const counts = new Map();
  for (const item of activeQueueItems(queue)) {
    counts.set(item.topic_id, (counts.get(item.topic_id) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([topicId]) => topicId)
    .sort();
  if (duplicates.length > 0) {
    throw new Error(
      `duplicate active topic assignment:${duplicates.join(',')}`,
    );
  }
}

function registryReceiptMap(registry) {
  return new Map(
    (registry.prerequisite_gate_receipts ?? []).map((receipt) => [
      `${receipt.work_id}:${receipt.gate_id}`,
      receipt,
    ]),
  );
}

function validateTaxonomy(taxonomy, bundle, topicManifest) {
  if (taxonomy?.schema !== 'rulelink_publication_legal_domain_taxonomy_v1') {
    throw new Error('legal domain taxonomy schema invalid');
  }
  const domains = taxonomy.domains ?? [];
  const domainIds = domains.map((domain) => domain.domain_id);
  if (new Set(domainIds).size !== domainIds.length) {
    throw new Error('legal domain taxonomy duplicate domain');
  }
  const declaredHubIds = domains.flatMap((domain) => domain.hub_ids ?? []);
  if (new Set(declaredHubIds).size !== declaredHubIds.length) {
    throw new Error('legal domain taxonomy duplicate hub assignment');
  }
  const actualHubIds = sorted(
    (bundle.knowledge.topic_hubs ?? []).map((hub) => hub.hub_id),
  );
  const manifestHubIds = sorted(
    (topicManifest.topics ?? []).map((topic) => topic.topic_id),
  );
  if (
    canonicalJson(sorted(declaredHubIds)) !== canonicalJson(actualHubIds) ||
    canonicalJson(manifestHubIds) !== canonicalJson(actualHubIds)
  ) {
    throw new Error('legal domain taxonomy hub closure failed');
  }
  const horizon = taxonomy.target_domain_horizon ?? [];
  const targetIds = horizon.map((domain) => domain.target_domain_id);
  if (
    horizon.length === 0 ||
    new Set(targetIds).size !== targetIds.length ||
    targetIds.some(
      targetId =>
        typeof targetId !== 'string' ||
        !TARGET_DOMAIN_ID_PATTERN.test(targetId),
    )
  ) {
    throw new Error('target domain horizon identity invalid');
  }
  const horizonHubIds = horizon.flatMap(
    (domain) => domain.current_hub_ids ?? [],
  );
  const unknownHorizonHubs = sorted(horizonHubIds).filter(
    (hubId) => !actualHubIds.includes(hubId),
  );
  const unmappedCurrentHubs = actualHubIds.filter(
    (hubId) => !horizonHubIds.includes(hubId),
  );
  if (unknownHorizonHubs.length > 0 || unmappedCurrentHubs.length > 0) {
    throw new Error(
      `target domain horizon hub closure failed:unknown=${unknownHorizonHubs.join(',')}:unmapped=${unmappedCurrentHubs.join(',')}`,
    );
  }
}

function sourceMetadataStatus(sources, asOf) {
  if (sources.length === 0) {
    return { status: 'missing', count: 0 };
  }
  const valid = sources.filter((source) => {
    const verified = Date.parse(source.last_verified_at ?? '');
    return (
      nonEmpty(source.source_snapshot_id) &&
      Number.isFinite(verified) &&
      verified <= Date.parse(asOf)
    );
  }).length;
  return {
    status:
      valid === sources.length ? 'complete' : valid === 0 ? 'missing' : 'partial',
    count: valid,
  };
}

function fatalRiskScore({
  coverageObservations,
  domainRiskDimensions,
  relatedEdges,
}) {
  const evidence = [];
  let score = 0;
  const levels = coverageObservations.map((item) => item.risk_level);
  if (levels.includes('critical')) {
    score = 100;
    evidence.push('coverage_risk:critical');
  } else if (levels.includes('high')) {
    score = 70;
    evidence.push('coverage_risk:high');
  }
  if (relatedEdges.some((edge) => edge.relation_type === 'deadline')) {
    score = Math.max(score, 70);
    evidence.push('typed_relation:deadline');
  }
  if (score === 0 && domainRiskDimensions.length > 0) {
    score = 25;
    evidence.push(
      ...domainRiskDimensions.map((dimension) => `taxonomy_risk:${dimension}`),
    );
  }
  return {
    score,
    state:
      score >= 70
        ? 'explicit_risk_evidence'
        : score > 0
          ? 'domain_triage_required'
          : 'no_declared_fatal_risk_evidence',
    evidence: sorted(evidence),
  };
}

function structuralGapScore(gaps) {
  const weights = {
    audience_situation_missing: 12,
    scenario_missing: 15,
    typed_relation_missing: 12,
    authority_l1_missing: 18,
    authority_l2_unverified: 8,
    freshness_version_missing: 12,
    freshness_version_partial: 8,
    search_intent_missing: 10,
    search_intent_partial: 5,
    action_missing: 8,
    evidence_missing: 8,
    deadline_unverified: 5,
  };
  const evidence = Object.keys(weights).filter((code) => gaps.includes(code));
  return {
    score: Math.min(
      100,
      evidence.reduce((total, code) => total + weights[code], 0),
    ),
    state: evidence.length === 0 ? 'complete' : 'deficit_present',
    evidence,
  };
}

function authorityReadiness(l1, l2) {
  if (l2.status === 'complete') {
    return { score: 100, state: 'L2_locator', evidence: ['authority:L2'] };
  }
  if (l1.status === 'complete') {
    return { score: 50, state: 'L1_coordinate', evidence: ['authority:L1'] };
  }
  return { score: 0, state: 'L0_structure', evidence: ['authority:L0'] };
}

function freshnessScore(status) {
  return {
    score:
      status.status === 'complete' ? 100 : status.status === 'partial' ? 50 : 0,
    state:
      status.status === 'complete'
        ? 'metadata_complete'
        : status.status === 'partial'
          ? 'metadata_partial'
          : 'metadata_missing',
    evidence: [`source_metadata:${status.status}`],
  };
}

function userDemandScore(searchConsole) {
  return {
    status: searchConsole.status,
    not_used_for_legal_accuracy: true,
    impressions: searchConsole.impressions ?? 0,
    clicks: searchConsole.clicks ?? 0,
    query_count: (searchConsole.queries ?? []).length,
  };
}

function resolveTopicSelfTest(topic, queueItem, scriptFiles) {
  if (queueItem?.test_file) {
    return {
      path: queueItem.test_file,
      state: scriptFiles.has(path.basename(queueItem.test_file))
        ? 'existing'
        : 'to_create',
    };
  }
  const stem = path.basename(topic.file, '.json');
  const candidates = [
    `${stem}-topic-handoff.test.mjs`,
    `${stem}-topic-backfill.test.mjs`,
    `${stem}-rule-copy-topic-handoff.test.mjs`,
    `${stem}-topic-reader-backfill.test.mjs`,
  ];
  const existing = candidates.find((candidate) => scriptFiles.has(candidate));
  return existing
    ? {
        path: `web/rulelink_public_next/scripts/${existing}`,
        state: 'existing',
      }
    : {
        path: `web/rulelink_public_next/scripts/${stem}-coverage-expansion.test.mjs`,
        state: 'to_create',
      };
}

export function legalAnswerActivationForTopic(activation, topicId) {
  const activeForTopic =
    activation.state === 'active' &&
    activation.manifest.target_topic_ids.includes(topicId);
  return {
    gate: activeForTopic ? 'satisfied' : 'not_activated',
    releaseRequirements: activeForTopic
      ? ['activated_legal_answer_packet_receipt']
      : [],
  };
}

function workAssignment({
  topic,
  queue,
  registry,
  selfTest,
  snapshotId,
  proposedWorkId,
}) {
  const active = activeQueueItems(queue).filter(
    (item) => item.topic_id === topic.topic_id,
  );
  if (active.length > 1) {
    throw new Error(`duplicate active topic assignment:${topic.topic_id}`);
  }
  if (active.length === 0) {
    return {
      work_id:
        proposedWorkId ??
        `coverage-expansion-${topic.topic_id.replace(/^hub\./u, '')}-${snapshotId}`,
      assignment_state: 'proposed_unregistered',
      start_allowed: false,
      blocking_reasons: ['production_queue_registration_required'],
      depends_on_work_ids: [],
      prerequisite_gate_ids: [],
      receipt_dependency_ids: [],
    };
  }

  const item = active[0];
  if (
    item.topic_file !== `artifacts/publication/topics/${topic.file}` ||
    item.test_file !== selfTest.path
  ) {
    throw new Error(`active topic assignment path mismatch:${topic.topic_id}`);
  }
  const registration = (registry.registrations ?? []).find(
    (row) =>
      row.work_id === item.work_id &&
      row.topic_id === item.topic_id &&
      row.topic_file === item.topic_file,
  );
  if (!registration) {
    throw new Error(`active topic assignment registry missing:${item.work_id}`);
  }
  const blockers = [];
  if (!STARTABLE_QUEUE_STATUSES.has(item.status)) {
    blockers.push(`queue_status:${item.status}`);
  }
  const receipts = registryReceiptMap(registry);
  for (const gate of item.prerequisite_gates ?? []) {
    if (gate.status !== 'satisfied') {
      blockers.push(`gate_pending:${gate.gate_id}`);
      continue;
    }
    const receipt = receipts.get(`${item.work_id}:${gate.gate_id}`);
    if (!receipt || receipt.evidence_ref !== gate.evidence_ref) {
      blockers.push(`gate_receipt_missing:${gate.gate_id}`);
    }
  }
  const itemByWorkId = new Map(
    (queue.items ?? [])
      .filter((row) => row.work_id)
      .map((row) => [row.work_id, row]),
  );
  for (const dependencyId of item.depends_on_work_ids ?? []) {
    const dependency = itemByWorkId.get(dependencyId);
    if (
      !dependency ||
      !DEPENDENCY_COMPLETE_STATUSES.has(dependency.status)
    ) {
      blockers.push(`work_dependency_incomplete:${dependencyId}`);
    }
  }
  return {
    work_id: item.work_id,
    assignment_state: 'existing_queue_assignment',
    start_allowed: blockers.length === 0,
    blocking_reasons: sorted(blockers),
    depends_on_work_ids: sorted(item.depends_on_work_ids ?? []),
    prerequisite_gate_ids: sorted(
      (item.prerequisite_gates ?? []).map((gate) => gate.gate_id),
    ),
    receipt_dependency_ids: sorted(
      (item.prerequisite_gates ?? [])
        .filter((gate) => gate.status === 'satisfied')
        .map((gate) => `${item.work_id}:${gate.gate_id}`),
    ),
  };
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactObjectKeys(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

async function loadNewDomainSourceSelection({
  item,
  registry,
  topicId,
  repositoryRoot,
  builtAt,
}) {
  const selection = item?.source_locator_selection;
  if (selection === undefined) {
    return {
      state: 'selection_required',
      locators: [],
      blockers: ['source_locator_selection_required'],
    };
  }
  if (
    !exactObjectKeys(selection, [
      'gate_id',
      'artifact_path',
      'artifact_sha256',
    ]) ||
    selection.gate_id !== 'source-maintenance.source-locators-selected' ||
    typeof selection.artifact_path !== 'string' ||
    !/^artifacts\/publication\/coverage\/source-locator-selections\/[a-z0-9][a-z0-9._-]*\.json$/u.test(
      selection.artifact_path,
    ) ||
    !/^[a-f0-9]{64}$/u.test(selection.artifact_sha256 ?? '')
  ) {
    throw new Error(`new domain source selection shape invalid:${topicId}`);
  }
  const selectionRoot = `${path.resolve(
    repositoryRoot,
    'artifacts',
    'publication',
    'coverage',
    'source-locator-selections',
  )}${path.sep}`;
  const artifactPath = path.resolve(repositoryRoot, selection.artifact_path);
  if (!artifactPath.startsWith(selectionRoot)) {
    throw new Error(`new domain source selection path escaped:${topicId}`);
  }
  const artifactRaw = await readFile(artifactPath);
  if (sha256Bytes(artifactRaw) !== selection.artifact_sha256) {
    throw new Error(`new domain source selection hash mismatch:${topicId}`);
  }
  let artifact;
  try {
    artifact = JSON.parse(artifactRaw.toString('utf8'));
  } catch {
    throw new Error(`new domain source selection JSON invalid:${topicId}`);
  }
  if (
    !exactObjectKeys(artifact, [
      'schema',
      'work_id',
      'topic_id',
      'locators',
    ]) ||
    artifact.schema !== 'rulelink_source_locator_selection_v1' ||
    artifact.work_id !== item.work_id ||
    artifact.topic_id !== topicId ||
    !Array.isArray(artifact.locators) ||
    artifact.locators.length === 0
  ) {
    throw new Error(`new domain source selection artifact invalid:${topicId}`);
  }
  const locatorKeys = [
    'coordinate_id',
    'source_id',
    'source_snapshot_id',
    'law_name_ko',
    'article_no',
    'official_url',
    'last_verified_at',
  ];
  const coordinateIds = [];
  for (const locator of artifact.locators) {
    const verifiedAt = Date.parse(locator?.last_verified_at ?? '');
    if (
      !exactObjectKeys(locator, locatorKeys) ||
      !locatorKeys.every(
        (key) => typeof locator[key] === 'string' && locator[key].length > 0,
      ) ||
      !/^https:\/\//u.test(locator.official_url) ||
      !Number.isFinite(verifiedAt) ||
      verifiedAt > Date.parse(builtAt)
    ) {
      throw new Error(`new domain source locator invalid:${topicId}`);
    }
    coordinateIds.push(locator.coordinate_id);
  }
  if (new Set(coordinateIds).size !== coordinateIds.length) {
    throw new Error(`new domain source locator duplicate:${topicId}`);
  }
  const gate = (item.prerequisite_gates ?? []).find(
    candidate => candidate.gate_id === selection.gate_id,
  );
  const receipt = (registry.prerequisite_gate_receipts ?? []).find(
    candidate =>
      candidate.work_id === item.work_id &&
      candidate.gate_id === selection.gate_id &&
      candidate.evidence_ref === gate?.evidence_ref,
  );
  if (
    gate?.status !== 'satisfied' ||
    !gate.evidence_ref.endsWith(
      `@sha256:${selection.artifact_sha256}`,
    ) ||
    !receipt
  ) {
    return {
      state: 'selection_required',
      locators: [],
      blockers: ['source_locator_selection_receipt_required'],
    };
  }
  return {
    state: 'bound',
    locators: [...artifact.locators].sort((left, right) =>
      left.coordinate_id.localeCompare(right.coordinate_id, 'en'),
    ),
    blockers: [],
  };
}

export async function resolveNewDomainSeedAssignment({
  domain,
  queue,
  registry,
  snapshotId,
  builtAt,
  repositoryRoot = REPOSITORY_ROOT,
}) {
  const stem = domain.target_domain_id.replace(/^target\./u, '');
  const topicId = `hub.${stem}`;
  const topicFile = `artifacts/publication/topics/${stem}.json`;
  const selfTestFile =
    `web/rulelink_public_next/scripts/${stem}-topic-handoff.test.mjs`;
  const assignment = workAssignment({
    topic: { topic_id: topicId, file: `${stem}.json` },
    queue,
    registry,
    selfTest: { path: selfTestFile },
    snapshotId,
    proposedWorkId:
      `coverage-expansion-new-domain-${stem}-${snapshotId}`,
  });
  const item = activeQueueItems(queue).find(
    candidate => candidate.topic_id === topicId,
  );
  const selection = item
    ? await loadNewDomainSourceSelection({
        item,
        registry,
        topicId,
        repositoryRoot,
        builtAt,
      })
    : {
        state: 'selection_required',
        locators: [],
        blockers: ['source_locator_selection_required'],
      };
  const blockingReasons = sorted([
    ...assignment.blocking_reasons,
    ...selection.blockers,
  ]);
  return {
    stem,
    topicId,
    topicFile,
    selfTestFile,
    assignment: {
      ...assignment,
      start_allowed: blockingReasons.length === 0,
      blocking_reasons: blockingReasons,
    },
    sourceLocatorState: selection.state,
    requiredSourceLocators: selection.locators,
  };
}

function buildMaintenanceQueue(bundle, graphByContent, topicByContent) {
  const assertions = new Map(
    (bundle.assertions ?? []).map((assertion) => [
      assertion.assertion_id,
      assertion,
    ]),
  );
  const sourceUses = new Map();
  for (const [contentId, graph] of graphByContent) {
    for (const source of graph.sources) {
      const uses = sourceUses.get(source.source_id) ?? [];
      uses.push({
        contentId,
        topicId: topicByContent.get(contentId),
        source,
        ruleIds: graph.rules
          .filter((rule) =>
            rule.source_coordinate_ids.includes(source.coordinate_id),
          )
          .map((rule) => rule.rule_id),
        scenarioIds: graph.scenarios
          .filter((scenario) =>
            scenario.source_coordinate_ids.includes(source.coordinate_id),
          )
          .map((scenario) => scenario.scenario_id),
      });
      sourceUses.set(source.source_id, uses);
    }
  }

  const items = [];
  for (const brief of bundle.change_briefs ?? []) {
    const changeSources = new Map();
    for (const assertionId of brief.assertion_ids ?? []) {
      const assertion = assertions.get(assertionId);
      for (const coordinate of assertion?.source_coordinates ?? []) {
        const current = changeSources.get(coordinate.source_id) ?? {
          sourceId: coordinate.source_id,
          snapshots: [],
        };
        current.snapshots.push(coordinate.source_snapshot_id);
        changeSources.set(coordinate.source_id, current);
      }
    }
    for (const changeSource of changeSources.values()) {
      const uses = sourceUses.get(changeSource.sourceId) ?? [];
      const observed = sorted(
        uses.map((use) => use.source.source_snapshot_id).filter(nonEmpty),
      );
      const oldSnapshots = sorted(brief.old_snapshot_ids ?? []);
      const newSnapshots = sorted(brief.new_snapshot_ids ?? []);
      const hasNew = observed.some((snapshot) => newSnapshots.includes(snapshot));
      const hasOld = observed.some((snapshot) => oldSnapshots.includes(snapshot));
      const impactState =
        uses.length === 0
          ? 'unmapped_change_source'
          : hasOld
            ? 'old_snapshot_still_observed'
            : hasNew
              ? 'new_snapshot_linked'
              : 'source_version_mismatch';
      const requiredAction =
        impactState === 'unmapped_change_source'
          ? 'map_change_source_to_content'
          : impactState === 'new_snapshot_linked'
            ? 'reverify_affected_content'
            : 'review_source_version_binding';
      const stableKey = canonicalSha256({
        change_brief_id: brief.change_brief_id,
        source_id: changeSource.sourceId,
      }).slice(0, 20);
      items.push({
        maintenance_id: `maintenance.source-impact.${stableKey}`,
        change_brief_id: brief.change_brief_id,
        source_id: changeSource.sourceId,
        old_snapshot_ids: oldSnapshots,
        new_snapshot_ids: newSnapshots,
        observed_snapshot_ids: observed,
        affected_content_ids: sorted(uses.map((use) => use.contentId)),
        affected_rule_ids: sorted(uses.flatMap((use) => use.ruleIds)),
        affected_scenario_ids: sorted(
          uses.flatMap((use) => use.scenarioIds),
        ),
        affected_claim_ids: [],
        claim_projection_state: 'not_provided',
        impact_state: impactState,
        required_action: requiredAction,
        topic_ids: sorted(uses.map((use) => use.topicId).filter(nonEmpty)),
      });
    }
  }
  return items.sort((left, right) =>
    left.maintenance_id.localeCompare(right.maintenance_id, 'en'),
  );
}

function validatePlanSemantics(plan, backlog) {
  const errors = [];
  const contentIds = plan.content_assessments.map((item) => item.content_id);
  const topicIds = plan.task_packets.map((item) => item.topic_id);
  if (new Set(contentIds).size !== contentIds.length) {
    errors.push('content_assessment_duplicate');
  }
  if (new Set(topicIds).size !== topicIds.length) {
    errors.push('task_packet_topic_duplicate');
  }
  if (
    plan.denominator.content_count !== contentIds.length ||
    plan.denominator.hub_count !==
      plan.task_packets.filter(
        (packet) => packet.work_kind === 'existing_topic_backfill',
      ).length ||
    plan.summary.new_domain_seed_task_count !==
      plan.task_packets.filter(
        (packet) => packet.work_kind === 'new_domain_seed',
      ).length
  ) {
    errors.push('denominator_mismatch');
  }
  const verified = backlog.entries.filter(
    (entry) => entry.coverage_state === 'verified_release',
  ).length;
  if (plan.summary.verified_release_count !== verified) {
    errors.push('verified_release_not_derived_from_backlog');
  }
  for (const packet of plan.task_packets) {
    if (
      packet.assignment_state === 'proposed_unregistered' &&
      packet.start_allowed
    ) {
      errors.push(`unregistered_start_allowed:${packet.topic_id}`);
    }
    if (
      packet.work_kind === 'existing_topic_backfill' &&
      (packet.source_locator_state !== 'bound' ||
        packet.required_source_locators.length === 0)
    ) {
      errors.push(`required_source_locator_missing:${packet.topic_id}`);
    }
    if (
      packet.work_kind === 'new_domain_seed' &&
      ((packet.source_locator_state === 'selection_required' &&
        (packet.required_source_locators.length !== 0 ||
          packet.start_allowed)) ||
        (packet.source_locator_state === 'bound' &&
          packet.required_source_locators.length === 0) ||
        (packet.start_allowed &&
          (packet.assignment_state !== 'existing_queue_assignment' ||
            packet.source_locator_state !== 'bound')))
    ) {
      errors.push(`new_domain_seed_not_fail_closed:${packet.topic_id}`);
    }
    if (
      packet.expected_backlog_delta.verified_release_delta_before_migration !==
      0
    ) {
      errors.push(`verified_release_before_migration:${packet.topic_id}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `publication coverage expansion plan semantic invalid:\n${errors.join('\n')}`,
    );
  }
}

export async function buildPublicationCoverageExpansionPlan(options = {}) {
  const [
    documents,
    backlog,
    taxonomy,
    topicManifest,
    schema,
    scriptFiles,
    legalAnswerActivation,
    legalAnswerValidation,
  ] = await Promise.all([
    loadCoverageDocuments(options),
    buildPublicationExpansionBacklog(options),
    readFile(
      options.legalDomainTaxonomyPath ?? DEFAULT_LEGAL_DOMAIN_TAXONOMY_PATH,
      'utf8',
    ).then(JSON.parse),
    readFile(
      options.topicManifestPath ?? DEFAULT_TOPIC_MANIFEST_PATH,
      'utf8',
    ).then(JSON.parse),
    readFile(
      options.coverageExpansionPlanSchemaPath ??
        DEFAULT_COVERAGE_EXPANSION_PLAN_SCHEMA_PATH,
      'utf8',
    ).then(JSON.parse),
    readdir(SCRIPT_DIR).then((files) => new Set(files)),
    loadLegalAnswerActivation(options),
    validateLegalAnswerPacketFiles(options),
  ]);
  assertNoDuplicateActiveTopicAssignments(documents.productionQueue);
  if (legalAnswerValidation.errors.length > 0) {
    throw new Error(
      `legal answer packet gate invalid:\n${legalAnswerValidation.errors.join('\n')}`,
    );
  }
  if (
    legalAnswerActivation.state === 'inactive' &&
    legalAnswerActivation.manifest.base_snapshot_id !==
      documents.bundle.snapshot_id
  ) {
    throw new Error('inactive legal answer activation current snapshot mismatch');
  }
  const coverageValidation = validateCoverageDocuments(documents);
  if (coverageValidation.errors.length > 0) {
    throw new Error(
      `coverage matrix validation failed:\n${coverageValidation.errors.join('\n')}`,
    );
  }
  if (backlog.snapshot_id !== documents.bundle.snapshot_id) {
    throw new Error('coverage expansion backlog current snapshot mismatch');
  }
  let productionQueueEvidence;
  try {
    productionQueueEvidence = await loadQueuePublicationEvidence(
      documents.productionQueue,
      documents.bundle,
      { itemRegistry: documents.productionRegistry },
    );
  } catch (error) {
    throw new Error(
      `production queue trust validation failed:${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const productionQueueErrors = validateProductionQueue(
    documents.productionQueue,
    {
      publishedBundle: documents.bundle,
      ...productionQueueEvidence,
    },
  );
  if (productionQueueErrors.length > 0) {
    throw new Error(
      `production queue trust validation failed:\n${productionQueueErrors.join('\n')}`,
    );
  }
  validateTaxonomy(taxonomy, documents.bundle, topicManifest);
  validateSupportedSchemaKeywords(schema);
  if (
    schema?.$id !==
      'urn:rulelink:schema:publication-coverage-expansion-plan:v1' ||
    schema?.properties?.schema?.const !==
      'rulelink_publication_coverage_expansion_plan_v1'
  ) {
    throw new Error('publication coverage expansion plan schema identity invalid');
  }
  const topicDocuments = await Promise.all(
    topicManifest.topics.map(async (topic) => {
      const topicPath = path.join(
        REPOSITORY_ROOT,
        'artifacts',
        'publication',
        'topics',
        topic.file,
      );
      const document = JSON.parse(await readFile(topicPath, 'utf8'));
      if (document.topic_id !== topic.topic_id) {
        throw new Error(`topic source identity mismatch:${topic.topic_id}`);
      }
      return { manifest: topic, document };
    }),
  );
  const gscRows = options.gscRows ?? [];
  if (gscRows.length > 0 && !options.baseUrl) {
    throw new Error('GSC input requires explicit baseUrl');
  }
  const searchAudit = auditPublicationSearchPerformance(documents.bundle, {
    gscRows,
    baseUrl: options.baseUrl,
    asOf: documents.bundle.built_at,
  });
  const searchPageById = new Map(
    searchAudit.pages
      .filter((page) => page.page_type === 'knowledge')
      .map((page) => [page.id, page]),
  );
  const backlogById = new Map(
    backlog.entries.map((entry) => [entry.content_id, entry]),
  );
  const domainByHub = new Map(
    taxonomy.domains.flatMap((domain) =>
      domain.hub_ids.map((hubId) => [hubId, domain]),
    ),
  );
  const topicByContent = new Map();
  for (const { manifest, document } of topicDocuments) {
    for (const entry of document.content_entries ?? []) {
      const current = topicByContent.get(entry.content_id);
      if (current) {
        throw new Error(
          `content belongs to multiple topic sources:${entry.content_id}:${current}:${manifest.topic_id}`,
        );
      }
      topicByContent.set(entry.content_id, manifest.topic_id);
    }
  }
  const publishedContentIds = sorted(
    documents.bundle.knowledge.content_entries.map((entry) => entry.content_id),
  );
  if (
    canonicalJson(sorted(topicByContent.keys())) !==
    canonicalJson(publishedContentIds)
  ) {
    throw new Error('topic source content closure failed');
  }
  const observationsByContent = new Map();
  for (const unit of coverageValidation.units) {
    const observation = coverageValidation.observations.find(
      (item) => item.coverage_unit_id === unit.coverage_unit_id,
    );
    for (const contentId of unit.canonical_content_ids) {
      const current = observationsByContent.get(contentId) ?? [];
      current.push({
        ...observation,
        risk_level: unit.risk_level,
      });
      observationsByContent.set(contentId, current);
    }
  }

  const graphByContent = new Map(
    documents.bundle.knowledge.content_entries.map((entry) => [
      entry.content_id,
      resolveKnowledgeEntryGraph(documents.bundle.knowledge, entry),
    ]),
  );
  const assessments = [...documents.bundle.knowledge.content_entries]
    .sort((left, right) => left.content_id.localeCompare(right.content_id, 'en'))
    .map((entry) => {
      const topicId = topicByContent.get(entry.content_id);
      const domain = domainByHub.get(topicId);
      const graph = graphByContent.get(entry.content_id);
      const backlogEntry = backlogById.get(entry.content_id);
      if (!topicId || !domain || !graph || !backlogEntry) {
        throw new Error(`content planner projection missing:${entry.content_id}`);
      }
      const relatedEdges = entry.related_edges ?? [];
      const l1 = gapStatus(graph.sources);
      const l2 = gapStatus(entry.authority_binding_ids ?? []);
      l2.status = l2.count > 0 ? 'complete' : 'unverified';
      const freshness = sourceMetadataStatus(
        graph.sources,
        documents.bundle.built_at,
      );
      const deadline =
        relatedEdges.some((edge) => edge.relation_type === 'deadline')
          ? { status: 'complete', count: 1 }
          : domain.risk_dimensions.includes('deadline')
            ? { status: 'unverified', count: 0 }
            : { status: 'not_applicable', count: 0 };
      const gaps = {
        audience: gapStatus(entry.audience_situation_ko),
        scenario: gapStatus(entry.scenario_ids),
        typed_relation: gapStatus(relatedEdges),
        authority_l1: l1,
        authority_l2: l2,
        freshness_version: freshness,
        search_intent: gapStatus(entry.search_intents_ko, 3),
        action: gapStatus(entry.action_steps_ko),
        evidence: gapStatus(entry.facts_to_check_ko),
        deadline,
      };
      const gapCodes = sorted([
        ...statusGapCode('audience_situation', gaps.audience),
        ...statusGapCode('scenario', gaps.scenario),
        ...statusGapCode('typed_relation', gaps.typed_relation),
        ...statusGapCode('authority_l1', gaps.authority_l1),
        ...statusGapCode('authority_l2', gaps.authority_l2),
        ...statusGapCode('freshness_version', gaps.freshness_version),
        ...statusGapCode('search_intent', gaps.search_intent),
        ...statusGapCode('action', gaps.action),
        ...statusGapCode('evidence', gaps.evidence),
        ...statusGapCode('deadline', gaps.deadline),
        ...backlogEntry.gap_codes,
      ]);
      const searchPage = searchPageById.get(entry.content_id);
      return {
        content_id: entry.content_id,
        content_revision_sha256: canonicalSha256(entry),
        topic_id: topicId,
        domain_id: domain.domain_id,
        coverage_state: backlogEntry.coverage_state,
        gap_codes: gapCodes,
        gaps,
        scores: {
          fatal_risk: fatalRiskScore({
            coverageObservations:
              observationsByContent.get(entry.content_id) ?? [],
            domainRiskDimensions: domain.risk_dimensions,
            relatedEdges,
          }),
          structural_gap: structuralGapScore(gapCodes),
          authority_readiness: authorityReadiness(l1, l2),
          source_freshness: freshnessScore(freshness),
          user_demand: userDemandScore(searchPage.search_console),
        },
      };
    });

  const currentTopicTaskPackets = topicManifest.topics
    .map((topic) => {
      const topicDocument = topicDocuments.find(
        (item) => item.manifest.topic_id === topic.topic_id,
      );
      const domain = domainByHub.get(topic.topic_id);
      if (!topicDocument || !domain) {
        throw new Error(`topic planner projection missing:${topic.topic_id}`);
      }
      const targetContentIds = sorted(
        topicDocument.document.content_entries.map((entry) => entry.content_id),
      );
      const topicAssessments = assessments.filter(
        (assessment) => assessment.topic_id === topic.topic_id,
      );
      const active = activeQueueItems(documents.productionQueue).filter(
        (item) => item.topic_id === topic.topic_id,
      );
      if (active.length > 1) {
        throw new Error(`duplicate active topic assignment:${topic.topic_id}`);
      }
      const selfTest = resolveTopicSelfTest(
        topic,
        active[0],
        scriptFiles,
      );
      const assignment = workAssignment({
        topic,
        queue: documents.productionQueue,
        registry: documents.productionRegistry,
        selfTest,
        snapshotId: documents.bundle.snapshot_id,
      });
      const legalAnswerGate = legalAnswerActivationForTopic(
        legalAnswerActivation,
        topic.topic_id,
      );
      const sources = sorted(
        targetContentIds.flatMap((contentId) =>
          graphByContent
            .get(contentId)
            .sources.map((source) => source.coordinate_id),
        ),
      ).map((coordinateId) =>
        documents.bundle.knowledge.sources.find(
          (source) => source.coordinate_id === coordinateId,
        ),
      );
      const gapCounts = {};
      for (const assessment of topicAssessments) {
        for (const code of assessment.gap_codes) {
          gapCounts[code] = (gapCounts[code] ?? 0) + 1;
        }
      }
      return {
        schema: 'rulelink_codex_task_packet_v1',
        work_id: assignment.work_id,
        work_kind: 'existing_topic_backfill',
        assignment_state: assignment.assignment_state,
        start_allowed: assignment.start_allowed,
        blocking_reasons: assignment.blocking_reasons,
        topic_id: topic.topic_id,
        planning_domain_id: domain.domain_id,
        target_content_ids: targetContentIds,
        topic_file: `artifacts/publication/topics/${topic.file}`,
        self_test_file: selfTest.path,
        self_test_state: selfTest.state,
        owned_paths: sorted([
          `artifacts/publication/topics/${topic.file}`,
          selfTest.path,
        ]),
        forbidden_paths: [...FORBIDDEN_PATHS],
        required_source_locators: sources.map((source) => ({
          coordinate_id: source.coordinate_id,
          source_id: source.source_id,
          source_snapshot_id: source.source_snapshot_id,
          law_name_ko: source.law_name_ko ?? '',
          article_no: source.article_no ?? '',
          official_url: source.official_url ?? '',
          last_verified_at: source.last_verified_at ?? '',
        })),
        source_locator_state: 'bound',
        expected_backlog_delta: {
          current_gap_counts: Object.fromEntries(
            Object.entries(gapCounts).sort(([left], [right]) =>
              left.localeCompare(right, 'en'),
            ),
          ),
          topic_edit_target_gap_codes: sorted(
            Object.keys(gapCounts).filter((code) =>
              STRUCTURAL_TARGET_GAPS.has(code),
            ),
          ),
          verified_release_delta_before_migration: 0,
          verified_release_requires: [
            'current_bundle',
            'new_immutable_snapshot',
            'trusted_release_receipts',
            ...legalAnswerGate.releaseRequirements,
          ],
        },
        dependencies: {
          migration_required: true,
          depends_on_work_ids: assignment.depends_on_work_ids,
          prerequisite_gate_ids: assignment.prerequisite_gate_ids,
          receipt_dependency_ids: assignment.receipt_dependency_ids,
          legal_answer_packet_gate: legalAnswerGate.gate,
        },
      };
    });

  const maintenanceQueue = buildMaintenanceQueue(
    documents.bundle,
    graphByContent,
    topicByContent,
  );
  const contentGapCounts = {};
  for (const assessment of assessments) {
    for (const code of assessment.gap_codes) {
      contentGapCounts[code] = (contentGapCounts[code] ?? 0) + 1;
    }
  }
  const taxonomyProjection = taxonomy.domains
    .map((domain) => ({
      ...domain,
      content_count: assessments.filter(
        (assessment) => assessment.domain_id === domain.domain_id,
      ).length,
    }))
    .sort((left, right) => left.domain_id.localeCompare(right.domain_id, 'en'));
  const hubById = new Map(
    documents.bundle.knowledge.topic_hubs.map((hub) => [hub.hub_id, hub]),
  );
  const targetDomainHorizon = taxonomy.target_domain_horizon
    .map((domain) => {
      const contentIds = sorted(
        domain.current_hub_ids.flatMap(
          (hubId) => hubById.get(hubId)?.content_ids ?? [],
        ),
      );
      return {
        target_domain_id: domain.target_domain_id,
        title_ko: domain.title_ko,
        current_hub_ids: sorted(domain.current_hub_ids),
        current_content_count: contentIds.length,
        coverage_state:
          domain.current_hub_ids.length > 0 ? 'started' : 'not_started',
      };
    })
    .sort((left, right) =>
      left.target_domain_id.localeCompare(right.target_domain_id, 'en'),
    );
  const newDomainSeedPackets = await Promise.all(
    targetDomainHorizon
      .filter((domain) => domain.coverage_state === 'not_started')
      .map(async (domain) => {
      const resolved = await resolveNewDomainSeedAssignment({
        domain,
        queue: documents.productionQueue,
        registry: documents.productionRegistry,
        snapshotId: documents.bundle.snapshot_id,
        builtAt: documents.bundle.built_at,
      });
      const {
        stem,
        topicId,
        topicFile,
        selfTestFile,
        assignment,
        sourceLocatorState,
        requiredSourceLocators,
      } = resolved;
      const resolvedTopicFile = path.resolve(REPOSITORY_ROOT, topicFile);
      const resolvedSelfTestFile = path.resolve(REPOSITORY_ROOT, selfTestFile);
      const topicRoot = `${path.resolve(
        REPOSITORY_ROOT,
        'artifacts',
        'publication',
        'topics',
      )}${path.sep}`;
      const scriptRoot = `${SCRIPT_DIR}${path.sep}`;
      if (
        !resolvedTopicFile.startsWith(topicRoot) ||
        !resolvedSelfTestFile.startsWith(scriptRoot)
      ) {
        throw new Error(
          `new domain task owned path escaped approved roots:${domain.target_domain_id}`,
        );
      }
      return {
        schema: 'rulelink_codex_task_packet_v1',
        work_id: assignment.work_id,
        work_kind: 'new_domain_seed',
        assignment_state: assignment.assignment_state,
        start_allowed: assignment.start_allowed,
        blocking_reasons: assignment.blocking_reasons,
        topic_id: topicId,
        planning_domain_id: domain.target_domain_id,
        target_content_ids: [],
        topic_file: topicFile,
        self_test_file: selfTestFile,
        self_test_state: 'to_create',
        owned_paths: [topicFile, selfTestFile].sort(),
        forbidden_paths: [...FORBIDDEN_PATHS],
        required_source_locators: requiredSourceLocators,
        source_locator_state: sourceLocatorState,
        expected_backlog_delta: {
          current_gap_counts: {
            target_domain_not_started: 1,
          },
          topic_edit_target_gap_codes: [],
          verified_release_delta_before_migration: 0,
          verified_release_requires: [
            'current_bundle',
            'new_immutable_snapshot',
            'trusted_release_receipts',
          ],
        },
        dependencies: {
          migration_required: true,
          depends_on_work_ids: assignment.depends_on_work_ids,
          prerequisite_gate_ids: assignment.prerequisite_gate_ids,
          receipt_dependency_ids: assignment.receipt_dependency_ids,
          legal_answer_packet_gate: 'not_activated',
        },
      };
    }),
  );
  const taskPackets = [...currentTopicTaskPackets, ...newDomainSeedPackets].sort(
    (left, right) => left.topic_id.localeCompare(right.topic_id, 'en'),
  );
  const plan = {
    schema: 'rulelink_publication_coverage_expansion_plan_v1',
    schema_sha256: canonicalSha256(schema),
    generated_from: {
      snapshot_id: documents.bundle.snapshot_id,
      as_of: documents.bundle.built_at,
      base_bundle_sha256: documents.bundleSha256,
      backlog_sha256: canonicalSha256(backlog),
      taxonomy_sha256: canonicalSha256(taxonomy),
      topic_manifest_sha256: canonicalSha256(topicManifest),
      production_queue_sha256: documents.productionQueueSha256,
      production_registry_sha256: documents.productionRegistrySha256,
    },
    denominator: {
      hub_count: documents.bundle.knowledge.topic_hubs.length,
      content_count: documents.bundle.knowledge.content_entries.length,
      rule_count: documents.bundle.knowledge.rule_cards.length,
      scenario_count: documents.bundle.knowledge.scenario_branches.length,
      source_count: documents.bundle.knowledge.sources.length,
      domain_count: taxonomy.domains.length,
      target_domain_count: targetDomainHorizon.length,
      change_brief_count: documents.bundle.change_briefs.length,
    },
    taxonomy: taxonomyProjection,
    target_domain_horizon: targetDomainHorizon,
    score_contract: {
      fatal_risk: 'declared_coverage_risk_and_typed_deadline_only',
      structural_gap: 'missing_publication_fields_and_relations_only',
      authority_readiness:
        'L0_structure_0_L1_coordinate_50_L2_locator_100',
      source_freshness: 'metadata_completeness_not_legal_currency',
      user_demand: 'separate_signal_never_legal_accuracy',
    },
    demand_availability: gscRows.length > 0 ? 'provided' : 'not_provided',
    legal_answer_activation: {
      state: legalAnswerActivation.state,
      manifest_sha256: legalAnswerActivation.manifestSha256,
      expected_packet_count:
        legalAnswerActivation.state === 'active'
          ? legalAnswerActivation.manifest.expected_packet_count
          : 0,
      expected_packet_ids:
        legalAnswerActivation.state === 'active'
          ? sorted(legalAnswerActivation.manifest.expected_packet_ids)
          : [],
      target_topic_ids:
        legalAnswerActivation.state === 'active'
          ? sorted(legalAnswerActivation.manifest.target_topic_ids)
          : [],
      gate_receipt_id:
        legalAnswerActivation.state === 'active'
          ? legalAnswerActivation.gateReceiptId
          : '',
    },
    content_assessments: assessments,
    task_packets: taskPackets,
    maintenance_queue: maintenanceQueue,
    summary: {
      verified_release_count: assessments.filter(
        (assessment) => assessment.coverage_state === 'verified_release',
      ).length,
      start_allowed_task_count: taskPackets.filter(
        (packet) => packet.start_allowed,
      ).length,
      blocked_task_count: taskPackets.filter(
        (packet) => !packet.start_allowed,
      ).length,
      proposed_unregistered_task_count: taskPackets.filter(
        (packet) => packet.assignment_state === 'proposed_unregistered',
      ).length,
      maintenance_item_count: maintenanceQueue.length,
      new_domain_seed_task_count: newDomainSeedPackets.length,
      target_domain_started_count: targetDomainHorizon.filter(
        (domain) => domain.coverage_state === 'started',
      ).length,
      target_domain_not_started_count: targetDomainHorizon.filter(
        (domain) => domain.coverage_state === 'not_started',
      ).length,
      content_gap_counts: Object.fromEntries(
        Object.entries(contentGapCounts).sort(([left], [right]) =>
          left.localeCompare(right, 'en'),
        ),
      ),
    },
    honesty: {
      demand_is_not_legal_accuracy: true,
      no_legal_text_is_generated: true,
      priority_uses_declared_structure_and_risk_only: true,
      unregistered_work_cannot_start: true,
      verified_release_requires_current_and_immutable_snapshot: true,
      current_publication_and_target_horizon_are_separate_denominators: true,
      target_domain_started_is_not_domain_complete: true,
    },
  };
  validateJsonSchema(schema, plan);
  validatePlanSemantics(plan, backlog);
  return plan;
}

export async function validatePublicationCoverageExpansionPlan(options = {}) {
  const expected = await buildPublicationCoverageExpansionPlan(options);
  const planPath =
    options.coverageExpansionPlanPath ?? DEFAULT_COVERAGE_EXPANSION_PLAN_PATH;
  const schemaPath =
    options.coverageExpansionPlanSchemaPath ??
    DEFAULT_COVERAGE_EXPANSION_PLAN_SCHEMA_PATH;
  const [actual, schema] = await Promise.all([
    readFile(planPath, 'utf8').then(JSON.parse),
    readFile(schemaPath, 'utf8').then(JSON.parse),
  ]);
  validateSupportedSchemaKeywords(schema);
  validateJsonSchema(schema, actual);
  validatePlanSemantics(
    actual,
    await buildPublicationExpansionBacklog(options),
  );
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error('publication coverage expansion plan drift detected');
  }
  return expected;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const write = process.argv.includes('--write');
  const gscPath = argumentValue('--gsc');
  const outputPath = argumentValue('--output');
  const baseUrl = argumentValue('--base-url');
  const gscRows = await loadGscInput(gscPath);
  if (gscRows.length > 0 && !baseUrl) {
    throw new Error('--gsc 사용 시 --base-url이 필요합니다.');
  }
  if (write && gscRows.length > 0 && !outputPath) {
    throw new Error('GSC 결합 결과는 --output 경로를 명시해야 합니다.');
  }
  const options = { gscRows, baseUrl };
  const plan =
    write || outputPath || gscRows.length > 0
      ? await buildPublicationCoverageExpansionPlan(options)
      : await validatePublicationCoverageExpansionPlan(options);
  const destination =
    outputPath ?? (write ? DEFAULT_COVERAGE_EXPANSION_PLAN_PATH : null);
  if (destination) {
    await writeFile(destination, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(
    `${JSON.stringify({
      path: destination ?? DEFAULT_COVERAGE_EXPANSION_PLAN_PATH,
      denominator: plan.denominator,
      summary: plan.summary,
    })}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
