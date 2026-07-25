import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  canonicalSha256,
  loadCoverageDocuments,
  validateCoverageDocuments,
} from './publication-coverage-core.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(SCRIPT_DIR, '..');
export const DEFAULT_EXPANSION_BACKLOG_PATH = path.resolve(
  WEB_ROOT,
  '..',
  '..',
  'artifacts',
  'publication',
  'coverage',
  'expansion-backlog.json',
);

const EXPERIENCE_FIELDS = [
  ['audience_situation_ko', 'audience_situation'],
  ['one_line_answer_ko', 'one_line_answer'],
  ['facts_to_check_ko', 'facts_to_check'],
  ['action_steps_ko', 'action_steps'],
];

function nonEmpty(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.length > 0;
}

function sortUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function coverageState(observations) {
  if (observations.length === 0) return 'unmapped';
  if (
    observations.every(
      (item) =>
        item.coverage_release_verified &&
        item.temporal_authority_verified &&
        item.authority_level === 'L2_locator' &&
        item.branch_closed &&
        item.evaluation_cases_declared_count > 0 &&
        item.evaluation_results_verified_count ===
          item.evaluation_cases_declared_count,
    )
  ) {
    return 'verified_release';
  }
  return 'coverage_declared';
}

function entryGaps(entry, observations) {
  const gaps = [];
  if (!nonEmpty(entry.rule_ids)) gaps.push('rule_missing');
  if (!nonEmpty(entry.scenario_ids)) gaps.push('scenario_missing');
  if (!nonEmpty(entry.source_coordinate_ids)) gaps.push('source_missing');
  for (const [field, label] of EXPERIENCE_FIELDS) {
    if (!nonEmpty(entry[field])) gaps.push(`${label}_missing`);
  }
  if (observations.length === 0) {
    gaps.push('coverage_not_declared');
  } else {
    if (observations.some((item) => item.authority_level !== 'L2_locator')) {
      gaps.push('authority_locator_unverified');
    }
    if (
      observations.some(
        (item) =>
          item.evaluation_cases_declared_count === 0 ||
          item.evaluation_results_verified_count !==
            item.evaluation_cases_declared_count,
      )
    ) {
      gaps.push('evaluation_result_unverified');
    }
    if (observations.some((item) => !item.temporal_authority_verified)) {
      gaps.push('temporal_authority_unverified');
    }
    if (observations.some((item) => !item.coverage_release_verified)) {
      gaps.push('release_evidence_missing');
    }
  }
  return sortUnique(gaps);
}

function readinessState(entry, observations, state, gaps) {
  if (state === 'verified_release') return 'verified_release';
  if (state === 'coverage_declared') return 'declared_incomplete';
  if (
    nonEmpty(entry.rule_ids) &&
    nonEmpty(entry.scenario_ids) &&
    nonEmpty(entry.source_coordinate_ids) &&
    !gaps.some((gap) => gap.endsWith('_missing'))
  ) {
    return 'graph_ready_unmapped';
  }
  return 'structure_incomplete';
}

function nextAction(readiness) {
  if (readiness === 'verified_release') return 'maintain_and_reverify';
  if (readiness === 'declared_incomplete') {
    return 'close_declared_coverage_gates';
  }
  if (readiness === 'graph_ready_unmapped') {
    return 'declare_coverage_and_evaluation_scope';
  }
  return 'complete_canonical_content_structure';
}

