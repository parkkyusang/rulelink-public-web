import {createHash} from 'node:crypto';
import {readFile, rename, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const defaultQueuePath = path.join(repoRoot, 'artifacts', 'publication', 'production-queue.json');
const defaultPublishedBundlePath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

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


export const OWNER_ROLE_CONTRACTS = {
  orchestration: {assignment: 'coordination_only', owned_paths: ['artifacts/publication/production-queue.json'], forbidden_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**']},
  reader_research: {assignment: 'read_only', owned_paths: [], forbidden_paths: ['**/*']},
  quality_governance: {assignment: 'governance_contracts', owned_paths: ['artifacts/publication/production-queue.json', 'web/rulelink_public_next/scripts/*publication*.mjs', 'web/rulelink_public_next/scripts/*publication*.test.mjs'], forbidden_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**', 'artifacts/publication/release.json']},
  runtime_design: {assignment: 'runtime_design', owned_paths: ['web/rulelink_public_next/src/**', 'web/rulelink_public_next/scripts/*runtime*.test.mjs', 'web/rulelink_public_next/scripts/*knowledge*.test.mjs'], forbidden_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**']},
  content_production: {assignment: 'topic_handoff', owned_paths: ['artifacts/publication/topics/<topic>.json', 'web/rulelink_public_next/scripts/<topic>-topic-*.test.mjs'], forbidden_paths: ['artifacts/publication/current/**', 'artifacts/publication/snapshots/**', 'artifacts/publication/manifest.json', 'artifacts/publication/release.json']},
  migrate_publication: {assignment: 'publication_migration', owned_paths: ['artifacts/publication/topics/*.json', 'artifacts/publication/current/**', 'artifacts/publication/snapshots/**', 'artifacts/publication/manifest.json'], forbidden_paths: ['artifacts/publication/release.json']},
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
  return {publishedSnapshot, topicReceipts};
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
  const evidence = await loadQueuePublicationEvidence(updatedQueue, publishedBundle, {readFile: read});
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
  {publishedBundle = null, publishedSnapshot = null, topicReceipts = null} = {},
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

  if (canonicalJson(queue.policy?.owner_role_contracts) !== canonicalJson(OWNER_ROLE_CONTRACTS)) {
    errors.push('policy.owner_role_contracts가 표준 역할별 소유·금지 파일 경계와 다릅니다.');
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

    if (nonEmpty(item.topic_id) && !terminalStatuses.has(item.status)) {
      const prior = topicClaims.get(item.topic_id);
      if (prior) errors.push(`활성 topic_id 중복: ${item.topic_id} (#${prior}, #${item.pr_number})`);
      else topicClaims.set(item.topic_id, item.pr_number);
    }
    if (nonEmpty(item.topic_file) && !terminalStatuses.has(item.status)) {
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
      if (byPr.has(supersededPr)) {
        errors.push(`#${item.pr_number}가 대체한 #${supersededPr}은 활성 대기열에 함께 남을 수 없습니다.`);
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
  const queue = args.includes('--write-current-publication')
    ? await synchronizeCurrentPublicationFile(queuePath, publishedBundle)
    : JSON.parse(await readFile(queuePath, 'utf8'));
  const evidence = await loadQueuePublicationEvidence(queue, publishedBundle);
  const errors = validateProductionQueue(queue, {publishedBundle, ...evidence});
  if (errors.length) {
    console.error(`공개 콘텐츠 생산 대기열 검증 실패: ${errors.length}건`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
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
