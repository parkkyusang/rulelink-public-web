import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  loadCoverageDocuments,
  validateCoverageDocuments,
  verifyReleaseGitProof,
} from './publication-coverage-core.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicationBundlePath = path.resolve(
  appRoot,
  '..',
  '..',
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(repository, ...args) {
  return execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}

function writeFixture(repository, filename, value) {
  const absolute = path.join(repository, ...filename.split('/'));
  mkdirSync(path.dirname(absolute), {recursive: true});
  writeFileSync(absolute, value);
}

test('024 coverage matrix는 8개 답변 단위의 L1·L2·시간 결박을 정직하게 보고한다', async () => {
  const documents = await loadCoverageDocuments();
  const result = validateCoverageDocuments(documents);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.invalidations, []);
  assert.equal(
    result.base_bundle_sha256,
    documents.manifest.base_bundle_sha256,
  );
  assert.equal(result.snapshot_id, 'kr-knowledge-core-20260726-024');
  assert.equal(result.units.length, 8);
  assert.equal(
    result.observations.filter(
      (item) => item.authority_level === 'L1_coordinate',
    ).length,
    2,
  );
  assert.equal(
    result.observations.filter(
      (item) => item.authority_level === 'L2_locator',
    ).length,
    6,
  );
  assert.equal(
    result.observations.reduce(
      (sum, item) => sum + item.evaluation_cases_declared_count,
      0,
    ),
    12,
  );
  assert.equal(
    result.observations.every(
      (item) =>
        item.content_present_in_base_snapshot &&
        item.source_version_current &&
        item.branch_closed &&
        !item.coverage_release_verified &&
        item.target_gap,
    ),
    true,
  );
  assert.equal(
    result.observations.filter((item) => item.experience_fields_complete).length,
    7,
  );
  assert.deepEqual(
    result.observations
      .filter((item) => !item.experience_fields_complete)
      .flatMap((item) => item.experience_missing)
      .sort(),
    [
      'content.payment-order-objection-two-weeks:situation',
    ],
  );
  assert.equal(
    result.observations.filter(
      (item) => item.temporal_authority_verified,
    ).length,
    6,
  );
});

test('coverage bundle hash는 LF와 CRLF에서 같은 Git 정본 값을 사용한다', async (t) => {
  const repository = mkdtempSync(path.join(tmpdir(), 'rulelink-coverage-eol-'));
  t.after(() => rmSync(repository, {recursive: true, force: true}));
  const lf = readFileSync(publicationBundlePath, 'utf8').replace(/\r\n?/gu, '\n');
  const lfPath = path.join(repository, 'bundle-lf.json');
  const crlfPath = path.join(repository, 'bundle-crlf.json');
  writeFileSync(lfPath, lf, 'utf8');
  writeFileSync(crlfPath, lf.replace(/\n/gu, '\r\n'), 'utf8');

  const [lfDocuments, crlfDocuments] = await Promise.all([
    loadCoverageDocuments({bundlePath: lfPath}),
    loadCoverageDocuments({bundlePath: crlfPath}),
  ]);
  assert.equal(
    lfDocuments.bundleSha256,
    lfDocuments.manifest.base_bundle_sha256,
  );
  assert.equal(crlfDocuments.bundleSha256, lfDocuments.bundleSha256);
});

test('분기 서명은 실제 Scenario의 결정사실과 양쪽 결과 문언에 결박된다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[0].units[0];
  unit.branch_signature[0].when_true_sha256 = '0'.repeat(64);

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.some((error) =>
      error.includes(
        `coverage_unit:${unit.coverage_unit_id}:branch_signature:0:when_true_sha256:mismatch`,
      ),
    ),
  );
  const observation = result.observations.find(
    (item) => item.coverage_unit_id === unit.coverage_unit_id,
  );
  assert.equal(observation.branch_closed, false);
});

