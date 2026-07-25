import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(appRoot, '..', '..');

export const DEFAULT_COVERAGE_MANIFEST_PATH = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'coverage',
  'coverage-manifest.json',
);

export const DEFAULT_PUBLICATION_BUNDLE_PATH = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);

const UNIT_REQUIRED_KEYS = [
  'coverage_unit_id',
  'question_family_id',
  'procedure_stage_id',
  'jurisdiction',
  'as_of_policy',
  'risk_level',
  'target_authority_level',
  'branch_signature',
  'canonical_content_ids',
  'required_rule_ids',
  'required_scenario_ids',
  'required_source_coordinate_ids',
  'source_version_requirements',
  'required_authority_binding_ids',
  'evaluation_case_ids',
];

const NON_EMPTY_ARRAY_KEYS = [
  'branch_signature',
  'canonical_content_ids',
  'required_rule_ids',
  'required_scenario_ids',
  'required_source_coordinate_ids',
];

const ARRAY_KEYS = [
  ...NON_EMPTY_ARRAY_KEYS,
  'required_authority_binding_ids',
  'evaluation_case_ids',
];

const AS_OF_POLICIES = new Set([
  'current_as_of_review',
  'historical',
  'future_effective',
]);

const RISK_LEVELS = new Set(['standard', 'high', 'critical']);
const TARGET_AUTHORITY_LEVELS = new Set(['L1_coordinate', 'L2_locator']);

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function canonicalSha256(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function bytesSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readJson(filename, label) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    throw new Error(
      `${label} JSON을 읽을 수 없습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function resolveRepositoryFile(filename, label) {
  const resolved = path.resolve(repositoryRoot, filename);
  const relative = path.relative(repositoryRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} 경로가 저장소 밖을 가리킵니다: ${filename}`);
  }
  return resolved;
}

export async function loadCoverageDocuments(options = {}) {
  const manifestPath = path.resolve(
    options.manifestPath ?? DEFAULT_COVERAGE_MANIFEST_PATH,
  );
  const bundlePath = path.resolve(
    options.bundlePath ?? DEFAULT_PUBLICATION_BUNDLE_PATH,
  );
  const manifest = await readJson(manifestPath, 'coverage manifest');
  const bundleBytes = await readFile(bundlePath);
  let bundle;
  try {
    bundle = JSON.parse(bundleBytes.toString('utf8'));
  } catch (error) {
    throw new Error(
      `publication bundle JSON을 읽을 수 없습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const [questionCatalog, procedureCatalog, authorityPolicy] =
    await Promise.all([
      readJson(
        resolveRepositoryFile(
          manifest.question_family_catalog_file,
          'question family catalog',
        ),
        'question family catalog',
      ),
      readJson(
        resolveRepositoryFile(
          manifest.procedure_stage_catalog_file,
          'procedure stage catalog',
        ),
        'procedure stage catalog',
      ),
      readJson(
        resolveRepositoryFile(
          manifest.authority_level_policy_file,
          'authority level policy',
        ),
        'authority level policy',
      ),
    ]);
  const domains = [];
  for (const filename of manifest.domain_files ?? []) {
    domains.push(
      await readJson(
        resolveRepositoryFile(filename, 'coverage domain'),
        `coverage domain ${filename}`,
      ),
    );
  }
  return {
    authorityPolicy,
    bundle,
    bundleSha256: bytesSha256(bundleBytes),
    domains,
    manifest,
    procedureCatalog,
    questionCatalog,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function idSet(items, key) {
  return new Set(
    Array.isArray(items)
      ? items
          .map((item) => (isRecord(item) ? item[key] : undefined))
          .filter((value) => typeof value === 'string')
      : [],
  );
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function validateUniqueStringArray(value, label, errors, {nonEmpty = false} = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${label}:array_required`);
    return;
  }
  if (nonEmpty && value.length === 0) {
    errors.push(`${label}:non_empty_required`);
  }
  if (value.some((item) => typeof item !== 'string' || item.length === 0)) {
    errors.push(`${label}:non_empty_strings_required`);
  }
  const duplicates = duplicateValues(value);
  for (const duplicate of duplicates) {
    errors.push(`${label}:duplicate:${duplicate}`);
  }
}

