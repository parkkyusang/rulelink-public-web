import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadCoverageDocuments,
  validateCoverageDocuments,
} from './publication-coverage-core.mjs';

test('023 coverage matrix는 8개 답변 단위를 L1으로 정직하게 보고한다', async () => {
  const documents = await loadCoverageDocuments();
  const result = validateCoverageDocuments(documents);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.invalidations, []);
  assert.equal(
    result.base_bundle_sha256,
    '18209d6268b59e8e6bee3e1628234da9804e7b835b3e08d2eef70b91410fa581',
  );
  assert.equal(result.snapshot_id, 'kr-knowledge-core-20260723-023');
  assert.equal(result.units.length, 8);
  assert.equal(
    result.observations.filter(
      (item) => item.authority_level === 'L1_coordinate',
    ).length,
    8,
  );
  assert.equal(
    result.observations.filter(
      (item) => item.authority_level === 'L2_locator',
    ).length,
    0,
  );
  assert.equal(
    result.observations.reduce(
      (sum, item) => sum + item.evaluation_case_count,
      0,
    ),
    12,
  );
  assert.equal(
    result.observations.every(
      (item) =>
        item.content_present_in_base_snapshot &&
        item.source_version_current &&
        !item.coverage_release_verified &&
        item.target_gap &&
        !item.evaluation_verified,
    ),
    true,
  );
  assert.equal(
    result.observations.filter((item) => item.experience_ready).length,
    1,
  );
  assert.deepEqual(
    result.observations
      .filter((item) => !item.experience_ready)
      .flatMap((item) => item.experience_missing)
      .sort(),
    [
      'content.compensation-order-application-deadline:situation',
      'content.compensation-order-application-deadline:situation',
      'content.compensation-order-application-deadline:situation',
      'content.compensation-order-eligible-damages:situation',
      'content.compensation-order-eligible-damages:situation',
      'content.compensation-order-eligible-damages:situation',
      'content.compensation-order-eligible-damages:situation',
      'content.payment-order-objection-two-weeks:situation',
    ],
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
      'coverage_base_snapshot_mismatch:kr-knowledge-core-20260723-023:kr-knowledge-core-20990101-999',
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
      'coverage_base_bundle_hash_mismatch:18209d6268b59e8e6bee3e1628234da9804e7b835b3e08d2eef70b91410fa581:' +
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
  documents.bundle.knowledge.authority_reading_units = [
    {
      authority_reading_unit_id: authorityId,
      source_coordinate_id: unit.required_source_coordinate_ids[0],
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

  let result = validateCoverageDocuments(documents);
  assert.deepEqual(result.errors, []);
  assert.equal(
    result.observations.find(
      (item) => item.coverage_unit_id === unit.coverage_unit_id,
    ).authority_level,
    'L2_locator',
  );

  documents.bundle.knowledge.authority_bindings[0].from_id =
    'content.payment-order-objection-two-weeks';
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