test('평가 사례는 승인된 외부 evaluator scope receipt에 존재해야 한다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[0].units[0];
  unit.evaluation_case_ids = ['eval.not-in-approved-scope'];

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_unit:${unit.coverage_unit_id}:evaluation_case_not_in_scope_receipt:eval.not-in-approved-scope`,
    ),
  );
  const observation = result.observations.find(
    (item) => item.coverage_unit_id === unit.coverage_unit_id,
  );
  assert.equal(observation.evaluation_cases_bound_count, 0);
  assert.equal(observation.evaluation_results_verified_count, 0);
});

test('evaluator commit과 manifest·case·gold hash는 신뢰된 receipt와 exact 일치해야 한다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  documents.evaluationScopeReceipt.evaluator_commit = 'f'.repeat(40);
  documents.evaluationScopeReceipt.case_files[0].sha256 = '0'.repeat(64);

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes('coverage_evaluation_scope_receipt_identity_invalid'),
  );
  assert.ok(
    result.errors.includes(
      'coverage_evaluation_scope_receipt:case_files:0:invalid',
    ),
  );
});

test('evaluation receipt requires the exact trusted case and file sets', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  documents.evaluationScopeReceipt.case_ids.pop();
  documents.evaluationScopeReceipt.case_files[1] = structuredClone(
    documents.evaluationScopeReceipt.case_files[0],
  );

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      'coverage_evaluation_scope_receipt:case_ids:trusted_set_mismatch',
    ),
  );
  assert.ok(
    result.errors.includes(
      'coverage_evaluation_scope_receipt:case_files:trusted_set_mismatch',
    ),
  );
});

test('evaluation result hashes without approved source files never count as verified', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[0].units[0];
  documents.evaluationScopeReceipt.verified_result_receipts = [
    {
      case_id: unit.evaluation_case_ids[0],
      result_path: 'artifacts/publication/coverage/fake-result.json',
      result_sha256: 'a'.repeat(64),
      review_receipt_path:
        'artifacts/publication/coverage/fake-review-receipt.json',
      review_receipt_sha256: 'b'.repeat(64),
    },
  ];

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes('coverage_evaluation_result_receipt_invalid:0'),
  );
  assert.equal(
    result.observations.find(
      (item) => item.coverage_unit_id === unit.coverage_unit_id,
    ).evaluation_results_verified_count,
    0,
  );
});

test('존재하지 않는 콘텐츠와 그래프 밖 근거를 fail-closed 한다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[0].units[0];
  unit.canonical_content_ids = ['content.not-found'];
  unit.required_source_coordinate_ids = [
    'coord.debt-enforcement.civil-procedure-ko-0470',
  ];

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      'coverage_unit:coverage.kr.crime-victim.compensation-order.eligibility.v1:content:missing:content.not-found',
    ),
  );
  assert.ok(
    result.errors.includes(
      'coverage_unit:coverage.kr.crime-victim.compensation-order.eligibility.v1:source_not_reachable_from_answer_graph:coord.debt-enforcement.civil-procedure-ko-0470',
    ),
  );
});

test('질문군·절차단계·coverage unit·평가사례의 중복과 누락을 차단한다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const first = documents.domains[0].units[0];
  documents.domains[1].units[0].coverage_unit_id = first.coverage_unit_id;
  documents.domains[1].units[0].evaluation_case_ids = [
    first.evaluation_case_ids[0],
  ];
  first.question_family_id = 'question.not-found';
  first.procedure_stage_id = 'procedure.not-found';

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_unit_duplicate:${first.coverage_unit_id}`,
    ),
  );
  assert.ok(
    result.errors.includes(
      `coverage_evaluation_case_duplicate:${first.evaluation_case_ids[0]}`,
    ),
  );
  assert.ok(
    result.errors.includes(
      `coverage_unit:${first.coverage_unit_id}:question_family_missing:question.not-found`,
    ),
  );
  assert.ok(
    result.errors.includes(
      `coverage_unit:${first.coverage_unit_id}:procedure_stage_missing:procedure.not-found`,
    ),
  );
});

test('base snapshot이 바뀌면 기존 coverage를 공개 완료로 인정하지 않는다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  documents.bundle.snapshot_id = 'kr-knowledge-core-20990101-999';

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_base_snapshot_mismatch:${documents.manifest.base_snapshot_id}:kr-knowledge-core-20990101-999`,
    ),
  );
  assert.equal(
    result.observations.some((item) => item.content_present_in_base_snapshot),
    false,
  );
});

test('같은 snapshot id 안에서 bundle bytes가 바뀌어도 fail-closed 한다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  documents.bundleSha256 = '0'.repeat(64);

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_base_bundle_hash_mismatch:${documents.manifest.base_bundle_sha256}:` +
        '0'.repeat(64),
    ),
  );
  assert.equal(
    result.observations.some((item) => item.content_present_in_base_snapshot),
    false,
  );
});

test('근거 snapshot과 검증시점 drift를 coverage 무효화로 보고한다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const coordinateId =
    'coord.crime-victim-response.litigation-promotion-special-ko-0025';
  const source = documents.bundle.knowledge.sources.find(
    (item) => item.coordinate_id === coordinateId,
  );
  source.source_snapshot_id = 'snapshot:changed';
  source.last_verified_at = '2099-01-01T00:00:00+00:00';

  const result = validateCoverageDocuments(documents);
  assert.deepEqual(result.errors, []);
  assert.ok(
    result.invalidations.some((item) =>
      item.includes(`source_snapshot_changed:${coordinateId}`),
    ),
  );
  assert.ok(
    result.invalidations.some((item) =>
      item.includes(`source_verification_changed:${coordinateId}`),
    ),
  );
  const observation = result.observations.find(
    (item) =>
      item.coverage_unit_id ===
      'coverage.kr.crime-victim.compensation-order.eligibility.v1',
  );
  assert.equal(observation.source_version_current, false);
  assert.equal(observation.authority_level, 'L0_structure');
  assert.equal(observation.content_present_in_base_snapshot, true);
});