function missingReferences(values, available) {
  return values.filter((value) => !available.has(value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function addMissingReferenceErrors(errors, label, values, available) {
  for (const value of missingReferences(values, available)) {
    errors.push(`${label}:missing:${value}`);
  }
}

function sourceVersionState(unit, sourceById) {
  const requirements = Array.isArray(unit.source_version_requirements)
    ? unit.source_version_requirements
    : [];
  const invalidations = [];
  for (const requirement of requirements) {
    if (!isRecord(requirement)) continue;
    const source = sourceById.get(requirement.coordinate_id);
    if (!source) continue;
    if (source.source_snapshot_id !== requirement.source_snapshot_id) {
      invalidations.push(
        `source_snapshot_changed:${requirement.coordinate_id}:${
          requirement.source_snapshot_id ?? 'missing'
        }:${source.source_snapshot_id ?? 'missing'}`,
      );
    }
    if (source.last_verified_at !== requirement.last_verified_at) {
      invalidations.push(
        `source_verification_changed:${requirement.coordinate_id}:${
          requirement.last_verified_at ?? 'missing'
        }:${source.last_verified_at ?? 'missing'}`,
      );
    }
  }
  return {
    current: requirements.length > 0 && invalidations.length === 0,
    invalidations,
  };
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function contentExperienceState(contentIds, contentById) {
  const missing = [];
  for (const contentId of contentIds) {
    const content = contentById.get(contentId);
    if (!content) continue;
    const checks = [
      ['situation', nonEmptyText(content.audience_situation_ko)],
      ['quick_answer', nonEmptyText(content.one_line_answer_ko)],
      [
        'facts',
        Array.isArray(content.facts_to_check_ko) &&
          content.facts_to_check_ko.length > 0,
      ],
      [
        'actions',
        Array.isArray(content.action_steps_ko) &&
          content.action_steps_ko.length > 0,
      ],
      ['caution', nonEmptyText(content.caution_ko)],
      [
        'body',
        Array.isArray(content.body_sections) && content.body_sections.length > 0,
      ],
    ];
    for (const [surface, ready] of checks) {
      if (!ready) missing.push(`${contentId}:${surface}`);
    }
  }
  return {
    ready: contentIds.length > 0 && missing.length === 0,
    missing,
  };
}

function coverageObservation({
  authorityBindingIds,
  contentById,
  contentIds,
  currentSnapshotMatches,
  questionFamilyIds,
  procedureStageIds,
  ruleIds,
  scenarioIds,
  sourceById,
  sourceIds,
  topicIds,
  topicHubById,
  unit,
}) {
  const hub = topicHubById.get(unit.topic_id);
  const canonicalContentIds = safeArray(unit.canonical_content_ids);
  const requiredRuleIds = safeArray(unit.required_rule_ids);
  const requiredScenarioIds = safeArray(unit.required_scenario_ids);
  const requiredSourceCoordinateIds = safeArray(
    unit.required_source_coordinate_ids,
  );
  const requiredAuthorityBindingIds = safeArray(
    unit.required_authority_binding_ids,
  );
  const evaluationCaseIds = safeArray(unit.evaluation_case_ids);
  const sourceVersion = sourceVersionState(unit, sourceById);
  const experience = contentExperienceState(
    canonicalContentIds,
    contentById,
  );
  const contentInHub =
    hub &&
    canonicalContentIds.every((contentId) =>
      new Set(hub.content_ids ?? []).has(contentId),
    );
  const structured =
    topicIds.has(unit.topic_id) &&
    questionFamilyIds.has(unit.question_family_id) &&
    procedureStageIds.has(unit.procedure_stage_id) &&
    contentInHub &&
    canonicalContentIds.every((id) => contentIds.has(id)) &&
    requiredRuleIds.every((id) => ruleIds.has(id)) &&
    requiredScenarioIds.every((id) => scenarioIds.has(id));
  const l1 =
    structured &&
    requiredSourceCoordinateIds.length > 0 &&
    requiredSourceCoordinateIds.every((id) => sourceIds.has(id)) &&
    sourceVersion.current;
  const l2 =
    l1 &&
    requiredAuthorityBindingIds.length > 0 &&
    requiredAuthorityBindingIds.every((id) => authorityBindingIds.has(id));
  return {
    authority_level: l2 ? 'L2_locator' : l1 ? 'L1_coordinate' : 'L0_structure',
    content_present_in_base_snapshot: Boolean(
      structured && currentSnapshotMatches,
    ),
    coverage_release_verified: false,
    evaluation_case_count: evaluationCaseIds.length,
    evaluation_verified: false,
    experience_missing: experience.missing,
    experience_ready: experience.ready,
    source_version_current: sourceVersion.current,
    structured: Boolean(structured),
    target_gap:
      (unit.target_authority_level === 'L2_locator' ? !l2 : !l1) ||
      !experience.ready,
  };
}

export function validateCoverageDocuments(documents) {
  const errors = [];
  const invalidations = [];
  const {
    authorityPolicy,
    bundle,
    bundleSha256,
    domains,
    manifest,
    procedureCatalog,
    questionCatalog,
  } = documents;

  if (manifest?.schema !== 'rulelink_publication_coverage_manifest_v1') {
    errors.push('coverage_manifest_schema_invalid');
  }
  if (!Array.isArray(manifest?.domain_files) || manifest.domain_files.length === 0) {
    errors.push('coverage_manifest_domain_files_required');
  } else {
    for (const duplicate of duplicateValues(manifest.domain_files)) {
      errors.push(`coverage_manifest_domain_file_duplicate:${duplicate}`);
    }
  }
  if (bundle?.snapshot_id !== manifest?.base_snapshot_id) {
    errors.push(
      `coverage_base_snapshot_mismatch:${manifest?.base_snapshot_id ?? 'missing'}:${
        bundle?.snapshot_id ?? 'missing'
      }`,
    );
  }
  if (bundleSha256 !== manifest?.base_bundle_sha256) {
    errors.push(
      `coverage_base_bundle_hash_mismatch:${
        manifest?.base_bundle_sha256 ?? 'missing'
      }:${bundleSha256 ?? 'missing'}`,
    );
  }
  if (
    questionCatalog?.schema !==
    'rulelink_publication_question_family_catalog_v1'
  ) {
    errors.push('coverage_question_catalog_schema_invalid');
  }
  if (
    procedureCatalog?.schema !==
    'rulelink_publication_procedure_stage_catalog_v1'
  ) {
    errors.push('coverage_procedure_catalog_schema_invalid');
  }
  if (
    authorityPolicy?.schema !==
    'rulelink_publication_authority_level_policy_v1'
  ) {
    errors.push('coverage_authority_policy_schema_invalid');
  }

  const questionFamilies = questionCatalog?.question_families ?? [];
  const procedureStages = procedureCatalog?.procedure_stages ?? [];
  const authorityLevels = authorityPolicy?.levels ?? [];
  const questionFamilyIds = idSet(questionFamilies, 'question_family_id');
  const procedureStageIds = idSet(procedureStages, 'procedure_stage_id');
  const authorityLevelIds = idSet(authorityLevels, 'authority_level');

  for (const duplicate of duplicateValues(
    questionFamilies.map((item) => item?.question_family_id),
  )) {
    errors.push(`coverage_question_family_duplicate:${duplicate}`);
  }
  for (const duplicate of duplicateValues(
    procedureStages.map((item) => item?.procedure_stage_id),
  )) {
    errors.push(`coverage_procedure_stage_duplicate:${duplicate}`);
  }
  for (const requiredLevel of [
    'L0_structure',
    'L1_coordinate',
    'L2_locator',
  ]) {
    if (!authorityLevelIds.has(requiredLevel)) {
      errors.push(`coverage_authority_level_missing:${requiredLevel}`);
    }
  }

  const knowledge = bundle?.knowledge ?? {};
  const contentEntries = knowledge.content_entries ?? [];
  const ruleCards = knowledge.rule_cards ?? [];
  const scenarioBranches = knowledge.scenario_branches ?? [];
  const sources = knowledge.sources ?? [];
  const topicHubs = knowledge.topic_hubs ?? [];
  const authorityBindings = knowledge.authority_bindings ?? [];
  const contentIds = idSet(contentEntries, 'content_id');
  const ruleIds = idSet(ruleCards, 'rule_id');
  const scenarioIds = idSet(scenarioBranches, 'scenario_id');
  const sourceIds = idSet(sources, 'coordinate_id');
  const sourceById = new Map(
    sources.map((source) => [source.coordinate_id, source]),
  );
  const topicIds = idSet(topicHubs, 'hub_id');
  const authorityBindingIds = idSet(
    authorityBindings,
    'authority_binding_id',
  );
  const contentById = new Map(
    contentEntries.map((entry) => [entry.content_id, entry]),
  );
  const ruleById = new Map(ruleCards.map((rule) => [rule.rule_id, rule]));
  const scenarioById = new Map(
    scenarioBranches.map((scenario) => [scenario.scenario_id, scenario]),
  );
  const topicHubById = new Map(topicHubs.map((hub) => [hub.hub_id, hub]));

  const units = [];
  const domainTopicIds = [];
  for (const domain of domains ?? []) {
    if (domain?.schema !== 'rulelink_publication_domain_coverage_v1') {
      errors.push(
        `coverage_domain_schema_invalid:${domain?.topic_id ?? 'unknown'}`,
      );
      continue;
    }
    if (!Number.isInteger(domain.coverage_version) || domain.coverage_version < 1) {
      errors.push(`coverage_domain_version_invalid:${domain.topic_id}`);
    }
    domainTopicIds.push(domain.topic_id);
    if (!topicIds.has(domain.topic_id)) {
      errors.push(`coverage_domain_topic_missing:${domain.topic_id}`);
    }
    if (!Array.isArray(domain.units) || domain.units.length === 0) {
      errors.push(`coverage_domain_units_required:${domain.topic_id}`);
      continue;
    }
    for (const unit of domain.units) {
      units.push({...unit, topic_id: domain.topic_id});
    }
  }
  for (const duplicate of duplicateValues(domainTopicIds)) {
    errors.push(`coverage_domain_topic_duplicate:${duplicate}`);
  }
  for (const duplicate of duplicateValues(
    units.map((unit) => unit.coverage_unit_id),
  )) {
    errors.push(`coverage_unit_duplicate:${duplicate}`);
  }
  for (const duplicate of duplicateValues(
    units.flatMap((unit) => unit.evaluation_case_ids ?? []),
  )) {
    errors.push(`coverage_evaluation_case_duplicate:${duplicate}`);
  }

  const observations = [];
  for (const unit of units) {
    const label = `coverage_unit:${unit.coverage_unit_id ?? 'unknown'}`;
    if (!isRecord(unit)) {
      errors.push(`${label}:object_required`);
      continue;
    }
    for (const key of UNIT_REQUIRED_KEYS) {
      if (!(key in unit)) errors.push(`${label}:field_missing:${key}`);
    }
    if (
      typeof unit.coverage_unit_id !== 'string' ||
      !/^coverage\.kr\.[a-z0-9.-]+\.v[1-9][0-9]*$/.test(
        unit.coverage_unit_id,
      )
    ) {
      errors.push(`${label}:coverage_unit_id_invalid`);
    }
    if (unit.jurisdiction !== 'KR') {
      errors.push(`${label}:jurisdiction_invalid`);
    }
    if (!AS_OF_POLICIES.has(unit.as_of_policy)) {
      errors.push(`${label}:as_of_policy_invalid`);
    }
    if (!RISK_LEVELS.has(unit.risk_level)) {
      errors.push(`${label}:risk_level_invalid`);
    }
    if (!TARGET_AUTHORITY_LEVELS.has(unit.target_authority_level)) {
      errors.push(`${label}:target_authority_level_invalid`);
    }
    for (const key of ARRAY_KEYS) {
      validateUniqueStringArray(unit[key], `${label}:${key}`, errors, {
        nonEmpty: NON_EMPTY_ARRAY_KEYS.includes(key),
      });
    }
    if (!Array.isArray(unit.source_version_requirements)) {
      errors.push(`${label}:source_version_requirements:array_required`);
    } else {
      if (unit.source_version_requirements.length === 0) {
        errors.push(
          `${label}:source_version_requirements:non_empty_required`,
        );
      }
      const requirementIds = [];
      for (const [index, requirement] of unit.source_version_requirements.entries()) {
        const requirementLabel = `${label}:source_version_requirements:${index}`;
        if (!isRecord(requirement)) {
          errors.push(`${requirementLabel}:object_required`);
          continue;
        }
        const keys = Object.keys(requirement).sort();
        if (
          keys.join(',') !==
          'coordinate_id,last_verified_at,source_snapshot_id'
        ) {
          errors.push(`${requirementLabel}:fields_invalid`);
        }
        for (const key of [
          'coordinate_id',
          'source_snapshot_id',
          'last_verified_at',
        ]) {
          if (
            typeof requirement[key] !== 'string' ||
            requirement[key].length === 0
          ) {
            errors.push(`${requirementLabel}:${key}:non_empty_string_required`);
          }
        }
        requirementIds.push(requirement.coordinate_id);
      }
      for (const duplicate of duplicateValues(requirementIds)) {
        errors.push(
          `${label}:source_version_requirements:duplicate:${duplicate}`,
        );
      }
      const declaredIds = [...new Set(unit.required_source_coordinate_ids ?? [])]
        .sort();
      const pinnedIds = [...new Set(requirementIds)].sort();
      if (canonicalJson(declaredIds) !== canonicalJson(pinnedIds)) {
        errors.push(`${label}:source_version_requirements:coordinate_set_mismatch`);
      }
      for (const invalidation of sourceVersionState(unit, sourceById)
        .invalidations) {
        invalidations.push(`${label}:${invalidation}`);
      }
    }
    if (!questionFamilyIds.has(unit.question_family_id)) {
      errors.push(
        `${label}:question_family_missing:${unit.question_family_id}`,
      );
    }
    if (!procedureStageIds.has(unit.procedure_stage_id)) {
      errors.push(
        `${label}:procedure_stage_missing:${unit.procedure_stage_id}`,
      );
    }
    addMissingReferenceErrors(
      errors,
      `${label}:content`,
      unit.canonical_content_ids ?? [],
      contentIds,
    );
    addMissingReferenceErrors(
      errors,
      `${label}:rule`,
      unit.required_rule_ids ?? [],
      ruleIds,
    );
    addMissingReferenceErrors(
      errors,
      `${label}:scenario`,
      unit.required_scenario_ids ?? [],
      scenarioIds,
    );
    addMissingReferenceErrors(
      errors,
      `${label}:source`,
      unit.required_source_coordinate_ids ?? [],
      sourceIds,
    );
    addMissingReferenceErrors(
      errors,
      `${label}:authority_binding`,
      unit.required_authority_binding_ids ?? [],
      authorityBindingIds,
    );

    const hubContentIds = new Set(
      topicHubById.get(unit.topic_id)?.content_ids ?? [],
    );
    for (const contentId of unit.canonical_content_ids ?? []) {
      if (!hubContentIds.has(contentId)) {
        errors.push(`${label}:content_not_in_topic:${contentId}`);
      }
    }
    const reachableRuleIds = new Set();
    const reachableScenarioIds = new Set();
    const reachableSourceIds = new Set();
    for (const contentId of unit.canonical_content_ids ?? []) {
      const content = contentById.get(contentId);
      for (const id of content?.rule_ids ?? []) reachableRuleIds.add(id);
      for (const id of content?.scenario_ids ?? []) reachableScenarioIds.add(id);
      for (const id of content?.source_coordinate_ids ?? [])
        reachableSourceIds.add(id);
    }
    for (const ruleId of unit.required_rule_ids ?? []) {
      if (!reachableRuleIds.has(ruleId)) {
        errors.push(`${label}:rule_not_reachable_from_content:${ruleId}`);
      }
      for (const id of ruleById.get(ruleId)?.source_coordinate_ids ?? [])
        reachableSourceIds.add(id);
    }
    for (const scenarioId of unit.required_scenario_ids ?? []) {
      if (!reachableScenarioIds.has(scenarioId)) {
        errors.push(`${label}:scenario_not_reachable_from_content:${scenarioId}`);
      }
      for (const id of scenarioById.get(scenarioId)?.source_coordinate_ids ?? [])
        reachableSourceIds.add(id);
    }
    for (const sourceId of unit.required_source_coordinate_ids ?? []) {
      if (!reachableSourceIds.has(sourceId)) {
        errors.push(`${label}:source_not_reachable_from_answer_graph:${sourceId}`);
      }
    }
    observations.push({
      coverage_unit_id: unit.coverage_unit_id,
      topic_id: unit.topic_id,
      ...coverageObservation({
        authorityBindingIds,
        contentById,
        contentIds,
        currentSnapshotMatches:
          bundle.snapshot_id === manifest.base_snapshot_id &&
          bundleSha256 === manifest.base_bundle_sha256,
        procedureStageIds,
        questionFamilyIds,
        ruleIds,
        scenarioIds,
        sourceById,
        sourceIds,
        topicHubById,
        topicIds,
        unit,
      }),
    });
  }

  return {
    errors: [...new Set(errors)].sort(),
    invalidations: [...new Set(invalidations)].sort(),
    base_bundle_sha256: bundleSha256 ?? null,
    manifest_sha256: canonicalSha256({
      authorityPolicy,
      domains,
      manifest,
      procedureCatalog,
      questionCatalog,
    }),
    observations,
    snapshot_id: bundle?.snapshot_id ?? null,
    units,
  };
}

export function buildCoverageDashboard(validation) {
  if (validation.errors.length > 0) {
    throw new Error(
      `coverage matrix validation failed:\n${validation.errors.join('\n')}`,
    );
  }
  const byTopic = new Map();
  for (const observation of validation.observations) {
    const current = byTopic.get(observation.topic_id) ?? {
      authority_l0: 0,
      authority_l1: 0,
      authority_l2: 0,
      coverage_units: 0,
      declared_evaluation_cases: 0,
      content_present_in_base_snapshot: 0,
      experience_ready_coverage_units: 0,
      invalidated_coverage_units: 0,
      released_coverage_units: 0,
      target_gap: 0,
      topic_id: observation.topic_id,
    };
    current.coverage_units += 1;
    current.declared_evaluation_cases += observation.evaluation_case_count;
    current.content_present_in_base_snapshot +=
      observation.content_present_in_base_snapshot ? 1 : 0;
    current.experience_ready_coverage_units += observation.experience_ready
      ? 1
      : 0;
    current.invalidated_coverage_units += observation.source_version_current
      ? 0
      : 1;
    current.released_coverage_units += observation.coverage_release_verified
      ? 1
      : 0;
    current.target_gap += observation.target_gap ? 1 : 0;
    if (observation.authority_level === 'L2_locator') current.authority_l2 += 1;
    else if (observation.authority_level === 'L1_coordinate')
      current.authority_l1 += 1;
    else current.authority_l0 += 1;
    byTopic.set(observation.topic_id, current);
  }
  const total = {
    authority_l0: 0,
    authority_l1: 0,
    authority_l2: 0,
    coverage_units: validation.observations.length,
    content_present_in_base_snapshot: 0,
    declared_evaluation_cases: 0,
    experience_ready_coverage_units: 0,
    invalidated_coverage_units: 0,
    released_coverage_units: 0,
    target_gap: 0,
    verified_evaluation_receipts: 0,
  };
  for (const observation of validation.observations) {
    total.declared_evaluation_cases += observation.evaluation_case_count;
    total.content_present_in_base_snapshot +=
      observation.content_present_in_base_snapshot ? 1 : 0;
    total.experience_ready_coverage_units += observation.experience_ready
      ? 1
      : 0;
    total.invalidated_coverage_units += observation.source_version_current
      ? 0
      : 1;
    total.released_coverage_units += observation.coverage_release_verified
      ? 1
      : 0;
    total.target_gap += observation.target_gap ? 1 : 0;
    if (observation.authority_level === 'L2_locator') total.authority_l2 += 1;
    else if (observation.authority_level === 'L1_coordinate')
      total.authority_l1 += 1;
    else total.authority_l0 += 1;
  }
  return {
    schema: 'rulelink_publication_coverage_dashboard_v1',
    snapshot_id: validation.snapshot_id,
    base_bundle_sha256: validation.base_bundle_sha256,
    manifest_sha256: validation.manifest_sha256,
    total,
    by_topic: [...byTopic.values()].sort((a, b) =>
      a.topic_id.localeCompare(b.topic_id),
    ),
    experience_gaps: validation.observations
      .filter((observation) => !observation.experience_ready)
      .map((observation) => ({
        coverage_unit_id: observation.coverage_unit_id,
        missing: observation.experience_missing,
      })),
    honesty: {
      content_presence_is_not_experience_readiness: true,
      evaluation_case_ids_are_not_verification_receipts: true,
      l1_and_l2_are_reported_separately: true,
      released_state_is_derived_not_authored: true,
      source_versions_are_pinned: true,
    },
    invalidations: validation.invalidations,
  };
}
