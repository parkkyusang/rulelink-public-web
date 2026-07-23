import {createHash} from 'node:crypto';
import path from 'node:path';

const SHA256 = /^[0-9a-f]{64}$/u;
const PREFIXED_SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SNAPSHOT_SHA256 = /^snapshot:[0-9a-f]{64}$/u;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const YYYYMMDD = /^\d{8}$/u;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export const AUTHORITY_EVIDENCE_VERIFICATION_CONTRACT =
  'rulelink_authority_evidence_verification_v2';
export const AUTHORITY_EVIDENCE_SOURCE_REPOSITORY = 'parkkyusang/liale-rulelink-ir';
export const AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY =
  'data/validation_reports/authority_024';
export const AUTHORITY_EVIDENCE_SOURCE_FILENAMES = Object.freeze({
  db: 'authority-db-regenerated.json',
  citation: 'authority-citation-audit-approved.json',
  wave1: 'wave1_exact_table.json',
  wave2: 'wave2_exact_table.json',
  citationAudit: 'citation_full_audit.json',
});
export const AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS = Object.freeze(
  Object.values(AUTHORITY_EVIDENCE_SOURCE_FILENAMES).map(
    filename => `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${filename}`,
  ),
);

const DB_SCHEMA = 'rulelink_authority_db_regeneration_evidence_v1';
const CITATION_SCHEMA = 'rulelink_authority_citation_audit_evidence_v1';
const EXACT_TABLE_SCHEMA = 'rulelink_authority_wave_exact_table_v1';
const FULL_CITATION_AUDIT_SCHEMA = 'rulelink_authority_citation_full_audit_v2';
const PRODUCER_CONTRACT = 'rulelink_authority_public_evidence_contract_v1';
export const AUTHORITY_EVIDENCE_PRODUCER_CONTRACT_SHA256 =
  'a6c66ed4f7c8372e6fe3a0c44872512e27e4da8fd1709531a6f899b7aeb39ee0';

const TARGET_INVENTORY_STATUS_VALUES = Object.freeze([
  'resolved_target_verified',
  'resolved_target_inventory_mismatch',
  'unresolved_scope',
  'unresolved_range',
  'delegated_unresolved',
  'target_missing',
  'target_unit_missing',
]);
const ARTICLE_25_RANGE_ENDPOINT_DUPLICATE_RULE_V1 = Object.freeze({
  rule_id: 'litigation_promotion_article_25_range_endpoint_duplicate_v1',
  source_article_key: 'litigation_promotion_special:0025',
  excluded_reference_scopes: Object.freeze(['article_range', 'chapter', 'chapter_range']),
  target_law_key: 'sexual_violence_punishment',
  prohibited_exact_article_numbers: Object.freeze(['0003', '0009', '0010']),
  prohibited_trigger_article_no: '0014',
  prohibited_trigger_text_without_spaces: '제14조',
});

const COUNT_KEYS = Object.freeze([
  'article_count',
  'source_authority_unit_count',
  'citation_count',
  'source_version_bridge_count',
  'authority_reading_unit_count',
]);
const EXPECTED_COUNTS = Object.freeze({
  article_count: 21,
  source_authority_unit_count: 110,
  citation_count: 63,
  source_version_bridge_count: 21,
  authority_reading_unit_count: 21,
});
const EXPECTED_WAVE_COUNTS = Object.freeze({
  wave1: Object.freeze({
    article_count: 5,
    source_authority_unit_count: 45,
    citation_count: 35,
    source_version_bridge_count: 5,
    authority_reading_unit_count: 5,
  }),
  wave2: Object.freeze({
    article_count: 16,
    source_authority_unit_count: 65,
    citation_count: 28,
    source_version_bridge_count: 16,
    authority_reading_unit_count: 16,
  }),
});

export const AUTHORITY_EVIDENCE_ARTICLE_CONTRACT = Object.freeze([
  ['wave1', 'litigation_promotion_special:0025', 'src_litigation_promotion_special_0025', 11, 26],
  ['wave1', 'litigation_promotion_special:0026', 'src_litigation_promotion_special_0026', 15, 1],
  ['wave1', 'litigation_promotion_special:0031', 'src_litigation_promotion_special_0031', 6, 5],
  ['wave1', 'litigation_promotion_special:0032', 'src_litigation_promotion_special_0032', 8, 2],
  ['wave1', 'litigation_promotion_special:0034', 'src_litigation_promotion_special_0034', 5, 1],
  ['wave2', 'civil_act:0387', 'src_civil_act_0387', 3, 0],
  ['wave2', 'civil_act:0397', 'src_civil_act_0397', 3, 1],
  ['wave2', 'civil_act:0162', 'src_civil_act_0162', 3, 0],
  ['wave2', 'civil_act:0174', 'src_civil_act_0174', 1, 0],
  ['wave2', 'civil_act:0165', 'src_civil_act_0165', 4, 1],
  ['wave2', 'civil_act:0406', 'src_civil_act_0406', 3, 1],
  ['wave2', 'civil_procedure:0462', 'src_civil_procedure_0462', 1, 0],
  ['wave2', 'civil_procedure:0470', 'src_civil_procedure_0470', 3, 1],
  ['wave2', 'civil_procedure:0474', 'src_civil_procedure_0474', 1, 0],
  ['wave2', 'civil_execution:0056', 'src_civil_execution_0056', 7, 0],
  ['wave2', 'civil_execution:0061', 'src_civil_execution_0061', 3, 3],
  ['wave2', 'civil_execution:0223', 'src_civil_execution_0223', 1, 0],
  ['wave2', 'civil_execution:0229', 'src_civil_execution_0229', 9, 6],
  ['wave2', 'civil_execution:0246', 'src_civil_execution_0246', 14, 9],
  ['wave2', 'civil_execution:0246_02', 'src_civil_execution_0246_02', 6, 5],
  ['wave2', 'civil_execution:0276', 'src_civil_execution_0276', 3, 1],
].map(([wave, articleKey, sourceId, sourceAuthorityUnitCount, citationCount]) =>
  Object.freeze({wave, articleKey, sourceId, sourceAuthorityUnitCount, citationCount})));

const EXPECTED_ACTIVE_INPUT_PATHS = Object.freeze([
  'data/db/law_sources.sqlite',
  'data/precedent_attachments/all_source_graph_merged.sqlite',
  'data/source_maintenance/source_timeline.sqlite',
]);

const EXPECTED_ALLOWED_EMPTY_UNIT = Object.freeze({
  source_unit_id: 'unit:civil_execution:0056:article:p1',
  content_role: 'structural_container',
  text_ko: '',
  text_hash:
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
});