test('근거 ID와 독립 version pin의 집합이 다르면 차단한다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[0].units[0];
  unit.source_version_requirements = [];

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_unit:${unit.coverage_unit_id}:source_version_requirements:non_empty_required`,
    ),
  );
  assert.ok(
    result.errors.includes(
      `coverage_unit:${unit.coverage_unit_id}:source_version_requirements:coordinate_set_mismatch`,
    ),
  );
});

test('필수 배열 누락은 예외가 아니라 명시적 오류가 된다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[0].units[0];
  delete unit.required_rule_ids;

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_unit:${unit.coverage_unit_id}:field_missing:required_rule_ids`,
    ),
  );
  assert.ok(
    result.errors.includes(
      `coverage_unit:${unit.coverage_unit_id}:required_rule_ids:array_required`,
    ),
  );
});

test('L2 binding은 실제 bundle에 존재할 때만 선언할 수 있다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[0].units[0];
  unit.required_authority_binding_ids = ['binding.not-published'];

  const result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_unit:${unit.coverage_unit_id}:authority_binding:missing:binding.not-published`,
    ),
  );
  const observation = result.observations.find(
    (item) => item.coverage_unit_id === unit.coverage_unit_id,
  );
  assert.equal(observation.authority_level, 'L1_coordinate');
});

test('L2 binding은 해당 콘텐츠에서 해당 근거로 가는 투영일 때만 인정한다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[0].units[0];
  const bindingId = 'binding.coverage.test';
  const authorityId = 'authority.coverage.test';
  unit.required_authority_binding_ids = [bindingId];
  documents.bundle.knowledge.authority_reading_units.push({
    authority_reading_unit_id: authorityId,
    source_coordinate_id: unit.required_source_coordinate_ids[0],
    source_snapshot_id:
      unit.source_version_requirements[0].source_snapshot_id,
    time_state: 'current_as_of_review',
    effective_from: '2025-01-01T00:00:00.000Z',
  });
  documents.bundle.knowledge.authority_bindings.push({
    binding_id: bindingId,
    from_kind: 'content',
    from_id: unit.canonical_content_ids[0],
    to_kind: 'authority_reading_unit',
    to_authority_reading_unit_id: authorityId,
  });

  let result = validateCoverageDocuments(documents);
  assert.deepEqual(result.errors, []);
  assert.equal(
    result.observations.find(
      (item) => item.coverage_unit_id === unit.coverage_unit_id,
    ).authority_level,
    'L2_locator',
  );
  assert.equal(
    result.observations.find(
      (item) => item.coverage_unit_id === unit.coverage_unit_id,
    ).temporal_authority_verified,
    true,
  );

  documents.bundle.knowledge.authority_bindings.find(
    (binding) => binding.binding_id === bindingId,
  ).from_id = 'content.payment-order-objection-two-weeks';
  result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_unit:${unit.coverage_unit_id}:authority_binding_not_relevant:${bindingId}:content_projection_mismatch`,
    ),
  );
  assert.equal(
    result.observations.find(
      (item) => item.coverage_unit_id === unit.coverage_unit_id,
    ).authority_level,
    'L1_coordinate',
  );
});

test('적용시점은 authority time_state와 시행기간에 맞아야 한다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[1].units[0];
  const bindingId = 'binding.coverage.temporal';
  const authorityId = 'authority.coverage.temporal';
  unit.required_authority_binding_ids = [bindingId];
  documents.bundle.knowledge.authority_reading_units = [
    {
      authority_reading_unit_id: authorityId,
      source_coordinate_id: unit.required_source_coordinate_ids[0],
      source_snapshot_id:
        unit.source_version_requirements[0].source_snapshot_id,
      time_state: 'historical',
      effective_from: '2020-01-01',
      effective_to: '2025-01-01',
    },
  ];
  documents.bundle.knowledge.authority_bindings = [
    {
      binding_id: bindingId,
      from_kind: 'content',
      from_id: unit.canonical_content_ids[0],
      to_kind: 'authority_reading_unit',
      to_authority_reading_unit_id: authorityId,
    },
  ];

  const result = validateCoverageDocuments(documents);
  const observation = result.observations.find(
    (item) => item.coverage_unit_id === unit.coverage_unit_id,
  );
  assert.equal(observation.temporal_authority_verified, false);
  assert.equal(observation.target_gap, true);
});

