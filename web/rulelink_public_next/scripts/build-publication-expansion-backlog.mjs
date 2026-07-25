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
export const DEFAULT_EXPANSION_BACKLOG_SCHEMA_PATH = path.resolve(
  WEB_ROOT,
  '..',
  '..',
  'artifacts',
  'publication',
  'coverage',
  'expansion-backlog.schema.json',
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

function uniqueIds(items, key, label, errors) {
  const ids = [];
  for (const [index, item] of items.entries()) {
    const id = item?.[key];
    if (typeof id !== 'string' || id.length === 0) {
      errors.push(`${label}_id_invalid:${index}`);
      continue;
    }
    ids.push(id);
  }
  for (const duplicate of ids.filter((id, index) => ids.indexOf(id) !== index)) {
    errors.push(`${label}_id_duplicate:${duplicate}`);
  }
  return new Set(ids);
}

function validateBacklogInputGraph(bundle) {
  const errors = [];
  const knowledge = bundle?.knowledge;
  const entries = Array.isArray(knowledge?.content_entries)
    ? knowledge.content_entries
    : [];
  const hubs = Array.isArray(knowledge?.topic_hubs)
    ? knowledge.topic_hubs
    : [];
  const rules = Array.isArray(knowledge?.rule_cards)
    ? knowledge.rule_cards
    : [];
  const scenarios = Array.isArray(knowledge?.scenario_branches)
    ? knowledge.scenario_branches
    : [];
  const sources = Array.isArray(knowledge?.sources) ? knowledge.sources : [];
  const contentIds = uniqueIds(entries, 'content_id', 'content', errors);
  const hubIds = uniqueIds(hubs, 'hub_id', 'hub', errors);
  const ruleIds = uniqueIds(rules, 'rule_id', 'rule', errors);
  const scenarioIds = uniqueIds(
    scenarios,
    'scenario_id',
    'scenario',
    errors,
  );
  const sourceIds = uniqueIds(
    sources,
    'coordinate_id',
    'source',
    errors,
  );
  const contentById = new Map(entries.map((entry) => [entry.content_id, entry]));
  const hubById = new Map(hubs.map((hub) => [hub.hub_id, hub]));

  for (const entry of entries) {
    const label = `content:${entry.content_id ?? 'unknown'}`;
    if (!Array.isArray(entry.hub_ids) || entry.hub_ids.length === 0) {
      errors.push(`${label}:hub_required`);
    }
    for (const hubId of entry.hub_ids ?? []) {
      if (!hubIds.has(hubId)) errors.push(`${label}:hub_missing:${hubId}`);
      if (!(hubById.get(hubId)?.content_ids ?? []).includes(entry.content_id)) {
        errors.push(`${label}:hub_reverse_missing:${hubId}`);
      }
    }
    for (const ruleId of entry.rule_ids ?? []) {
      if (!ruleIds.has(ruleId)) errors.push(`${label}:rule_missing:${ruleId}`);
    }
    for (const scenarioId of entry.scenario_ids ?? []) {
      if (!scenarioIds.has(scenarioId)) {
        errors.push(`${label}:scenario_missing:${scenarioId}`);
      }
    }
    for (const sourceId of entry.source_coordinate_ids ?? []) {
      if (!sourceIds.has(sourceId)) {
        errors.push(`${label}:source_missing:${sourceId}`);
      }
    }
  }
  for (const hub of hubs) {
    const label = `hub:${hub.hub_id ?? 'unknown'}`;
    if (!Array.isArray(hub.content_ids)) {
      errors.push(`${label}:content_ids_array_required`);
      continue;
    }
    if (new Set(hub.content_ids).size !== hub.content_ids.length) {
      errors.push(`${label}:content_id_duplicate`);
    }
    for (const contentId of hub.content_ids) {
      if (!contentIds.has(contentId)) {
        errors.push(`${label}:content_missing:${contentId}`);
      }
      if (!(contentById.get(contentId)?.hub_ids ?? []).includes(hub.hub_id)) {
        errors.push(`${label}:content_reverse_missing:${contentId}`);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `publication expansion input graph invalid:\n${sortUnique(errors).join('\n')}`,
    );
  }
}

export function coverageState(observations) {
  if (observations.length === 0) return 'unmapped';
  if (
    observations.every(
      (item) =>
        item.coverage_release_verified &&
        item.temporal_authority_verified &&
        item.authority_level === 'L2_locator' &&
        item.branch_closed &&
        item.experience_fields_complete &&
        item.evaluation_cases_declared_count > 0 &&
        item.evaluation_results_verified_count ===
          item.evaluation_cases_declared_count,
    )
  ) {
    return 'verified_release';
  }
  return 'coverage_declared';
}

export function entryGaps(entry, observations) {
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
    if (observations.some((item) => !item.branch_closed)) {
      gaps.push('branch_closure_incomplete');
    }
    if (observations.some((item) => !item.coverage_release_verified)) {
      gaps.push('release_evidence_missing');
    }
  }
  return sortUnique(gaps);
}

export function readinessState(entry, observations, state, gaps) {
  if (state === 'verified_release' && gaps.length === 0) {
    return 'verified_release';
  }
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
  validateBacklogInputGraph(documents.bundle);

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
    backlogEntries.length !== backlogIds.size ||
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
  const schemaPath =
    options.expansionBacklogSchemaPath ??
    DEFAULT_EXPANSION_BACKLOG_SCHEMA_PATH;
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  if (
    schema?.$id !==
      'urn:rulelink:schema:publication-expansion-backlog:v1' ||
    schema?.properties?.schema?.const !==
      'rulelink_publication_expansion_backlog_v1'
  ) {
    throw new Error('publication expansion backlog schema identity invalid');
  }
  const output = {
    schema: 'rulelink_publication_expansion_backlog_v1',
    schema_sha256: canonicalSha256(schema),
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
  validateJsonSchema(schema, output);
  return output;
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
  const schemaPath =
    options.expansionBacklogSchemaPath ??
    DEFAULT_EXPANSION_BACKLOG_SCHEMA_PATH;
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  validateJsonSchema(schema, actual);
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error('publication expansion backlog drift detected');
  }
  return expected;
}

function resolveSchemaReference(rootSchema, reference) {
  if (!reference.startsWith('#/')) {
    throw new Error(`unsupported schema reference:${reference}`);
  }
  return reference
    .slice(2)
    .split('/')
    .reduce(
      (current, segment) =>
        current?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')],
      rootSchema,
    );
}

function validateJsonSchema(rootSchema, value) {
  const errors = [];
  const visit = (schema, current, location) => {
    if (schema.$ref) {
      const resolved = resolveSchemaReference(rootSchema, schema.$ref);
      if (!resolved) errors.push(`${location}:schema_ref_missing`);
      else visit(resolved, current, location);
      return;
    }
    if ('const' in schema && current !== schema.const) {
      errors.push(`${location}:const`);
    }
    if (schema.enum && !schema.enum.includes(current)) {
      errors.push(`${location}:enum`);
    }
    if (schema.type === 'object') {
      if (
        current === null ||
        typeof current !== 'object' ||
        Array.isArray(current)
      ) {
        errors.push(`${location}:object`);
        return;
      }
      for (const key of schema.required ?? []) {
        if (!(key in current)) errors.push(`${location}.${key}:required`);
      }
      for (const [key, child] of Object.entries(current)) {
        if (schema.properties?.[key]) {
          visit(schema.properties[key], child, `${location}.${key}`);
        } else if (schema.additionalProperties === false) {
          errors.push(`${location}.${key}:additional`);
        } else if (
          schema.additionalProperties &&
          typeof schema.additionalProperties === 'object'
        ) {
          visit(schema.additionalProperties, child, `${location}.${key}`);
        }
      }
      return;
    }
    if (schema.type === 'array') {
      if (!Array.isArray(current)) {
        errors.push(`${location}:array`);
        return;
      }
      if (
        Number.isInteger(schema.minItems) &&
        current.length < schema.minItems
      ) {
        errors.push(`${location}:minItems`);
      }
      if (
        schema.uniqueItems &&
        new Set(current.map((item) => canonicalJson(item))).size !==
          current.length
      ) {
        errors.push(`${location}:uniqueItems`);
      }
      for (const [index, item] of current.entries()) {
        if (schema.items) visit(schema.items, item, `${location}[${index}]`);
      }
      return;
    }
    if (schema.type === 'string') {
      if (typeof current !== 'string') errors.push(`${location}:string`);
      else {
        if (schema.minLength && current.length < schema.minLength) {
          errors.push(`${location}:minLength`);
        }
        if (schema.pattern && !new RegExp(schema.pattern, 'u').test(current)) {
          errors.push(`${location}:pattern`);
        }
      }
    }
    if (
      schema.type === 'integer' &&
      (!Number.isInteger(current) ||
        (schema.minimum !== undefined && current < schema.minimum))
    ) {
      errors.push(`${location}:integer`);
    }
  };
  visit(rootSchema, value, '$');
  if (errors.length > 0) {
    throw new Error(
      `publication expansion backlog schema invalid:\n${errors.join('\n')}`,
    );
  }
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