const EXPECTED_CHECKS = Object.freeze({
  wrong_litigation_promotion_article_304_count: 0,
  article_25_range_endpoint_duplicate_count: 0,
  duplicate_edge_id_count: 0,
  empty_text_unit_count: 1,
  invalid_empty_text_unit_count: 0,
  target_missing_or_unit_missing_count: 0,
  target_inventory_mismatch_count: 0,
  invalid_active_edge_count: 0,
});

const DB_TOP_KEYS = Object.freeze([
  'schema',
  'release_id',
  'evidence_status',
  'generated_at',
  'source_repository',
  'provenance',
  'source_ci_attestation',
  'upstream',
  'approval_gates',
  'active_inputs',
  'waves',
  'counts',
  'articles',
  'integrity',
  'active_db_verification',
]);
const CITATION_TOP_KEYS = Object.freeze([
  'schema',
  'release_id',
  'evidence_status',
  'generated_at',
  'source_repository',
  'provenance',
  'source_ci_attestation',
  'authority_db_regeneration_evidence',
  'wave_exact_tables',
  'citation_full_audit',
  'counts',
  'checks',
  'allowed_empty_units',
  'regression',
  'approval',
  'passed',
]);
const ARTICLE_KEYS = Object.freeze([
  'wave',
  'article_key',
  'source_id',
  'source_snapshot_id',
  'public_source_snapshot_id',
  'timeline_snapshot_id',
  'source_version_key',
  'source_hash',
  'timeline_normalized_hash',
  'effective_date',
  'timeline_official_effective_date',
  'valid_from',
  'valid_to',
  'is_current',
  'official_url',
  'bridge_status',
  'source_authority_unit_count',
  'citation_count',
  'broken_count',
]);
const EXACT_ARTICLE_KEYS = Object.freeze([
  'wave',
  'article_key',
  'source_id',
  'public_source_snapshot_id',
  'timeline_snapshot_id',
  'source_version_key',
  'source_hash',
  'timeline_normalized_hash',
  'effective_date',
  'timeline_official_effective_date',
  'valid_from',
  'valid_to',
  'is_current',
  'official_url',
  'official_url_scope',
  'bridge_status',
  'unit_count',
  'citation_count',
  'active_verified_citation_count',
  'unresolved_range_count',
  'unresolved_scope_count',
  'target_missing_count',
  'target_unit_missing_count',
]);
const EXACT_UNIT_KEYS = Object.freeze([
  'wave',
  'article_key',
  'source_unit_id',
  'parent_unit_id',
  'unit_type',
  'content_role',
  'ordinal',
  'source_order',
  'locator',
  'locator_text',
  'route',
  'logical_group',
  'text_ko',
  'text_hash',
]);
const EXACT_CITATION_KEYS = Object.freeze([
  'wave',
  'article_key',
  'edge_id',
  'source_unit_id',
  'source_anchor_id',
  'source_locator',
  'route',
  'trigger_text',
  'target_article_key',
  'target_law_key',
  'target_article_no',
  'target_paragraph_no',
  'target_item_no',
  'target_subitem_no',
  'target_anchor_id',
  'target_reference_scope',
  'target_range_start',
  'target_range_end',
  'target_exclusions',
  'relation_type',
  'follow_policy',
  'resolution_status',
  'activation_status',
  'resolution_method',
]);
const TARGET_INVENTORY_KEYS = Object.freeze([
  'edge_id',
  'source_article_key',
  'resolution_status',
  'activation_status',
  'target_article_key',
  'target_anchor_id',
  'target_requirement',
  'target_article_exists',
  'target_anchor_exists',
  'target_current_verified',
  'inventory_status',
  'verification_basis',
]);

export const AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1 = Object.freeze({
  contract: PRODUCER_CONTRACT,
  release_id: '024',
  schemas: Object.freeze({db: DB_SCHEMA, citation: CITATION_SCHEMA}),
  filenames: Object.freeze({
    candidate_db: 'authority-db-regenerated.preview.json',
    candidate_citation: 'authority-citation-audit-approved.preview.json',
    approved_db: AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    approved_citation: AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation,
  }),
  approved_repository_paths: AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS,
  producer_contract: Object.freeze({
    path: 'tests/fixtures/authority_public_evidence_contract_v1.json',
    hash_algorithm: 'sha256',
  }),
  source_ci_attestation: Object.freeze({
    contract: 'rulelink_authority_024_source_ci_attestation_v1',
    check_name: 'rulelink-authority-024-evidence-attestation',
    workflow_path: '.github/workflows/authority-024-evidence-attestation.yml',
    workflow_sha256: '682f761c464a414c4109cd3937d0757f295b6912d6b3923980a63a1e5c629ce3',
    head_sha_binding: 'evidence_pull_request_head',
    required_status: 'completed',
    required_conclusion: 'success',
    required_app_slug: 'github-actions',
    details_url_verification: 'actions_job_runner_labels_exact',
    runner_labels: Object.freeze([
      'self-hosted',
      'Windows',
      'X64',
      'rulelink-source-maintenance',
    ]),
    allowed_repository_paths: AUTHORITY_EVIDENCE_REQUIRED_REPOSITORY_PATHS,
    verification_mode: 'rebuild_candidate_verify_active_inputs_and_compare_exact_five',
    required_ancestor_fields: Object.freeze([
      'upstream.pr4_sha',
      'upstream.pr3_p2_sha',
      'provenance.producer_source_commit_sha',
    ]),
  }),
  enums: Object.freeze({
    evidence_status: Object.freeze(['candidate_unapproved', 'approved']),
    active_db_verification_status: Object.freeze(['not_regenerated', 'verified_regenerated']),
    active_db_integrity_check_mode: Object.freeze([
      'skipped_missing_required_tables',
      'quick_check',
      'integrity_check',
    ]),
    approval_owner: Object.freeze(['source_maintenance']),
    generator_source_state: Object.freeze(['working_tree_uncommitted', 'committed']),
  }),
  top_level_keys: Object.freeze({
    db: DB_TOP_KEYS,
    citation: CITATION_TOP_KEYS,
  }),
  nested_keys: Object.freeze({
    upstream: Object.freeze(['pr4_sha', 'pr3_p2_sha']),
    provenance: Object.freeze([
      'generator_source_commit_sha',
      'generator_source_state',
      'producer_source_commit_sha',
      'producer_contract_path',
      'producer_contract_sha256',
      'regeneration_run_id',
      'recommended_repository_directory',
    ]),
    source_ci_attestation: Object.freeze([
      'contract',
      'check_name',
      'workflow_path',
      'workflow_sha256',
      'head_sha_binding',
      'required_status',
      'required_conclusion',
      'required_app_slug',
      'details_url_verification',
      'runner_labels',
      'allowed_repository_paths',
      'verification_mode',
      'required_ancestor_fields',
    ]),
    approval_gates: Object.freeze([
      'pr4_integrated',
      'pr3_p2_integrated',
      'active_db_regenerated',
      'final_approval',
      'all_satisfied',
    ]),
    active_input: Object.freeze(['path', 'sha256']),
    wave: Object.freeze(['wave', 'exact_table_path', 'exact_table_sha256', 'counts']),
    counts: COUNT_KEYS,
    article: ARTICLE_KEYS,
    integrity: Object.freeze([
      'sqlite_integrity_failure_count',
      'foreign_key_failure_count',
      'source_version_bridge_failure_count',
      'target_integrity_failure_count',
      'article_coordinate_failure_count',
      'broken_count',
    ]),
    active_db_verification: Object.freeze([
      'status',
      'verified',
      'integrity_check_mode',
      'counts',
      'integrity',
      'comparison',
      'failure_codes',
    ]),
    active_db_integrity: Object.freeze([
      'sqlite_integrity_failure_count',
      'foreign_key_failure_count',
      'broken_count',
    ]),
    active_db_comparison: Object.freeze([
      'article_mismatch_count',
      'unit_mismatch_count',
      'citation_mismatch_count',
      'bridge_mismatch_count',
      'broken_count',
    ]),
    linked_evidence: Object.freeze(['path', 'sha256']),
    allowed_empty_unit: Object.freeze([
      'source_unit_id',
      'content_role',
      'text_ko',
      'text_hash',
    ]),
    regression: Object.freeze(['total', 'passed', 'failure_count']),
    approval: Object.freeze(['owner', 'status', 'approved']),
  }),
});