test('릴리스 완료는 current·bundle·release·queue·registry와 두 커밋 receipt가 모두 맞을 때만 계산된다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const unit = documents.domains[2].units[0];
  documents.releaseEvidence.releases = [
    {
      coverage_unit_id: unit.coverage_unit_id,
      snapshot_id: documents.bundle.snapshot_id,
      publication_bundle_sha256: documents.bundleSha256,
      release_descriptor_sha256: documents.releaseDescriptorSha256,
      production_queue_sha256: documents.productionQueueSha256,
      production_registry_sha256: documents.productionRegistrySha256,
      migration_commit_sha: '1'.repeat(40),
      evidence_commit_sha: '2'.repeat(40),
      released_at: '2026-07-25T00:00:00Z',
    },
  ];

  let result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_unit:${unit.coverage_unit_id}:release_evidence_invalid:git:commit_not_found`,
    ),
  );
  assert.equal(
    result.observations.find(
      (item) => item.coverage_unit_id === unit.coverage_unit_id,
    ).coverage_release_verified,
    false,
  );

  documents.releaseEvidence.releases[0].production_queue_sha256 =
    '0'.repeat(64);
  result = validateCoverageDocuments(documents);
  assert.ok(
    result.errors.includes(
      `coverage_unit:${unit.coverage_unit_id}:release_evidence_invalid:production_queue_sha256:mismatch`,
    ),
  );
});

test('release proof accepts only an actual linear migration and evidence commit pair', () => {
  const repository = mkdtempSync(
    path.join(tmpdir(), 'rulelink-coverage-release-proof-'),
  );
  const snapshotId = 'kr-test-024';
  const bundleBytes = Buffer.from('{"snapshot_id":"kr-test-024"}\n');
  const releaseBytes = Buffer.from('{"snapshot_id":"kr-test-024"}\n');
  const queueBytes = Buffer.from('{"queue":"024"}\n');
  const registryBytes = Buffer.from('{"registry":"024"}\n');
  try {
    git(repository, 'init');
    git(repository, 'config', 'user.email', 'coverage-test@example.invalid');
    git(repository, 'config', 'user.name', 'Coverage Test');
    writeFixture(
      repository,
      'web/rulelink_public_next/deploy/release.json',
      releaseBytes,
    );
    writeFixture(
      repository,
      'artifacts/publication/production-queue.json',
      Buffer.from('{"queue":"023"}\n'),
    );
    writeFixture(
      repository,
      'artifacts/publication/production-queue-registry.json',
      Buffer.from('{"registry":"023"}\n'),
    );
    git(repository, 'add', '.');
    git(repository, 'commit', '-m', 'initial');

    writeFixture(
      repository,
      'artifacts/publication/current/bundle.json',
      bundleBytes,
    );
    writeFixture(
      repository,
      `artifacts/publication/snapshots/${snapshotId}/bundle.json`,
      bundleBytes,
    );
    writeFixture(
      repository,
      'artifacts/publication/topics/manifest.json',
      Buffer.from('{"snapshot_id":"kr-test-024"}\n'),
    );
    git(repository, 'add', '.');
    git(repository, 'commit', '-m', 'migration');
    const migrationCommit = git(repository, 'rev-parse', 'HEAD');

    writeFixture(
      repository,
      'artifacts/publication/production-queue.json',
      queueBytes,
    );
    writeFixture(
      repository,
      'artifacts/publication/production-queue-registry.json',
      registryBytes,
    );
    git(repository, 'add', '.');
    git(repository, 'commit', '-m', 'evidence');
    const evidenceCommit = git(repository, 'rev-parse', 'HEAD');

    const receipt = {
      snapshot_id: snapshotId,
      migration_commit_sha: migrationCommit,
      evidence_commit_sha: evidenceCommit,
    };
    const expected = {
      publication_bundle_sha256: sha256(bundleBytes),
      release_descriptor_sha256: sha256(releaseBytes),
      production_queue_sha256: sha256(queueBytes),
      production_registry_sha256: sha256(registryBytes),
    };
    assert.deepEqual(
      verifyReleaseGitProof(receipt, expected, repository),
      [],
    );
    assert.ok(
      verifyReleaseGitProof(
        {...receipt, evidence_commit_sha: migrationCommit},
        expected,
        repository,
      ).includes('evidence_commit_not_direct_child'),
    );
  } finally {
    rmSync(repository, {recursive: true, force: true});
  }
});
