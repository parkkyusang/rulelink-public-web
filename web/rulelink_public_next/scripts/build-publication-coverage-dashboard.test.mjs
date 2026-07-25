import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCoverageDashboard,
  loadCoverageDocuments,
  validateCoverageDocuments,
} from './publication-coverage-core.mjs';

test('coverage dashboard는 콘텐츠 수가 아니라 검증 단위와 격차를 계산한다', async () => {
  const validation = validateCoverageDocuments(await loadCoverageDocuments());
  const dashboard = buildCoverageDashboard(validation);

  assert.equal(dashboard.schema, 'rulelink_publication_coverage_dashboard_v1');
  assert.equal(dashboard.snapshot_id, 'kr-knowledge-core-20260723-023');
  assert.equal(
    dashboard.base_bundle_sha256,
    '18209d6268b59e8e6bee3e1628234da9804e7b835b3e08d2eef70b91410fa581',
  );
  assert.deepEqual(dashboard.invalidations, []);
  assert.deepEqual(dashboard.total, {
    authority_l0: 0,
    authority_l1: 8,
    authority_l2: 0,
    bound_evaluation_cases: 12,
    branch_closed_coverage_units: 8,
    coverage_units: 8,
    content_present_in_base_snapshot: 8,
    declared_evaluation_cases: 12,
    experience_fields_complete_coverage_units: 1,
    invalidated_coverage_units: 0,
    released_coverage_units: 0,
    target_gap: 8,
    temporal_authority_verified_coverage_units: 0,
    verified_evaluation_results: 0,
  });
  assert.deepEqual(
    dashboard.by_topic.map((item) => [
      item.topic_id,
      item.coverage_units,
      item.authority_l1,
      item.authority_l2,
      item.declared_evaluation_cases,
      item.experience_fields_complete_coverage_units,
      item.invalidated_coverage_units,
      item.target_gap,
    ]),
    [
      ['hub.crime-victim-response', 6, 6, 0, 12, 0, 0, 6],
      ['hub.debt-enforcement', 1, 1, 0, 0, 0, 0, 1],
      ['hub.housing-lease-deposit', 1, 1, 0, 0, 1, 0, 1],
    ],
  );
  assert.deepEqual(dashboard.honesty, {
    bound_evaluation_cases_are_not_verified_results: true,
    content_presence_is_not_field_completeness: true,
    field_completeness_is_not_semantic_answer_verification: true,
    l1_and_l2_are_reported_separately: true,
    released_state_is_derived_not_authored: true,
    temporal_authority_is_separate_and_fail_closed: true,
    source_versions_are_pinned: true,
  });
  assert.equal(dashboard.experience_gaps.length, 7);
});

test('source drift는 dashboard에 별도 invalidation으로 남는다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  const source = documents.bundle.knowledge.sources.find(
    (item) =>
      item.coordinate_id ===
      'coord.housing-lease-deposit.housing-lease-ko-0003-03',
  );
  source.source_snapshot_id = 'snapshot:changed';
  const validation = validateCoverageDocuments(documents);
  const dashboard = buildCoverageDashboard(validation);

  assert.equal(dashboard.total.invalidated_coverage_units, 1);
  assert.equal(dashboard.total.authority_l0, 1);
  assert.equal(dashboard.total.authority_l1, 7);
  assert.equal(dashboard.invalidations.length, 1);
});

test('검증 오류가 있는 문서로 dashboard를 만들 수 없다', async () => {
  const documents = structuredClone(await loadCoverageDocuments());
  documents.domains[0].units[0].required_rule_ids = ['rule.not-found'];
  const validation = validateCoverageDocuments(documents);

  assert.throws(
    () => buildCoverageDashboard(validation),
    /coverage matrix validation failed/,
  );
});