function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map(
    key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
  ).join(',')}}`;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label}은 객체여야 합니다.`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    errors.push(`${label} 필드가 생산자 v1 정본과 다릅니다: ${actual.join(', ')}`);
    return false;
  }
  return true;
}

function validateZeroCounts(value, keys, label, errors) {
  if (!exactKeys(value, keys, label, errors)) return;
  for (const key of keys) {
    if (value[key] !== 0) errors.push(`${label}.${key}는 0이어야 합니다: ${value[key]}`);
  }
}

function validateCounts(value, expected, label, errors) {
  if (!exactKeys(value, COUNT_KEYS, label, errors)) return;
  for (const key of COUNT_KEYS) {
    if (value[key] !== expected[key]) {
      errors.push(`${label}.${key}는 ${expected[key]}여야 합니다: ${value[key]}`);
    }
  }
}

function validateExpectedValues(value, expected, label, errors) {
  if (!exactKeys(value, Object.keys(expected), label, errors)) return;
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) {
      errors.push(`${label}.${key}는 ${expectedValue}여야 합니다: ${value[key]}`);
    }
  }
}

function validIsoDate(value) {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function validLawUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && ['law.go.kr', 'www.law.go.kr'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function parseJson(label, payload) {
  try {
    return JSON.parse(Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload));
  } catch (error) {
    throw new Error(`${label}이 유효한 UTF-8 JSON이 아닙니다: ${error.message}`);
  }
}

function validateProvenance(value, label, errors) {
  const keys = AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.provenance;
  if (!exactKeys(value, keys, `${label}.provenance`, errors)) return;
  if (!COMMIT_SHA.test(value.generator_source_commit_sha || '')) {
    errors.push(`${label}.provenance.generator_source_commit_sha는 40자리 commit SHA여야 합니다.`);
  }
  if (!COMMIT_SHA.test(value.producer_source_commit_sha || '')) {
    errors.push(`${label}.provenance.producer_source_commit_sha는 40자리 commit SHA여야 합니다.`);
  }
  if (
    value.producer_contract_path !==
    AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.producer_contract.path
  ) {
    errors.push(`${label}.provenance.producer_contract_path가 생산자 계약 경로와 다릅니다.`);
  }
  if (value.producer_contract_sha256 !== AUTHORITY_EVIDENCE_PRODUCER_CONTRACT_SHA256) {
    errors.push(`${label}.provenance.producer_contract_sha256이 vendored 생산자 계약과 다릅니다.`);
  }
  if (value.generator_source_state !== 'committed') {
    errors.push(`${label}.provenance.generator_source_state는 approved에서 committed여야 합니다.`);
  }
  if (!RUN_ID.test(value.regeneration_run_id || '')) {
    errors.push(`${label}.provenance.regeneration_run_id가 안전한 실행 식별자가 아닙니다.`);
  }
  if (value.recommended_repository_directory !== AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY) {
    errors.push(`${label}.provenance.recommended_repository_directory가 정본 경로와 다릅니다.`);
  }
}

function validateSourceCiAttestation(value, label, errors) {
  const expected = AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.source_ci_attestation;
  if (!exactKeys(
    value,
    AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.source_ci_attestation,
    `${label}.source_ci_attestation`,
    errors,
  )) return;
  if (canonicalJson(value) !== canonicalJson(expected)) {
    errors.push(`${label}.source_ci_attestation이 producer v1 정본과 다릅니다.`);
  }
}

function validateLinkedEvidence(value, expectedFilename, label, errors) {
  if (!exactKeys(
    value,
    AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.linked_evidence,
    label,
    errors,
  )) return;
  if (value.path !== expectedFilename || !SAFE_FILENAME.test(value.path || '')) {
    errors.push(`${label}.path는 같은 디렉터리의 ${expectedFilename}여야 합니다.`);
  }
  if (!SHA256.test(value.sha256 || '')) errors.push(`${label}.sha256이 유효하지 않습니다.`);
}

function validateArticleEvidence(article, expected, label, errors) {
  if (!exactKeys(article, ARTICLE_KEYS, label, errors)) return;
  if (
    article.wave !== expected.wave ||
    article.article_key !== expected.articleKey ||
    article.source_id !== expected.sourceId
  ) {
    errors.push(`${label}의 wave/article/source 순서가 024 정본과 다릅니다.`);
  }
  if (
    !SNAPSHOT_SHA256.test(article.source_snapshot_id || '') ||
    !SNAPSHOT_SHA256.test(article.public_source_snapshot_id || '') ||
    article.source_snapshot_id !== article.public_source_snapshot_id
  ) {
    errors.push(`${label}의 source snapshot 결박이 올바르지 않습니다.`);
  }
  if (!/^snapshot:[0-9a-f]{32}$/u.test(article.timeline_snapshot_id || '')) {
    errors.push(`${label}.timeline_snapshot_id는 활성 Source Timeline 32자리 snapshot이어야 합니다.`);
  }
  for (const key of ['source_version_key', 'source_hash', 'timeline_normalized_hash']) {
    if (!PREFIXED_SHA256.test(article[key] || '')) {
      errors.push(`${label}.${key}는 sha256: 형식이어야 합니다.`);
    }
  }
  if (article.source_hash !== article.timeline_normalized_hash) {
    errors.push(`${label}의 source hash와 timeline normalized hash가 다릅니다.`);
  }
  for (const key of ['effective_date', 'timeline_official_effective_date', 'valid_from']) {
    if (!YYYYMMDD.test(article[key] || '')) errors.push(`${label}.${key}는 YYYYMMDD여야 합니다.`);
  }
  if (
    article.effective_date !== article.timeline_official_effective_date ||
    article.effective_date !== article.valid_from
  ) {
    errors.push(`${label}의 효력일·timeline 효력일·valid_from이 다릅니다.`);
  }
  if (article.valid_to !== '' || article.is_current !== true) {
    errors.push(`${label}은 종료일 없는 현행 정본이어야 합니다.`);
  }
  if (!validLawUrl(article.official_url)) errors.push(`${label}.official_url이 공식 HTTPS URL이 아닙니다.`);
  if (article.bridge_status !== 'verified_same_official_text') {
    errors.push(`${label}.bridge_status가 검증 상태가 아닙니다.`);
  }
  if (article.source_authority_unit_count !== expected.sourceAuthorityUnitCount) {
    errors.push(`${label}.source_authority_unit_count가 정본과 다릅니다.`);
  }
  if (article.citation_count !== expected.citationCount) {
    errors.push(`${label}.citation_count가 정본과 다릅니다.`);
  }
  if (article.broken_count !== 0) errors.push(`${label}.broken_count는 0이어야 합니다.`);
  if (article.article_key === 'civil_execution:0246_02' && article.valid_from !== '20260201') {
    errors.push('민사집행법 제246조의2 valid_from은 20260201이어야 합니다.');
  }
}

export function validateAuthorityDbRegenerationEvidence(value, context = {}) {
  const errors = [];
  if (!exactKeys(value, DB_TOP_KEYS, 'authority DB 증거', errors)) return errors;
  if (value.schema !== DB_SCHEMA) errors.push(`authority DB schema가 다릅니다: ${value.schema}`);
  if (value.release_id !== '024') errors.push(`authority DB release_id는 024여야 합니다.`);
  if (value.evidence_status !== 'approved') errors.push('authority DB 증거는 approved여야 합니다.');
  if (!validIsoDate(value.generated_at)) errors.push('authority DB generated_at이 유효하지 않습니다.');
  if (value.source_repository !== AUTHORITY_EVIDENCE_SOURCE_REPOSITORY) {
    errors.push('authority DB source_repository가 정본과 다릅니다.');
  }
  validateProvenance(value.provenance, 'authority DB', errors);
  validateSourceCiAttestation(value.source_ci_attestation, 'authority DB', errors);

  if (exactKeys(value.upstream, ['pr4_sha', 'pr3_p2_sha'], 'authority DB upstream', errors)) {
    for (const [key, gateId] of [
      ['pr4_sha', 'source-maintenance.db-pr-4'],
      ['pr3_p2_sha', 'source-maintenance.db-pr-3-p2'],
    ]) {
      if (!COMMIT_SHA.test(value.upstream[key] || '')) errors.push(`authority DB upstream.${key}가 유효하지 않습니다.`);
      const expectedHead = context.upstreamPrHeads?.[gateId];
      if (expectedHead && value.upstream[key] !== expectedHead) {
        errors.push(`authority DB upstream.${key}가 queue 선행 PR head와 다릅니다.`);
      }
    }
  }

  if (exactKeys(
    value.approval_gates,
    AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.approval_gates,
    'authority DB approval_gates',
    errors,
  )) {
    for (const key of AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.approval_gates) {
      if (value.approval_gates[key] !== true) {
        errors.push(`authority DB approval_gates.${key}는 true여야 합니다.`);
      }
    }
  }

  if (!Array.isArray(value.active_inputs) || value.active_inputs.length !== 3) {
    errors.push('authority DB active_inputs는 정확히 3개여야 합니다.');
  } else {
    value.active_inputs.forEach((input, index) => {
      const label = `authority DB active_inputs[${index}]`;
      if (!exactKeys(input, ['path', 'sha256'], label, errors)) return;
      if (input.path !== EXPECTED_ACTIVE_INPUT_PATHS[index]) {
        errors.push(`${label}.path가 활성 입력 정본과 다릅니다.`);
      }
      if (!SHA256.test(input.sha256 || '')) errors.push(`${label}.sha256이 유효하지 않습니다.`);
    });
  }

  if (!Array.isArray(value.waves) || value.waves.length !== 2) {
    errors.push('authority DB waves는 wave1·wave2 두 개여야 합니다.');
  } else {
    value.waves.forEach((wave, index) => {
      const expectedWave = index === 0 ? 'wave1' : 'wave2';
      const expectedFilename = AUTHORITY_EVIDENCE_SOURCE_FILENAMES[expectedWave];
      const label = `authority DB waves[${index}]`;
      if (!exactKeys(wave, ['wave', 'exact_table_path', 'exact_table_sha256', 'counts'], label, errors)) return;
      if (wave.wave !== expectedWave || wave.exact_table_path !== expectedFilename) {
        errors.push(`${label}의 wave 또는 exact_table_path가 정본과 다릅니다.`);
      }
      if (!SHA256.test(wave.exact_table_sha256 || '')) errors.push(`${label}.exact_table_sha256이 유효하지 않습니다.`);
      validateCounts(wave.counts, EXPECTED_WAVE_COUNTS[expectedWave], `${label}.counts`, errors);
    });
  }
  validateCounts(value.counts, EXPECTED_COUNTS, 'authority DB counts', errors);

  if (!Array.isArray(value.articles) || value.articles.length !== AUTHORITY_EVIDENCE_ARTICLE_CONTRACT.length) {
    errors.push('authority DB articles는 024 정본 21개여야 합니다.');
  } else {
    value.articles.forEach((article, index) =>
      validateArticleEvidence(article, AUTHORITY_EVIDENCE_ARTICLE_CONTRACT[index], `authority DB articles[${index}]`, errors));
  }

  validateZeroCounts(
    value.integrity,
    AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.integrity,
    'authority DB integrity',
    errors,
  );

  const verification = value.active_db_verification;
  if (exactKeys(
    verification,
    AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.active_db_verification,
    'authority DB active_db_verification',
    errors,
  )) {
    if (verification.status !== 'verified_regenerated' || verification.verified !== true) {
      errors.push('authority DB 활성 병합 DB가 verified_regenerated 상태가 아닙니다.');
    }
    if (verification.integrity_check_mode !== 'integrity_check') {
      errors.push('authority DB 승인본은 전체 SQLite integrity_check를 통과해야 합니다.');
    }
    validateCounts(verification.counts, EXPECTED_COUNTS, 'authority DB active_db_verification.counts', errors);
    validateZeroCounts(
      verification.integrity,
      AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.active_db_integrity,
      'authority DB active_db_verification.integrity',
      errors,
    );
    validateZeroCounts(
      verification.comparison,
      AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.active_db_comparison,
      'authority DB active_db_verification.comparison',
      errors,
    );
    if (!Array.isArray(verification.failure_codes) || verification.failure_codes.length !== 0) {
      errors.push('authority DB active_db_verification.failure_codes는 비어 있어야 합니다.');
    }
  }
  return errors;
}

export function validateAuthorityCitationAuditEvidence(value, dbEvidence = null) {
  const errors = [];
  if (!exactKeys(value, CITATION_TOP_KEYS, 'authority citation 증거', errors)) return errors;
  if (value.schema !== CITATION_SCHEMA) errors.push(`authority citation schema가 다릅니다: ${value.schema}`);
  if (value.release_id !== '024') errors.push('authority citation release_id는 024여야 합니다.');
  if (value.evidence_status !== 'approved') errors.push('authority citation 증거는 approved여야 합니다.');
  if (!validIsoDate(value.generated_at)) errors.push('authority citation generated_at이 유효하지 않습니다.');
  if (value.source_repository !== AUTHORITY_EVIDENCE_SOURCE_REPOSITORY) {
    errors.push('authority citation source_repository가 정본과 다릅니다.');
  }
  validateProvenance(value.provenance, 'authority citation', errors);
  validateSourceCiAttestation(value.source_ci_attestation, 'authority citation', errors);
  if (dbEvidence && canonicalJson(value.provenance) !== canonicalJson(dbEvidence.provenance)) {
    errors.push('authority citation provenance가 DB 재생성 증거와 다릅니다.');
  }
  if (
    dbEvidence &&
    canonicalJson(value.source_ci_attestation) !== canonicalJson(dbEvidence.source_ci_attestation)
  ) {
    errors.push('authority citation source_ci_attestation이 DB 재생성 증거와 다릅니다.');
  }

  validateLinkedEvidence(
    value.authority_db_regeneration_evidence,
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db,
    'authority citation authority_db_regeneration_evidence',
    errors,
  );
  if (!Array.isArray(value.wave_exact_tables) || value.wave_exact_tables.length !== 2) {
    errors.push('authority citation wave_exact_tables는 정확히 두 개여야 합니다.');
  } else {
    value.wave_exact_tables.forEach((row, index) => {
      const wave = index === 0 ? 'wave1' : 'wave2';
      const label = `authority citation wave_exact_tables[${index}]`;
      if (!exactKeys(row, ['wave', 'path', 'sha256'], label, errors)) return;
      if (row.wave !== wave || row.path !== AUTHORITY_EVIDENCE_SOURCE_FILENAMES[wave]) {
        errors.push(`${label}의 wave/path가 정본과 다릅니다.`);
      }
      if (!SHA256.test(row.sha256 || '')) errors.push(`${label}.sha256이 유효하지 않습니다.`);
      const dbWave = dbEvidence?.waves?.find(candidate => candidate.wave === wave);
      if (dbWave && row.sha256 !== dbWave.exact_table_sha256) {
        errors.push(`${label}.sha256이 DB 재생성 증거와 다릅니다.`);
      }
    });
  }
  validateLinkedEvidence(
    value.citation_full_audit,
    AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citationAudit,
    'authority citation citation_full_audit',
    errors,
  );
  validateCounts(value.counts, EXPECTED_COUNTS, 'authority citation counts', errors);
  if (dbEvidence && canonicalJson(value.counts) !== canonicalJson(dbEvidence.counts)) {
    errors.push('authority citation counts가 DB 재생성 증거와 다릅니다.');
  }
  validateExpectedValues(value.checks, EXPECTED_CHECKS, 'authority citation checks', errors);

  if (!Array.isArray(value.allowed_empty_units) || value.allowed_empty_units.length !== 1) {
    errors.push('authority citation allowed_empty_units는 구조 컨테이너 한 개여야 합니다.');
  } else if (!exactKeys(
      value.allowed_empty_units[0],
      AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1.nested_keys.allowed_empty_unit,
      'authority citation allowed_empty_units[0]',
      errors,
    )) {
    // exactKeys가 구체적인 오류를 기록합니다.
  } else {
    for (const [key, expected] of Object.entries(EXPECTED_ALLOWED_EMPTY_UNIT)) {
      if (value.allowed_empty_units[0][key] !== expected) {
        errors.push('authority citation 허용 빈 단위가 민사집행법 제56조 구조 부모 정본과 다릅니다.');
        break;
      }
    }
  }

  if (exactKeys(value.regression, ['total', 'passed', 'failure_count'], 'authority citation regression', errors)) {
    if (value.regression.total !== 56 || value.regression.passed !== 56 || value.regression.failure_count !== 0) {
      errors.push('authority citation 회귀는 56/56 통과·실패 0이어야 합니다.');
    }
  }
  if (exactKeys(value.approval, ['owner', 'status', 'approved'], 'authority citation approval', errors)) {
    if (
      value.approval.owner !== 'source_maintenance' ||
      value.approval.status !== 'approved' ||
      value.approval.approved !== true
    ) {
      errors.push('authority citation approval은 source_maintenance approved여야 합니다.');
    }
  }
  if (value.passed !== true) errors.push('authority citation passed는 true여야 합니다.');
  return errors;
}

function validateExactArticle(tableArticle, evidenceArticle, expected, label, errors) {
  if (!exactKeys(tableArticle, EXACT_ARTICLE_KEYS, label, errors)) return;
  if (
    tableArticle.wave !== expected.wave ||
    tableArticle.article_key !== expected.articleKey ||
    tableArticle.source_id !== expected.sourceId
  ) {
    errors.push(`${label}의 article 정본 순서가 다릅니다.`);
  }
  const mappings = [
    ['public_source_snapshot_id', 'public_source_snapshot_id'],
    ['timeline_snapshot_id', 'timeline_snapshot_id'],
    ['source_version_key', 'source_version_key'],
    ['source_hash', 'source_hash'],
    ['timeline_normalized_hash', 'timeline_normalized_hash'],
    ['effective_date', 'effective_date'],
    ['timeline_official_effective_date', 'timeline_official_effective_date'],
    ['valid_from', 'valid_from'],
    ['valid_to', 'valid_to'],
    ['is_current', 'is_current'],
    ['official_url', 'official_url'],
    ['bridge_status', 'bridge_status'],
    ['unit_count', 'source_authority_unit_count'],
    ['citation_count', 'citation_count'],
  ];
  for (const [tableKey, evidenceKey] of mappings) {
    if (tableArticle[tableKey] !== evidenceArticle?.[evidenceKey]) {
      errors.push(`${label}.${tableKey}가 DB 증거 articles와 다릅니다.`);
    }
  }
  if (tableArticle.target_missing_count !== 0 || tableArticle.target_unit_missing_count !== 0) {
    errors.push(`${label}에 끊긴 citation target이 있습니다.`);
  }
}

function validateExactTable(value, wave, dbEvidence, errors) {
  const label = `${wave} exact table`;
  const initialErrorCount = errors.length;
  if (!exactKeys(value, ['schema', 'wave', 'articles', 'units', 'citations'], label, errors)) return null;
  if (value.schema !== EXACT_TABLE_SCHEMA || value.wave !== wave) {
    errors.push(`${label} schema/wave가 정본과 다릅니다.`);
  }
  for (const key of ['articles', 'units', 'citations']) {
    if (!Array.isArray(value[key])) errors.push(`${label}.${key}는 배열이어야 합니다.`);
  }
  if (
    errors.length > initialErrorCount ||
    !Array.isArray(value.articles) ||
    !Array.isArray(value.units) ||
    !Array.isArray(value.citations)
  ) {
    return null;
  }
  const expectedCounts = EXPECTED_WAVE_COUNTS[wave];
  if (
    value.articles.length !== expectedCounts.article_count ||
    value.units.length !== expectedCounts.source_authority_unit_count ||
    value.citations.length !== expectedCounts.citation_count
  ) {
    errors.push(`${label} 객체 수가 생산자 wave counts와 다릅니다.`);
  }
  const expectedArticles = AUTHORITY_EVIDENCE_ARTICLE_CONTRACT.filter(row => row.wave === wave);
  const evidenceArticles = dbEvidence.articles.filter(row => row.wave === wave);
  value.articles.forEach((article, index) =>
    validateExactArticle(article, evidenceArticles[index], expectedArticles[index], `${label}.articles[${index}]`, errors));

  const unitIds = new Set();
  const unitById = new Map();
  const emptyUnits = [];
  value.units.forEach((unit, index) => {
    const unitLabel = `${label}.units[${index}]`;
    if (!exactKeys(unit, EXACT_UNIT_KEYS, unitLabel, errors)) return;
    if (unit.wave !== wave || !expectedArticles.some(row => row.articleKey === unit.article_key)) {
      errors.push(`${unitLabel}의 wave/article 소유권이 다릅니다.`);
    }
    if (typeof unit.source_unit_id !== 'string' || unit.source_unit_id.length === 0 || unitIds.has(unit.source_unit_id)) {
      errors.push(`${unitLabel}.source_unit_id가 비어 있거나 중복됩니다.`);
    } else {
      unitIds.add(unit.source_unit_id);
      unitById.set(unit.source_unit_id, unit);
    }
    const expectedTextHash = `sha256:${rawSha256(Buffer.from(String(unit.text_ko ?? ''), 'utf8'))}`;
    if (unit.text_hash !== expectedTextHash) errors.push(`${unitLabel}.text_hash가 실제 text_ko와 다릅니다.`);
    if (unit.text_ko === '') emptyUnits.push(unit);
  });
  for (const [index, unit] of value.units.entries()) {
    if (unit.parent_unit_id && !unitById.has(unit.parent_unit_id)) {
      errors.push(`${label}.units[${index}].parent_unit_id가 같은 exact table에 없습니다.`);
    }
  }

  const edgeIds = new Set();
  value.citations.forEach((citation, index) => {
    const citationLabel = `${label}.citations[${index}]`;
    if (!exactKeys(citation, EXACT_CITATION_KEYS, citationLabel, errors)) return;
    if (citation.wave !== wave || !expectedArticles.some(row => row.articleKey === citation.article_key)) {
      errors.push(`${citationLabel}의 wave/article 소유권이 다릅니다.`);
    }
    if (typeof citation.edge_id !== 'string' || citation.edge_id.length === 0 || edgeIds.has(citation.edge_id)) {
      errors.push(`${citationLabel}.edge_id가 비어 있거나 중복됩니다.`);
    }
    edgeIds.add(citation.edge_id);
    if (!unitById.has(citation.source_unit_id) || citation.source_anchor_id !== citation.source_unit_id) {
      errors.push(`${citationLabel}의 source unit/anchor 결박이 끊겼습니다.`);
    }
    const shouldBeActive = citation.resolution_status === 'resolved';
    if (
      (shouldBeActive && citation.activation_status !== 'active_verified') ||
      (!shouldBeActive && citation.activation_status !== 'inactive_unresolved')
    ) {
      errors.push(`${citationLabel}의 resolution/activation 상태 조합이 다릅니다.`);
    }
  });

  for (const [index, article] of value.articles.entries()) {
    const units = value.units.filter(row => row.article_key === article.article_key);
    const citations = value.citations.filter(row => row.article_key === article.article_key);
    if (units.length !== article.unit_count || citations.length !== article.citation_count) {
      errors.push(`${label}.articles[${index}]의 unit/citation 수가 실제 행과 다릅니다.`);
    }
  }
  return {articles: value.articles, units: value.units, citations: value.citations, emptyUnits};
}

function stringField(row, key) {
  return String(row?.[key] || '');
}

function article25RangeEndpointDuplicates(citations) {
  const rule = ARTICLE_25_RANGE_ENDPOINT_DUPLICATE_RULE_V1;
  const excludedScopes = new Set(rule.excluded_reference_scopes);
  const prohibitedNumbers = new Set(rule.prohibited_exact_article_numbers);
  return citations
    .filter(row =>
      stringField(row, 'article_key') === rule.source_article_key &&
      !excludedScopes.has(stringField(row, 'target_reference_scope')) &&
      stringField(row, 'target_law_key') === rule.target_law_key &&
      (
        prohibitedNumbers.has(stringField(row, 'target_article_no')) ||
        (
          stringField(row, 'target_article_no') === rule.prohibited_trigger_article_no &&
          stringField(row, 'trigger_text').replaceAll(' ', '') ===
            rule.prohibited_trigger_text_without_spaces
        )
      ))
    .map(row => ({...row}))
    .sort((left, right) => stringField(left, 'edge_id').localeCompare(stringField(right, 'edge_id')));
}

function buildCitationFullAudit(exactRows, targetInventoryRows) {
  const articles = exactRows.flatMap(row => row.articles).map(row => ({...row}));
  const units = exactRows.flatMap(row => row.units).map(row => ({...row}));
  const citations = exactRows.flatMap(row => row.citations).map(row => ({...row}));
  const inventory = targetInventoryRows
    .map(row => ({...row}))
    .sort((left, right) => stringField(left, 'edge_id').localeCompare(stringField(right, 'edge_id')));
  const inventoryByEdge = new Map();
  const duplicateInventoryEdgeIds = [];
  for (const row of inventory) {
    const edgeId = stringField(row, 'edge_id');
    if (inventoryByEdge.has(edgeId)) duplicateInventoryEdgeIds.push(edgeId);
    inventoryByEdge.set(edgeId, row);
  }

  const inventoryMismatches = [];
  const citationEdgeIds = citations.map(row => stringField(row, 'edge_id'));
  for (const citation of citations) {
    const edgeId = stringField(citation, 'edge_id');
    const row = inventoryByEdge.get(edgeId);
    if (!row) {
      inventoryMismatches.push({edge_id: edgeId, failure_code: 'inventory_row_missing'});
      continue;
    }
    const expectedFields = {
      source_article_key: stringField(citation, 'article_key'),
      resolution_status: stringField(citation, 'resolution_status'),
      activation_status: stringField(citation, 'activation_status'),
      target_article_key: stringField(citation, 'target_article_key'),
      target_anchor_id: stringField(citation, 'target_anchor_id'),
    };
    for (const [field, expected] of Object.entries(expectedFields)) {
      if (stringField(row, field) !== expected) {
        inventoryMismatches.push({
          edge_id: edgeId,
          failure_code: `inventory_${field}_mismatch`,
        });
      }
    }
    const resolutionStatus = expectedFields.resolution_status;
    const inventoryStatus = stringField(row, 'inventory_status');
    if (!TARGET_INVENTORY_STATUS_VALUES.includes(inventoryStatus)) {
      inventoryMismatches.push({edge_id: edgeId, failure_code: 'inventory_status_invalid'});
    }
    if (resolutionStatus === 'resolved') {
      if (
        row.target_article_exists !== true ||
        row.target_anchor_exists !== true ||
        (
          expectedFields.activation_status === 'active_verified' &&
          row.target_current_verified !== true
        ) ||
        inventoryStatus !== 'resolved_target_verified'
      ) {
        inventoryMismatches.push({
          edge_id: edgeId,
          failure_code: 'resolved_target_not_verified',
        });
      }
    } else if ([
      'unresolved_scope',
      'unresolved_range',
      'delegated_unresolved',
      'target_missing',
      'target_unit_missing',
    ].includes(resolutionStatus)) {
      if (inventoryStatus !== resolutionStatus) {
        inventoryMismatches.push({
          edge_id: edgeId,
          failure_code: 'unresolved_inventory_status_mismatch',
        });
      }
    } else {
      inventoryMismatches.push({
        edge_id: edgeId,
        failure_code: 'resolution_status_not_contracted',
      });
    }
  }
  const citationEdgeSet = new Set(citationEdgeIds);
  for (const edgeId of [...inventoryByEdge.keys()].filter(id => !citationEdgeSet.has(id)).sort()) {
    inventoryMismatches.push({edge_id: edgeId, failure_code: 'inventory_orphan_row'});
  }
  for (const edgeId of [...new Set(duplicateInventoryEdgeIds)].sort()) {
    inventoryMismatches.push({edge_id: edgeId, failure_code: 'inventory_edge_id_duplicate'});
  }
  inventoryMismatches.sort((left, right) =>
    stringField(left, 'edge_id').localeCompare(stringField(right, 'edge_id')) ||
    stringField(left, 'failure_code').localeCompare(stringField(right, 'failure_code')));

  const wrong304 = citations.filter(row =>
    stringField(row, 'article_key') === 'litigation_promotion_special:0025' &&
    stringField(row, 'target_article_key') === 'litigation_promotion_special:0304');
  const rangeEndpointDuplicates = article25RangeEndpointDuplicates(citations);
  const duplicateEdgeIds = [...new Set(
    citationEdgeIds.filter(edgeId => citationEdgeIds.filter(value => value === edgeId).length > 1),
  )].sort();
  const emptyTextUnits = units.filter(row => stringField(row, 'text_ko') === '');
  const invalidEmptyUnits = emptyTextUnits.filter(
    row => stringField(row, 'content_role') !== 'structural_container',
  );
  const missing = citations.filter(row =>
    ['target_missing', 'target_unit_missing'].includes(stringField(row, 'resolution_status')));
  const invalidActive = citations.filter(row =>
    stringField(row, 'activation_status') === 'active_verified' &&
    stringField(row, 'resolution_status') !== 'resolved');
  return {
    schema: FULL_CITATION_AUDIT_SCHEMA,
    article_count: articles.length,
    unit_count: units.length,
    citation_count: citations.length,
    target_inventory_count: inventory.length,
    target_inventory_status_counts: Object.fromEntries(
      TARGET_INVENTORY_STATUS_VALUES.map(status => [
        status,
        inventory.filter(row => stringField(row, 'inventory_status') === status).length,
      ]),
    ),
    target_inventory: inventory,
    target_inventory_mismatch_count: inventoryMismatches.length,
    target_inventory_mismatches: inventoryMismatches,
    wrong_litigation_promotion_article_304_count: wrong304.length,
    wrong_litigation_promotion_article_304_edges: wrong304,
    article_25_range_endpoint_duplicate_rule: ARTICLE_25_RANGE_ENDPOINT_DUPLICATE_RULE_V1,
    article_25_range_endpoint_duplicate_count: rangeEndpointDuplicates.length,
    article_25_range_endpoint_duplicates: rangeEndpointDuplicates,
    duplicate_edge_id_count: duplicateEdgeIds.length,
    duplicate_edge_ids: duplicateEdgeIds,
    empty_text_unit_count: emptyTextUnits.length,
    invalid_empty_text_unit_count: invalidEmptyUnits.length,
    invalid_empty_text_units: invalidEmptyUnits,
    target_missing_or_unit_missing_count: missing.length,
    target_missing_or_unit_missing: missing,
    invalid_active_edge_count: invalidActive.length,
    invalid_active_edges: invalidActive,
    passed: ![
      inventoryMismatches,
      wrong304,
      rangeEndpointDuplicates,
      duplicateEdgeIds,
      invalidEmptyUnits,
      missing,
      invalidActive,
    ].some(rows => rows.length > 0),
  };
}

function validateCitationAudit(value, exactRows, errors) {
  const keys = [
    'schema',
    'article_count',
    'unit_count',
    'citation_count',
    'target_inventory_count',
    'target_inventory_status_counts',
    'target_inventory',
    'target_inventory_mismatch_count',
    'target_inventory_mismatches',
    'wrong_litigation_promotion_article_304_count',
    'wrong_litigation_promotion_article_304_edges',
    'article_25_range_endpoint_duplicate_rule',
    'article_25_range_endpoint_duplicate_count',
    'article_25_range_endpoint_duplicates',
    'duplicate_edge_id_count',
    'duplicate_edge_ids',
    'empty_text_unit_count',
    'invalid_empty_text_unit_count',
    'invalid_empty_text_units',
    'target_missing_or_unit_missing_count',
    'target_missing_or_unit_missing',
    'invalid_active_edge_count',
    'invalid_active_edges',
    'passed',
  ];
  if (!exactKeys(value, keys, 'citation_full_audit', errors)) return;
  if (value.schema !== FULL_CITATION_AUDIT_SCHEMA) {
    errors.push(`citation_full_audit.schema는 ${FULL_CITATION_AUDIT_SCHEMA}여야 합니다.`);
  }
  if (!Array.isArray(value.target_inventory) || value.target_inventory.length !== 63) {
    errors.push('citation_full_audit.target_inventory는 인용 63건과 정확히 대응해야 합니다.');
    return;
  }
  value.target_inventory.forEach((row, index) => {
    exactKeys(row, TARGET_INVENTORY_KEYS, `citation_full_audit.target_inventory[${index}]`, errors);
  });
  const recomputed = buildCitationFullAudit(exactRows, value.target_inventory);
  if (canonicalJson(value) !== canonicalJson(recomputed)) {
    errors.push('citation_full_audit이 exact table과 대상 인벤토리 재산출값과 다릅니다.');
  }
  for (const [key, expected] of Object.entries(EXPECTED_CHECKS)) {
    if (value[key] !== expected) errors.push(`citation_full_audit.${key}는 ${expected}여야 합니다.`);
  }
  if (value.passed !== true) errors.push('citation_full_audit.passed는 true여야 합니다.');
}

function ensureNoErrors(errors, artifactId) {
  if (errors.length) {
    throw new Error(`${artifactId} 의미 검증 실패:\n- ${errors.join('\n- ')}`);
  }
}

export async function validateAuthorityEvidenceArtifact({
  artifactId,
  payload,
  loadSiblingArtifact,
  context = {},
}) {
  if (typeof loadSiblingArtifact !== 'function') {
    throw new Error(`${artifactId} 검증에는 병합 source head의 sibling artifact loader가 필요합니다.`);
  }
  const sourcePayload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const value = parseJson(artifactId, sourcePayload);
  const errors = [];
  const referencedArtifacts = {};

  const validateDbAndSources = async (dbValue, dbPayload) => {
    errors.push(...validateAuthorityDbRegenerationEvidence(dbValue, context));
    const exactRows = [];
    for (const wave of ['wave1', 'wave2']) {
      const waveEvidence = dbValue.waves?.find(candidate => candidate.wave === wave);
      const filename = AUTHORITY_EVIDENCE_SOURCE_FILENAMES[wave];
      if (waveEvidence?.exact_table_path !== filename) continue;
      const exactPayload = await loadSiblingArtifact(filename);
      const actualHash = rawSha256(exactPayload);
      referencedArtifacts[filename] = actualHash;
      if (actualHash !== waveEvidence.exact_table_sha256) {
        errors.push(`${filename} 실제 바이트 SHA-256이 DB 증거와 다릅니다.`);
        continue;
      }
      const exactValue = parseJson(filename, exactPayload);
      const row = validateExactTable(exactValue, wave, dbValue, errors);
      if (row) exactRows.push(row);
    }
    referencedArtifacts[AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db] = rawSha256(dbPayload);
    return exactRows;
  };

  if (artifactId === 'authority-db-regenerated') {
    await validateDbAndSources(value, sourcePayload);
  } else if (artifactId === 'authority-citation-audit-approved') {
    const dbFilename = value.authority_db_regeneration_evidence?.path;
    if (dbFilename !== AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db) {
      errors.push('authority citation이 같은 디렉터리의 approved DB 증거를 가리키지 않습니다.');
    } else {
      const dbPayload = await loadSiblingArtifact(dbFilename);
      const dbHash = rawSha256(dbPayload);
      referencedArtifacts[dbFilename] = dbHash;
      if (dbHash !== value.authority_db_regeneration_evidence.sha256) {
        errors.push('authority citation의 DB 증거 SHA-256이 실제 sibling 파일과 다릅니다.');
      }
      const dbValue = parseJson(dbFilename, dbPayload);
      errors.push(...validateAuthorityCitationAuditEvidence(value, dbValue));
      const exactRows = await validateDbAndSources(dbValue, dbPayload);
      for (const wave of ['wave1', 'wave2']) {
        const citationWave = value.wave_exact_tables?.find(candidate => candidate.wave === wave);
        const dbWave = dbValue.waves?.find(candidate => candidate.wave === wave);
        if (
          citationWave?.path !== AUTHORITY_EVIDENCE_SOURCE_FILENAMES[wave] ||
          citationWave?.sha256 !== dbWave?.exact_table_sha256 ||
          citationWave?.sha256 !== referencedArtifacts[AUTHORITY_EVIDENCE_SOURCE_FILENAMES[wave]]
        ) {
          errors.push(`authority citation ${wave} exact table 결박이 실제 sibling 파일과 다릅니다.`);
        }
      }
      const auditFilename = value.citation_full_audit?.path;
      if (auditFilename === AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citationAudit) {
        const auditPayload = await loadSiblingArtifact(auditFilename);
        const auditHash = rawSha256(auditPayload);
        referencedArtifacts[auditFilename] = auditHash;
        if (auditHash !== value.citation_full_audit.sha256) {
          errors.push('citation_full_audit 실제 바이트 SHA-256이 citation 증거와 다릅니다.');
        } else {
          validateCitationAudit(parseJson(auditFilename, auditPayload), exactRows, errors);
        }
      }
    }
  } else {
    throw new Error(`authority 의미 검증 대상이 아닌 산출물입니다: ${artifactId}`);
  }

  referencedArtifacts[
    artifactId === 'authority-db-regenerated'
      ? AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db
      : AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation
  ] = rawSha256(sourcePayload);
  ensureNoErrors(errors, artifactId);
  return Object.freeze({
    value,
    semantic_contract: AUTHORITY_EVIDENCE_VERIFICATION_CONTRACT,
    referenced_artifacts: Object.freeze({...referencedArtifacts}),
  });
}

export function authorityEvidenceSiblingPath(evidenceRepositoryPath, siblingFilename) {
  if (
    typeof evidenceRepositoryPath !== 'string' ||
    !evidenceRepositoryPath.startsWith(`${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/`) ||
    path.posix.dirname(evidenceRepositoryPath) !== AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY ||
    !SAFE_FILENAME.test(siblingFilename || '')
  ) {
    throw new Error('authority source artifact sibling 경로가 승인 디렉터리 밖입니다.');
  }
  return path.posix.join(AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY, siblingFilename);
}
