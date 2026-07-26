import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
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

const DEFAULT_RELEASE_DESCRIPTOR_PATH = path.join(
  appRoot,
  'deploy',
  'release.json',
);

const DEFAULT_PRODUCTION_QUEUE_PATH = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'production-queue.json',
);

const DEFAULT_PRODUCTION_REGISTRY_PATH = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'production-queue-registry.json',
);

const UNIT_REQUIRED_KEYS = [
  'coverage_unit_id',
  'question_family_id',
  'procedure_stage_id',
  'jurisdiction',
  'as_of',
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
  'canonical_content_ids',
  'required_rule_ids',
  'required_scenario_ids',
  'required_source_coordinate_ids',
];

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RFC3339_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const TRUSTED_EVALUATOR_COMMIT =
  '3bea0db11468757531df602d40596decf2dce78e';
const TRUSTED_EVALUATION_SCOPE_MANIFEST_SHA256 =
  'c2aaaba48a17bba0c9cfe74827ca21502e61403e3695c4e8342a56853c381b35';
const TRUSTED_EVALUATION_CASE_FILE_SHA256 = new Set([
  'bb7c3c054ec9ec7b432f9ef985c566712e8b40dea6bdaa605a1021cb400fc6a4',
  '39a4dd5299e88ee01440158cacf4822cf84cc6467157fbe3939403b9273554be',
]);
const TRUSTED_EVALUATION_CASE_IDS = new Set([
  'eval.compensation-order.eligibility.A',
  'eval.compensation-order.eligibility.B',
  'eval.compensation-order.agreed-amount.A',
  'eval.compensation-order.agreed-amount.B',
  'eval.compensation-order.dismissal.A',
  'eval.compensation-order.dismissal.B',
  'eval.compensation-order.deadline.A',
  'eval.compensation-order.deadline.B',
  'eval.compensation-order.copies.A',
  'eval.compensation-order.copies.B',
  'eval.compensation-order.enforcement.A',
  'eval.compensation-order.enforcement.B',
]);
const TRUSTED_EVALUATION_GOLD_SHA256 =
  '90e5422f4d914a6080e0ee362a30e82cfba579aca5308a99c9873d893ccf16f8';
const TRUSTED_EVALUATION_RESULT_RECEIPTS = new Map();

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