export async function buildPublicationExpansionBacklog(options = {}) {
  const documents = await loadCoverageDocuments(options);
  const validation = validateCoverageDocuments(documents);
  if (validation.errors.length > 0) {
    throw new Error(
      `coverage matrix validation failed:\n${validation.errors.join('\n')}`,
    );
  }

  const entries = [...documents.bundle.knowledge.content_entries].sort((a, b) =>
    a.content_id.localeCompare(b.content_id),
  );
  const hubs = [...documents.bundle.knowledge.topic_hubs].sort((a, b) =>
    a.hub_id.localeCompare(b.hub_id),
  );
  const entryIds = new Set(entries.map((entry) => entry.content_id));
  const hubIds = new Set(hubs.map((hub) => hub.hub_id));
  const coverageByContent = new Map();

  for (const unit of validation.units) {
    const observation = validation.observations.find(
      (item) => item.coverage_unit_id === unit.coverage_unit_id,
    );
    if (!observation) {
      throw new Error(`coverage observation missing:${unit.coverage_unit_id}`);
    }
    for (const contentId of unit.canonical_content_ids) {
      const current = coverageByContent.get(contentId) ?? [];
      current.push({
        coverage_unit_id: unit.coverage_unit_id,
        ...observation,
      });
      coverageByContent.set(contentId, current);
    }
  }

  const backlogEntries = entries.map((entry) => {
    const observations = (coverageByContent.get(entry.content_id) ?? []).sort(
      (a, b) => a.coverage_unit_id.localeCompare(b.coverage_unit_id),
    );
    const state = coverageState(observations);
    const gaps = entryGaps(entry, observations);
    const readiness = readinessState(entry, observations, state, gaps);
    return {
      content_id: entry.content_id,
      content_revision_sha256: canonicalSha256(entry),
      coverage_state: state,
      coverage_unit_ids: observations.map((item) => item.coverage_unit_id),
      gap_codes: gaps,
      hub_ids: sortUnique(entry.hub_ids ?? []),
      next_action: nextAction(readiness),
      readiness_state: readiness,
    };
  });

  const backlogIds = new Set(backlogEntries.map((entry) => entry.content_id));
  if (
    backlogIds.size !== entryIds.size ||
    [...entryIds].some((id) => !backlogIds.has(id))
  ) {
    throw new Error('backlog content closure failed');
  }

  const hubSummary = hubs.map((hub) => {
    const hubEntries = backlogEntries.filter((entry) =>
      entry.hub_ids.includes(hub.hub_id),
    );
    const declared = hubEntries.filter(
      (entry) => entry.coverage_state !== 'unmapped',
    ).length;
    return {
      content_count: hubEntries.length,
      coverage_declared_count: declared,
      coverage_unmapped_count: hubEntries.length - declared,
      hub_id: hub.hub_id,
      verified_release_count: hubEntries.filter(
        (entry) => entry.coverage_state === 'verified_release',
      ).length,
    };
  });
  if (
    hubSummary.length !== hubIds.size ||
    hubSummary.some((item) => !hubIds.has(item.hub_id))
  ) {
    throw new Error('backlog hub closure failed');
  }

  const countBy = (field, value) =>
    backlogEntries.filter((entry) => entry[field] === value).length;
  return {
    schema: 'rulelink_publication_expansion_backlog_v1',
    snapshot_id: documents.bundle.snapshot_id,
    base_bundle_sha256: validation.base_bundle_sha256,
    coverage_manifest_sha256: validation.manifest_sha256,
    content_count: backlogEntries.length,
    hub_count: hubSummary.length,
    summary: {
      coverage_declared: countBy('coverage_state', 'coverage_declared'),
      coverage_unmapped: countBy('coverage_state', 'unmapped'),
      declared_incomplete: countBy(
        'readiness_state',
        'declared_incomplete',
      ),
      graph_ready_unmapped: countBy(
        'readiness_state',
        'graph_ready_unmapped',
      ),
      structure_incomplete: countBy(
        'readiness_state',
        'structure_incomplete',
      ),
      verified_release: countBy('coverage_state', 'verified_release'),
    },
    entries: backlogEntries,
    hubs: hubSummary,
    honesty: {
      demand_is_not_legal_accuracy: true,
      declared_coverage_is_not_verified_release: true,
      graph_readiness_is_not_legal_verification: true,
      no_legal_priority_is_inferred: true,
      release_state_is_derived_from_trusted_receipts: true,
    },
  };
}

export async function validatePublicationExpansionBacklog(options = {}) {
  const expected = await buildPublicationExpansionBacklog(options);
  const backlogPath =
    options.expansionBacklogPath ?? DEFAULT_EXPANSION_BACKLOG_PATH;
  let actual;
  try {
    actual = JSON.parse(await readFile(backlogPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `publication expansion backlog missing or invalid:${backlogPath}:${error.message}`,
    );
  }
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error('publication expansion backlog drift detected');
  }
  return expected;
}

async function main() {
  const write = process.argv.includes('--write');
  const output = write
    ? await buildPublicationExpansionBacklog()
    : await validatePublicationExpansionBacklog();
  if (write) {
    await writeFile(
      DEFAULT_EXPANSION_BACKLOG_PATH,
      `${JSON.stringify(output, null, 2)}\n`,
      'utf8',
    );
  }
  process.stdout.write(
    `${JSON.stringify({ path: DEFAULT_EXPANSION_BACKLOG_PATH, summary: output.summary })}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