function portableJsonTextSha256(value) {
  const normalized = value
    .toString('utf8')
    .replace(/\r\n?/gu, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
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
  const [evaluationScopeReceipt, releaseEvidence] = await Promise.all([
    readJson(
      resolveRepositoryFile(
        manifest.evaluation_scope_receipt_file,
        'evaluation scope receipt',
      ),
      'evaluation scope receipt',
    ),
    readJson(
      resolveRepositoryFile(
        manifest.release_evidence_file,
        'coverage release evidence',
      ),
      'coverage release evidence',
    ),
  ]);
  const evaluationResultEvidence = new Map();
  for (const receipt of evaluationScopeReceipt.verified_result_receipts ?? []) {
    const [resultBytes, reviewReceiptBytes] = await Promise.all([
      readFile(
        resolveRepositoryFile(
          receipt.result_path,
          `evaluation result ${receipt.case_id}`,
        ),
      ),
      readFile(
        resolveRepositoryFile(
          receipt.review_receipt_path,
          `evaluation review receipt ${receipt.case_id}`,
        ),
      ),
    ]);
    evaluationResultEvidence.set(receipt.case_id, {
      result: JSON.parse(resultBytes.toString('utf8')),
      resultSha256: bytesSha256(resultBytes),
      reviewReceipt: JSON.parse(reviewReceiptBytes.toString('utf8')),
      reviewReceiptSha256: bytesSha256(reviewReceiptBytes),
    });
  }
  const releaseDescriptorPath = path.resolve(
    options.releaseDescriptorPath ?? DEFAULT_RELEASE_DESCRIPTOR_PATH,
  );
  const productionQueuePath = path.resolve(
    options.productionQueuePath ?? DEFAULT_PRODUCTION_QUEUE_PATH,
  );
  const productionRegistryPath = path.resolve(
    options.productionRegistryPath ?? DEFAULT_PRODUCTION_REGISTRY_PATH,
  );
  const [
    releaseDescriptorBytes,
    productionQueueBytes,
    productionRegistryBytes,
  ] = await Promise.all([
    readFile(releaseDescriptorPath),
    readFile(productionQueuePath),
    readFile(productionRegistryPath),
  ]);
  const releaseDescriptor = JSON.parse(releaseDescriptorBytes.toString('utf8'));
  const productionQueue = JSON.parse(productionQueueBytes.toString('utf8'));
  const productionRegistry = JSON.parse(
    productionRegistryBytes.toString('utf8'),
  );
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
    bundleSha256: portableJsonTextSha256(bundleBytes),
    domains,
    evaluationResultEvidence,
    evaluationScopeReceipt,
    manifest,
    productionQueue,
    productionQueueSha256: bytesSha256(productionQueueBytes),
    productionRegistry,
    productionRegistrySha256: bytesSha256(productionRegistryBytes),
    procedureCatalog,
    questionCatalog,
    releaseDescriptor,
    releaseDescriptorSha256: bytesSha256(releaseDescriptorBytes),
    releaseEvidence,
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

function textSha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function validateBranchSignature(unit, scenarioById, label, errors) {
  const signatures = unit.branch_signature;
  if (!Array.isArray(signatures)) {
    errors.push(`${label}:branch_signature:array_required`);
    return {closed: false, invalid: ['array_required']};
  }
  if (signatures.length === 0) {
    errors.push(`${label}:branch_signature:non_empty_required`);
  }
  const invalid = [];
  const scenarioIds = [];
  for (const [index, signature] of signatures.entries()) {
    const signatureLabel = `${label}:branch_signature:${index}`;
    if (!isRecord(signature)) {
      errors.push(`${signatureLabel}:object_required`);
      invalid.push(`${index}:object_required`);
      continue;
    }
    const expectedKeys = [
      'decision_fact_sha256',
      'scenario_id',
      'when_false_sha256',
      'when_true_sha256',
    ];
    if (Object.keys(signature).sort().join(',') !== expectedKeys.join(',')) {
      errors.push(`${signatureLabel}:fields_invalid`);
    }
    scenarioIds.push(signature.scenario_id);
    const scenario = scenarioById.get(signature.scenario_id);
    if (!scenario) {
      errors.push(`${signatureLabel}:scenario_missing:${signature.scenario_id}`);
      invalid.push(`${signature.scenario_id}:missing`);
      continue;
    }
    for (const [field, scenarioField] of [
      ['decision_fact_sha256', 'decision_fact_ko'],
      ['when_true_sha256', 'when_true_ko'],
      ['when_false_sha256', 'when_false_ko'],
    ]) {
      if (!SHA256_PATTERN.test(signature[field] ?? '')) {
        errors.push(`${signatureLabel}:${field}:sha256_required`);
        invalid.push(`${signature.scenario_id}:${field}:invalid`);
        continue;
      }
      const actual = textSha256(scenario[scenarioField]);
      if (signature[field] !== actual) {
        errors.push(
          `${signatureLabel}:${field}:mismatch:${signature[field]}:${actual}`,
        );
        invalid.push(`${signature.scenario_id}:${field}:mismatch`);
      }
    }
  }
  for (const duplicate of duplicateValues(scenarioIds)) {
    errors.push(`${label}:branch_signature:duplicate_scenario:${duplicate}`);
  }
  const requiredScenarioIds = [...new Set(safeArray(unit.required_scenario_ids))]
    .sort();
  const signedScenarioIds = [...new Set(scenarioIds)].sort();
  if (canonicalJson(requiredScenarioIds) !== canonicalJson(signedScenarioIds)) {
    errors.push(`${label}:branch_signature:scenario_set_mismatch`);
    invalid.push('scenario_set_mismatch');
  }
  return {
    closed: signatures.length > 0 && invalid.length === 0,
    invalid,
  };
}

function trustedEvaluationResultReceipt(receipt, evaluationResultEvidence) {
  if (!isRecord(receipt) || typeof receipt.case_id !== 'string') return false;
  const trusted = TRUSTED_EVALUATION_RESULT_RECEIPTS.get(receipt.case_id);
  const evidence = evaluationResultEvidence?.get?.(receipt.case_id);
  return (
    trusted !== undefined &&
    canonicalJson(receipt) === canonicalJson(trusted) &&
    evidence?.resultSha256 === receipt.result_sha256 &&
    evidence?.reviewReceiptSha256 === receipt.review_receipt_sha256 &&
    evidence?.result?.schema === 'rulelink_legal_answer_eval_result_v1' &&
    evidence.result.case_id === receipt.case_id &&
    evidence.result.passed === true &&
    evidence?.reviewReceipt?.schema ===
      'rulelink_legal_answer_eval_review_receipt_v1' &&
    evidence.reviewReceipt.case_id === receipt.case_id &&
    evidence.reviewReceipt.result_sha256 === receipt.result_sha256 &&
    evidence.reviewReceipt.passed === true
  );
}

function evaluationScopeState(
  unit,
  evaluationScopeReceipt,
  evaluationResultEvidence,
) {
  const receiptCaseIds = new Set(safeArray(evaluationScopeReceipt?.case_ids));
  const declaredCaseIds = safeArray(unit.evaluation_case_ids);
  const missing = declaredCaseIds.filter((caseId) => !receiptCaseIds.has(caseId));
  const verifiedResultIds = new Set(
    safeArray(evaluationScopeReceipt?.verified_result_receipts)
      .filter((receipt) =>
        trustedEvaluationResultReceipt(receipt, evaluationResultEvidence),
      )
      .map((receipt) => receipt.case_id),
  );
  return {
    bound: declaredCaseIds.length === 0 || missing.length === 0,
    boundCaseCount: declaredCaseIds.length - missing.length,
    missing,
    verifiedResultCount: declaredCaseIds.filter((caseId) =>
      verifiedResultIds.has(caseId),
    ).length,
  };
}

function normalizedTemporalDate(value) {
  if (DATE_PATTERN.test(value ?? '')) return value;
  if (RFC3339_DATE_TIME_PATTERN.test(value ?? '')) return value.slice(0, 10);
  return null;
}

export function dateWithinPeriod(asOf, effectiveFrom, effectiveTo) {
  const asOfDate = normalizedTemporalDate(asOf);
  const effectiveFromDate = normalizedTemporalDate(effectiveFrom);
  const effectiveToDate = effectiveTo
    ? normalizedTemporalDate(effectiveTo)
    : null;
  if (!asOfDate || !effectiveFromDate || (effectiveTo && !effectiveToDate)) {
    return false;
  }
  return (
    asOfDate >= effectiveFromDate &&
    (!effectiveToDate || asOfDate < effectiveToDate)
  );
}

function authorityTemporalState(unit, bindingById, authorityReadingById) {
  const requiredSources = new Set(safeArray(unit.required_source_coordinate_ids));
  const requirementBySource = new Map(
    safeArray(unit.source_version_requirements).map((requirement) => [
      requirement?.coordinate_id,
      requirement,
    ]),
  );
  const matchingSources = new Set();
  const invalid = [];
  for (const bindingId of safeArray(unit.required_authority_binding_ids)) {
    const binding = bindingById.get(bindingId);
    const authority = authorityReadingById.get(
      binding?.to_authority_reading_unit_id,
    );
    if (!authority || !requiredSources.has(authority.source_coordinate_id)) {
      invalid.push(`${bindingId}:authority_missing`);
      continue;
    }
    if (
      authority.source_snapshot_id !==
      requirementBySource.get(authority.source_coordinate_id)?.source_snapshot_id
    ) {
      invalid.push(`${bindingId}:source_snapshot_mismatch`);
      continue;
    }
    const stateMatches = authority.time_state === unit.as_of_policy;
    const asOfDate = normalizedTemporalDate(unit.as_of);
    const effectiveFromDate = normalizedTemporalDate(authority.effective_from);
    const periodMatches =
      unit.as_of_policy === 'future_effective'
        ? Boolean(
            asOfDate &&
              effectiveFromDate &&
              asOfDate < effectiveFromDate,
          )
        : dateWithinPeriod(
            unit.as_of,
            authority.effective_from,
            authority.effective_to,
          );
    if (!stateMatches || !periodMatches) {
      invalid.push(
        `${bindingId}:time_mismatch:${unit.as_of_policy}:${unit.as_of}`,
      );
      continue;
    }
    matchingSources.add(authority.source_coordinate_id);
  }
  const missingSources = [...requiredSources].filter(
    (sourceId) => !matchingSources.has(sourceId),
  );
  for (const sourceId of missingSources) invalid.push(`${sourceId}:time_unbound`);
  return {
    verified:
      requiredSources.size > 0 &&
      missingSources.length === 0 &&
      invalid.length === 0,
    invalid,
  };
}

function runGit(repository, args, encoding = 'utf8') {
  return execFileSync(
    'git',
    [
      '-c',
      `safe.directory=${repository.replaceAll('\\', '/')}`,
      ...args,
    ],
    {
      cwd: repository,
      encoding,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
}

function commitParents(repository, commitSha) {
  return runGit(repository, ['rev-list', '--parents', '-n', '1', commitSha])
    .trim()
    .split(/\s+/);
}

function commitChangedFiles(repository, commitSha) {
  const output = runGit(repository, [
    'diff-tree',
    '--no-commit-id',
    '--name-only',
    '-r',
    commitSha,
  ]).trim();
  return output ? output.split(/\r?\n/).sort() : [];
}

function gitBlobSha256(repository, commitSha, filename) {
  return bytesSha256(
    runGit(repository, ['show', `${commitSha}:${filename}`], null),
  );
}

export function verifyReleaseGitProof(
  receipt,
  expected,
  repository = repositoryRoot,
) {
  const invalid = [];
  try {
    runGit(repository, ['cat-file', '-e', `${receipt.migration_commit_sha}^{commit}`]);
    runGit(repository, ['cat-file', '-e', `${receipt.evidence_commit_sha}^{commit}`]);
  } catch {
    return ['commit_not_found'];
  }
  const migrationParents = commitParents(
    repository,
    receipt.migration_commit_sha,
  );
  const evidenceParents = commitParents(repository, receipt.evidence_commit_sha);
  if (migrationParents.length !== 2) invalid.push('migration_commit_not_linear');
  if (
    evidenceParents.length !== 2 ||
    evidenceParents[1] !== receipt.migration_commit_sha
  ) {
    invalid.push('evidence_commit_not_direct_child');
  }
  const migrationFiles = commitChangedFiles(
    repository,
    receipt.migration_commit_sha,
  );
  const snapshotBundlePath =
    `artifacts/publication/snapshots/${receipt.snapshot_id}/bundle.json`;
  const migrationAllowed = (filename) =>
    filename === 'artifacts/publication/current/bundle.json' ||
    filename === snapshotBundlePath ||
    /^artifacts\/publication\/topics\/[^/]+\.json$/.test(filename);
  if (
    migrationFiles.length === 0 ||
    migrationFiles.some((filename) => !migrationAllowed(filename)) ||
    !migrationFiles.includes('artifacts/publication/current/bundle.json') ||
    !migrationFiles.includes(snapshotBundlePath) ||
    !migrationFiles.some((filename) =>
      /^artifacts\/publication\/topics\/[^/]+\.json$/.test(filename),
    )
  ) {
    invalid.push('migration_commit_scope_invalid');
  }
  const evidenceFiles = commitChangedFiles(
    repository,
    receipt.evidence_commit_sha,
  );
  if (
    canonicalJson(evidenceFiles) !==
    canonicalJson([
      'artifacts/publication/production-queue-registry.json',
      'artifacts/publication/production-queue.json',
    ])
  ) {
    invalid.push('evidence_commit_scope_invalid');
  }
  for (const [label, commitSha, filename, expectedSha256] of [
    [
      'publication_bundle',
      receipt.migration_commit_sha,
      'artifacts/publication/current/bundle.json',
      expected.publication_bundle_sha256,
    ],
    [
      'snapshot_bundle',
      receipt.migration_commit_sha,
      snapshotBundlePath,
      expected.publication_bundle_sha256,
    ],
    [
      'release_descriptor',
      receipt.evidence_commit_sha,
      'web/rulelink_public_next/deploy/release.json',
      expected.release_descriptor_sha256,
    ],
    [
      'production_queue',
      receipt.evidence_commit_sha,
      'artifacts/publication/production-queue.json',
      expected.production_queue_sha256,
    ],
    [
      'production_registry',
      receipt.evidence_commit_sha,
      'artifacts/publication/production-queue-registry.json',
      expected.production_registry_sha256,
    ],
  ]) {
    try {
      if (
        gitBlobSha256(repository, commitSha, filename) !== expectedSha256
      ) {
        invalid.push(`${label}_blob_mismatch`);
      }
    } catch {
      invalid.push(`${label}_blob_missing`);
    }
  }
  return invalid;
}

function releaseState(unit, documents) {
  const receipt = safeArray(documents.releaseEvidence?.releases).find(
    (item) => item?.coverage_unit_id === unit.coverage_unit_id,
  );
  if (!receipt) return {verified: false, invalid: []};
  const invalid = [];
  const expected = {
    snapshot_id: documents.bundle?.snapshot_id,
    publication_bundle_sha256: documents.bundleSha256,
    release_descriptor_sha256: documents.releaseDescriptorSha256,
    production_queue_sha256: documents.productionQueueSha256,
    production_registry_sha256: documents.productionRegistrySha256,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (receipt[key] !== value) {
      invalid.push(`${key}:mismatch`);
    }
  }
  if (documents.releaseDescriptor?.snapshot_id !== receipt.snapshot_id) {
    invalid.push('release_descriptor_snapshot_mismatch');
  }
  if (
    !/^[a-f0-9]{40}$/.test(receipt.migration_commit_sha ?? '') ||
    !/^[a-f0-9]{40}$/.test(receipt.evidence_commit_sha ?? '') ||
    receipt.migration_commit_sha === receipt.evidence_commit_sha
  ) {
    invalid.push('commit_chain_invalid');
  } else {
    invalid.push(
      ...verifyReleaseGitProof(receipt, expected).map(
        (reason) => `git:${reason}`,
      ),
    );
  }
  return {verified: invalid.length === 0, invalid};
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

function bindingCoverageState(
  unit,
  bindingById,
  authorityReadingById,
) {
  const contentIds = new Set(safeArray(unit.canonical_content_ids));
  const sourceIds = new Set(safeArray(unit.required_source_coordinate_ids));
  const bindingIds = safeArray(unit.required_authority_binding_ids);
  const invalid = [];
  for (const bindingId of bindingIds) {
    const binding = bindingById.get(bindingId);
    if (!binding) continue;
    if (
      binding.from_kind !== 'content' ||
      !contentIds.has(binding.from_id) ||
      binding.to_kind !== 'authority_reading_unit'
    ) {
      invalid.push(`${bindingId}:content_projection_mismatch`);
      continue;
    }
    const authority = authorityReadingById.get(
      binding.to_authority_reading_unit_id,
    );
    if (!authority || !sourceIds.has(authority.source_coordinate_id)) {
      invalid.push(`${bindingId}:source_projection_mismatch`);
    }
  }
  return {
    relevant: bindingIds.length > 0 && invalid.length === 0,
    invalid,
  };
}

function coverageObservation({
  authorityBindingIds,
  authorityReadingById,
  branchClosure,
  bindingById,
  contentById,
  contentIds,
  currentSnapshotMatches,
  evaluationResultEvidence,
  evaluationScopeReceipt,
  questionFamilyIds,
  procedureStageIds,
  release,
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
  const evaluationScope = evaluationScopeState(
    unit,
    evaluationScopeReceipt,
    evaluationResultEvidence,
  );
  const bindingCoverage = bindingCoverageState(
    unit,
    bindingById,
    authorityReadingById,
  );
  const temporal = authorityTemporalState(
    unit,
    bindingById,
    authorityReadingById,
  );
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
    requiredAuthorityBindingIds.every((id) => authorityBindingIds.has(id)) &&
    bindingCoverage.relevant;
  return {
    authority_level: l2 ? 'L2_locator' : l1 ? 'L1_coordinate' : 'L0_structure',
    branch_closed: branchClosure.closed,
    content_present_in_base_snapshot: Boolean(
      structured && currentSnapshotMatches,
    ),
    coverage_release_verified: release.verified,
    evaluation_cases_bound_count: evaluationScope.boundCaseCount,
    evaluation_cases_declared_count: evaluationCaseIds.length,
    evaluation_results_verified_count: evaluationScope.verifiedResultCount,
    experience_missing: experience.missing,
    experience_fields_complete: experience.ready,
    source_version_current: sourceVersion.current,
    structured: Boolean(structured),
    temporal_authority_verified: temporal.verified,
    target_gap:
      (unit.target_authority_level === 'L2_locator' ? !l2 : !l1) ||
      !experience.ready ||
      !branchClosure.closed ||
      !evaluationScope.bound ||
      !temporal.verified ||
      !release.verified,
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
    evaluationResultEvidence,
    evaluationScopeReceipt,
    manifest,
    productionQueue,
    productionQueueSha256,
    productionRegistry,
    productionRegistrySha256,
    procedureCatalog,
    questionCatalog,
    releaseDescriptor,
    releaseDescriptorSha256,
    releaseEvidence,
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
  if (
    typeof manifest?.evaluation_scope_receipt_file !== 'string' ||
    manifest.evaluation_scope_receipt_file.length === 0
  ) {
    errors.push('coverage_manifest_evaluation_scope_receipt_required');
  }
  if (
    typeof manifest?.release_evidence_file !== 'string' ||
    manifest.release_evidence_file.length === 0
  ) {
    errors.push('coverage_manifest_release_evidence_required');
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
  if (
    evaluationScopeReceipt?.schema !==
    'rulelink_legal_answer_eval_scope_vendor_receipt_v1'
  ) {
    errors.push('coverage_evaluation_scope_receipt_schema_invalid');
  }
  if (
    evaluationScopeReceipt?.evaluator_commit !== TRUSTED_EVALUATOR_COMMIT ||
    evaluationScopeReceipt?.scope_manifest_sha256 !==
      TRUSTED_EVALUATION_SCOPE_MANIFEST_SHA256
  ) {
    errors.push('coverage_evaluation_scope_receipt_identity_invalid');
  }
  validateUniqueStringArray(
    evaluationScopeReceipt?.case_ids,
    'coverage_evaluation_scope_receipt:case_ids',
    errors,
    {nonEmpty: true},
  );
  if (
    !Array.isArray(evaluationScopeReceipt?.case_ids) ||
    evaluationScopeReceipt.case_ids.length !== TRUSTED_EVALUATION_CASE_IDS.size ||
    evaluationScopeReceipt.case_ids.some(
      (caseId) => !TRUSTED_EVALUATION_CASE_IDS.has(caseId),
    )
  ) {
    errors.push('coverage_evaluation_scope_receipt:case_ids:trusted_set_mismatch');
  }
  if (!Array.isArray(evaluationScopeReceipt?.case_files)) {
    errors.push('coverage_evaluation_scope_receipt:case_files:array_required');
  } else {
    for (const [index, file] of evaluationScopeReceipt.case_files.entries()) {
      if (
        !isRecord(file) ||
        typeof file.path !== 'string' ||
        !TRUSTED_EVALUATION_CASE_FILE_SHA256.has(file.sha256)
      ) {
        errors.push(
          `coverage_evaluation_scope_receipt:case_files:${index}:invalid`,
        );
      }
    }
    const caseFileHashes = evaluationScopeReceipt.case_files.map(
      (file) => file?.sha256,
    );
    if (
      caseFileHashes.length !== TRUSTED_EVALUATION_CASE_FILE_SHA256.size ||
      new Set(caseFileHashes).size !== TRUSTED_EVALUATION_CASE_FILE_SHA256.size ||
      caseFileHashes.some(
        (sha256) => !TRUSTED_EVALUATION_CASE_FILE_SHA256.has(sha256),
      )
    ) {
      errors.push(
        'coverage_evaluation_scope_receipt:case_files:trusted_set_mismatch',
      );
    }
  }
  if (
    !isRecord(evaluationScopeReceipt?.gold_file) ||
    typeof evaluationScopeReceipt.gold_file.path !== 'string' ||
    evaluationScopeReceipt.gold_file.sha256 !==
      TRUSTED_EVALUATION_GOLD_SHA256
  ) {
    errors.push('coverage_evaluation_scope_receipt:gold_file:invalid');
  }
  if (
    !Array.isArray(evaluationScopeReceipt?.verified_result_receipts)
  ) {
    errors.push(
      'coverage_evaluation_scope_receipt:verified_result_receipts:array_required',
    );
  }
  if (
    releaseEvidence?.schema !==
    'rulelink_publication_coverage_release_evidence_v1' ||
    !Array.isArray(releaseEvidence?.releases)
  ) {
    errors.push('coverage_release_evidence_schema_invalid');
  }
  if (
    releaseDescriptor?.schema !== 'rulelink_public_release_v1' ||
    productionQueue?.schema === undefined ||
    productionRegistry?.schema === undefined ||
    !SHA256_PATTERN.test(releaseDescriptorSha256 ?? '') ||
    !SHA256_PATTERN.test(productionQueueSha256 ?? '') ||
    !SHA256_PATTERN.test(productionRegistrySha256 ?? '')
  ) {
    errors.push('coverage_release_inputs_invalid');
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
  const authorityReadingUnits = knowledge.authority_reading_units ?? [];
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
    'binding_id',
  );
  const bindingById = new Map(
    authorityBindings.map((binding) => [binding.binding_id, binding]),
  );
  const authorityReadingById = new Map(
    authorityReadingUnits.map((unit) => [
      unit.authority_reading_unit_id,
      unit,
    ]),
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
  const unitIds = new Set(units.map((unit) => unit.coverage_unit_id));
  for (const duplicate of duplicateValues(
    safeArray(releaseEvidence?.releases).map(
      (release) => release?.coverage_unit_id,
    ),
  )) {
    errors.push(`coverage_release_evidence_duplicate:${duplicate}`);
  }
  for (const release of safeArray(releaseEvidence?.releases)) {
    if (!isRecord(release) || !unitIds.has(release.coverage_unit_id)) {
      errors.push(
        `coverage_release_evidence_unknown_unit:${
          release?.coverage_unit_id ?? 'missing'
        }`,
      );
    }
  }
  const receiptCaseIds = new Set(safeArray(evaluationScopeReceipt?.case_ids));
  for (const duplicate of duplicateValues(
    safeArray(evaluationScopeReceipt?.verified_result_receipts).map(
      (receipt) => receipt?.case_id,
    ),
  )) {
    errors.push(`coverage_evaluation_result_receipt_duplicate:${duplicate}`);
  }
  for (const [index, receipt] of safeArray(
    evaluationScopeReceipt?.verified_result_receipts,
  ).entries()) {
    if (
      !isRecord(receipt) ||
      !receiptCaseIds.has(receipt.case_id) ||
      typeof receipt.result_path !== 'string' ||
      typeof receipt.review_receipt_path !== 'string' ||
      !SHA256_PATTERN.test(receipt.result_sha256 ?? '') ||
      !SHA256_PATTERN.test(receipt.review_receipt_sha256 ?? '') ||
      !trustedEvaluationResultReceipt(receipt, evaluationResultEvidence)
    ) {
      errors.push(`coverage_evaluation_result_receipt_invalid:${index}`);
    }
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
    if (!DATE_PATTERN.test(unit.as_of ?? '')) {
      errors.push(`${label}:as_of_invalid`);
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
    const branchClosure = validateBranchSignature(
      unit,
      scenarioById,
      label,
      errors,
    );
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
    const evaluationScope = evaluationScopeState(
      unit,
      evaluationScopeReceipt,
      evaluationResultEvidence,
    );
    for (const caseId of evaluationScope.missing) {
      errors.push(`${label}:evaluation_case_not_in_scope_receipt:${caseId}`);
    }
    for (const invalid of bindingCoverageState(
      unit,
      bindingById,
      authorityReadingById,
    ).invalid) {
      errors.push(`${label}:authority_binding_not_relevant:${invalid}`);
    }
    const release = releaseState(unit, documents);
    for (const invalid of release.invalid) {
      errors.push(`${label}:release_evidence_invalid:${invalid}`);
    }

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
        authorityReadingById,
        branchClosure,
        bindingById,
        contentById,
        contentIds,
        currentSnapshotMatches:
          bundle.snapshot_id === manifest.base_snapshot_id &&
          bundleSha256 === manifest.base_bundle_sha256,
        evaluationResultEvidence,
        evaluationScopeReceipt,
        procedureStageIds,
        questionFamilyIds,
        ruleIds,
        scenarioIds,
        release,
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
      evaluationScopeReceipt,
      manifest,
      procedureCatalog,
      questionCatalog,
      releaseEvidence,
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
      bound_evaluation_cases: 0,
      branch_closed_coverage_units: 0,
      coverage_units: 0,
      declared_evaluation_cases: 0,
      content_present_in_base_snapshot: 0,
      experience_fields_complete_coverage_units: 0,
      invalidated_coverage_units: 0,
      released_coverage_units: 0,
      target_gap: 0,
      temporal_authority_verified_coverage_units: 0,
      topic_id: observation.topic_id,
      verified_evaluation_results: 0,
    };
    current.coverage_units += 1;
    current.declared_evaluation_cases +=
      observation.evaluation_cases_declared_count;
    current.bound_evaluation_cases += observation.evaluation_cases_bound_count;
    current.verified_evaluation_results +=
      observation.evaluation_results_verified_count;
    current.branch_closed_coverage_units += observation.branch_closed ? 1 : 0;
    current.content_present_in_base_snapshot +=
      observation.content_present_in_base_snapshot ? 1 : 0;
    current.experience_fields_complete_coverage_units +=
      observation.experience_fields_complete ? 1 : 0;
    current.invalidated_coverage_units += observation.source_version_current
      ? 0
      : 1;
    current.released_coverage_units += observation.coverage_release_verified
      ? 1
      : 0;
    current.target_gap += observation.target_gap ? 1 : 0;
    current.temporal_authority_verified_coverage_units +=
      observation.temporal_authority_verified ? 1 : 0;
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
    bound_evaluation_cases: 0,
    branch_closed_coverage_units: 0,
    coverage_units: validation.observations.length,
    content_present_in_base_snapshot: 0,
    declared_evaluation_cases: 0,
    experience_fields_complete_coverage_units: 0,
    invalidated_coverage_units: 0,
    released_coverage_units: 0,
    target_gap: 0,
    temporal_authority_verified_coverage_units: 0,
    verified_evaluation_results: 0,
  };
  for (const observation of validation.observations) {
    total.declared_evaluation_cases +=
      observation.evaluation_cases_declared_count;
    total.bound_evaluation_cases += observation.evaluation_cases_bound_count;
    total.verified_evaluation_results +=
      observation.evaluation_results_verified_count;
    total.branch_closed_coverage_units += observation.branch_closed ? 1 : 0;
    total.content_present_in_base_snapshot +=
      observation.content_present_in_base_snapshot ? 1 : 0;
    total.experience_fields_complete_coverage_units +=
      observation.experience_fields_complete ? 1 : 0;
    total.invalidated_coverage_units += observation.source_version_current
      ? 0
      : 1;
    total.released_coverage_units += observation.coverage_release_verified
      ? 1
      : 0;
    total.target_gap += observation.target_gap ? 1 : 0;
    total.temporal_authority_verified_coverage_units +=
      observation.temporal_authority_verified ? 1 : 0;
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
      .filter((observation) => !observation.experience_fields_complete)
      .map((observation) => ({
        coverage_unit_id: observation.coverage_unit_id,
        missing: observation.experience_missing,
      })),
    honesty: {
      bound_evaluation_cases_are_not_verified_results: true,
      content_presence_is_not_field_completeness: true,
      field_completeness_is_not_semantic_answer_verification: true,
      l1_and_l2_are_reported_separately: true,
      released_state_is_derived_not_authored: true,
      temporal_authority_is_separate_and_fail_closed: true,
      source_versions_are_pinned: true,
    },
    invalidations: validation.invalidations,
  };
}
