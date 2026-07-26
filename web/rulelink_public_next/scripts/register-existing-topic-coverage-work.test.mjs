import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  buildImportedCoverageProductionWorkItem,
  buildPlannedProductionWorkItem,
} from './register-publication-production-work.mjs';
import {
  PRODUCTION_WORK_CONTRACTS,
  coverageCandidateContractReceipt,
  topicReceipt,
  validateProductionQueue,
} from './validate-publication-production-queue.mjs';

const registrationChainChangeScope = Object.freeze([
  'artifacts/publication/coverage/coverage-expansion-plan.json',
  'artifacts/publication/production-queue-registry.json',
  'artifacts/publication/production-queue.json',
  'web/rulelink_public_next/scripts/build-publication-coverage-expansion-plan.mjs',
  'web/rulelink_public_next/scripts/existing-topic-coverage-candidate-core.mjs',
  'web/rulelink_public_next/scripts/publication-coverage-expansion-planner.test.mjs',
  'web/rulelink_public_next/scripts/register-existing-topic-coverage-work.test.mjs',
  'web/rulelink_public_next/scripts/register-publication-production-work.mjs',
  'web/rulelink_public_next/scripts/register-publication-production-work.test.mjs',
  'web/rulelink_public_next/scripts/validate-publication-production-queue.mjs',
  'web/rulelink_public_next/scripts/validate-publication-production-queue.test.mjs',
]);

const workId =
  'coverage-expansion-housing-lease-deposit-kr-knowledge-core-20260726-024';
const baseSha = '1'.repeat(40);
const headSha = '2'.repeat(40);
const requiredPrBaseSha = baseSha;
const mismatchedPrBaseSha = '3'.repeat(40);
const topicFile =
  'artifacts/publication/topics/housing-lease-deposit.json';
const candidateTestFile =
  'web/rulelink_public_next/scripts/housing-lease-deposit-response-map-topic.test.mjs';

test('기존 주제 후보 등록 체인은 정본·계획·등록·검증 11파일만 소유한다', () => {
  assert.equal(registrationChainChangeScope.length, 11);
  assert.deepEqual(registrationChainChangeScope, [
    'artifacts/publication/coverage/coverage-expansion-plan.json',
    'artifacts/publication/production-queue-registry.json',
    'artifacts/publication/production-queue.json',
    'web/rulelink_public_next/scripts/build-publication-coverage-expansion-plan.mjs',
    'web/rulelink_public_next/scripts/existing-topic-coverage-candidate-core.mjs',
    'web/rulelink_public_next/scripts/publication-coverage-expansion-planner.test.mjs',
    'web/rulelink_public_next/scripts/register-existing-topic-coverage-work.test.mjs',
    'web/rulelink_public_next/scripts/register-publication-production-work.mjs',
    'web/rulelink_public_next/scripts/register-publication-production-work.test.mjs',
    'web/rulelink_public_next/scripts/validate-publication-production-queue.mjs',
    'web/rulelink_public_next/scripts/validate-publication-production-queue.test.mjs',
  ]);
  assert.equal(registrationChainChangeScope.some(filePath => (
    filePath.startsWith('artifacts/publication/topics/')
    || filePath.startsWith('artifacts/publication/current/')
    || filePath.startsWith('artifacts/publication/snapshots/')
    || filePath.startsWith('artifacts/publication/releases/')
    || filePath.includes('site-search')
    || filePath.includes('source-text')
  )), false);
});

function topic(extraEntry = false) {
  const contract = PRODUCTION_WORK_CONTRACTS[workId];
  const baselineEntries = contract.target_content_ids.map(
    (contentId, index) => ({
      content_id: contentId,
      title_ko: `보증금 문제 ${index + 1}`,
      slug: contentId.replace(/^content\./u, ''),
      content_type: 'procedure',
      audience_situation_ko: `보증금 문제 ${index + 1}을 확인합니다.`,
      search_intents_ko: [`보증금 문제 ${index + 1}은 어떻게 해결하나요`],
      related_edges: [],
    }),
  );
  return {
    schema: 'rulelink_publication_topic_v1',
    topic_hubs: [{hub_id: 'hub.housing-lease-deposit'}],
    sources: [{source_coordinate_id: 'coord.test'}],
    rule_cards: [{
      rule_id: 'rule.test',
      proposition_ko: '보증금을 반환해야 합니다.',
      norm: {legal_effect_ko: '반환 청구를 검토합니다.'},
    }],
    scenario_branches: [{scenario_id: 'scenario.test'}],
    authority_reading_units: [],
    content_entries: [
      ...baselineEntries,
      ...(extraEntry
        ? [{
            content_id: 'content.deposit-refund-response-map',
            title_ko: '보증금을 돌려받지 못했을 때 대응 순서',
            slug: 'deposit-refund-response-map',
            content_type: 'procedure',
            audience_situation_ko: '임대차가 끝났는데 보증금을 받지 못했습니다.',
            search_intents_ko: ['집주인이 보증금을 돌려주지 않으면 무엇부터 하나요'],
            related_edges: [{target_id: 'content.move-before-deposit-refund'}],
          }]
        : []),
    ],
  };
}

function candidateSpec() {
  return {
    work_id: workId,
    source_branch: 'codex/existing-topic-coverage-housing-lease-deposit-20260726',
    source_base_sha: baseSha,
    source_head_sha: headSha,
    required_pr_base_sha: requiredPrBaseSha,
  };
}

function requiredPlan() {
  const contract = PRODUCTION_WORK_CONTRACTS[workId];
  return {
    generated_from: {
      snapshot_id: contract.planning_snapshot_id,
      base_bundle_sha256: contract.planning_bundle_sha256,
    },
    task_packets: [{
      work_id: workId,
      topic_id: contract.topic_id,
      topic_file: contract.topic_file,
      self_test_file: contract.planned_test_file,
      owned_paths: contract.planned_owned_paths,
      forbidden_paths: contract.forbidden_paths,
      target_content_ids: contract.target_content_ids,
    }],
  };
}

function gitFixture({
  extraOwner = false,
  revertedIntermediatePath = false,
  prExtraOwner = false,
  branchHead = headSha,
  candidateMergeBase = baseSha,
} = {}) {
  return async args => {
    if (args[0] === 'show-ref') return `${branchHead}\n`;
    if (args[0] === 'cat-file') return '';
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') return '';
    if (args[0] === 'merge-base') return `${candidateMergeBase}\n`;
    if (args[0] === 'rev-list') {
      return `${headSha} ${baseSha}\n`;
    }
    if (args[0] === 'diff-tree') {
      return [
        topicFile,
        candidateTestFile,
        ...(extraOwner ? ['README.md'] : []),
        ...(revertedIntermediatePath ? ['README.md'] : []),
        '',
      ].join('\n');
    }
    if (args[0] === 'diff') {
      const isPrRange = args.at(-1).includes('...');
      return [
        topicFile,
        candidateTestFile,
        ...(extraOwner ? ['README.md'] : []),
        ...(isPrRange && prExtraOwner ? ['README.md'] : []),
        '',
      ].join('\n');
    }
    if (args[0] === 'show') {
      if (
        args[1].endsWith(
          ':artifacts/publication/coverage/coverage-expansion-plan.json',
        )
      ) {
        return JSON.stringify(requiredPlan());
      }
      return JSON.stringify(
        args[1].startsWith(baseSha) ? topic(false) : topic(true),
      );
    }
    throw new Error(`예상하지 않은 git 호출: ${args.join(' ')}`);
  };
}

test('coverage task packet과 Git 후보를 결박해 awaiting_pr 항목을 만든다', async () => {
  const item = await buildImportedCoverageProductionWorkItem(candidateSpec(), {
    runGit: gitFixture(),
  });
  assert.equal(item.status, 'awaiting_pr');
  assert.equal(item.direct_merge, false);
  assert.equal(item.pr_number, undefined);
  assert.equal(item.head_sha, undefined);
  assert.equal(item.topic_file, topicFile);
  assert.equal(item.test_file, candidateTestFile);
  assert.deepEqual(item.candidate_import.added_content_ids, [
    'content.deposit-refund-response-map',
  ]);
  assert.equal(item.candidate_import.source_base_sha, baseSha);
  assert.equal(item.candidate_import.source_head_sha, headSha);
  assert.equal(item.candidate_import.required_pr_base_sha, requiredPrBaseSha);
  assert.equal(item.candidate_import.candidate_pr_merge_base_sha, baseSha);
  assert.deepEqual(item.candidate_import.range_commit_shas, [headSha]);
  assert.deepEqual(item.candidate_import.range_changed_files, [
    topicFile,
    candidateTestFile,
  ].sort());
  assert.deepEqual(
    item.candidate_import.pr_changed_files,
    item.candidate_import.range_changed_files,
  );
  assert.equal(item.candidate_import.owner_scope_state, 'repackaging_required');
  assert.equal(
    item.counts.content_entries,
    PRODUCTION_WORK_CONTRACTS[workId].target_content_ids.length + 1,
  );
  assert.ok(item.prerequisite_gates.every(gate => gate.status === 'pending'));
  assert.ok(item.release_checks.every(check => check.status === 'pending'));
});

test('coverage 후보가 topic+test 두 파일을 넘으면 등록을 거부한다', async () => {
  await assert.rejects(
    buildImportedCoverageProductionWorkItem(candidateSpec(), {
      runGit: gitFixture({extraOwner: true}),
    }),
    /topic\+전용 test 정확히 2파일/u,
  );
});

test('candidate base와 head가 같으면 등록을 거부한다', async () => {
  await assert.rejects(
    buildImportedCoverageProductionWorkItem({
      ...candidateSpec(),
      source_head_sha: baseSha,
    }, {runGit: gitFixture()}),
    /base\/head 경계/u,
  );
});

test('source_branch가 source_head_sha를 직접 가리키지 않으면 등록을 거부한다', async () => {
  await assert.rejects(
    buildImportedCoverageProductionWorkItem(candidateSpec(), {
      runGit: gitFixture({branchHead: '4'.repeat(40)}),
    }),
    /source_branch ref가 source_head_sha와 다릅니다/u,
  );
});

test('임의 branch 문자열과 commit 문자열은 Git 조회 전에 거부한다', async () => {
  await assert.rejects(
    buildImportedCoverageProductionWorkItem({
      ...candidateSpec(),
      source_branch: 'main;echo forged',
      source_head_sha: 'not-a-commit',
    }, {runGit: gitFixture()}),
    /40자리 commit SHA|source_branch가 올바르지 않습니다/u,
  );
});

test('required PR base가 source base 및 실제 merge-base와 exact 다르면 거부한다', async () => {
  await assert.rejects(
    buildImportedCoverageProductionWorkItem({
      ...candidateSpec(),
      required_pr_base_sha: mismatchedPrBaseSha,
    }, {
      runGit: gitFixture({candidateMergeBase: baseSha}),
    }),
    /source_base_sha·required_pr_base_sha·실제 PR merge-base가 exact/u,
  );
});

test('최종 diff가 exact2여도 실제 PR 3-dot에 추가 파일이 있으면 거부한다', async () => {
  await assert.rejects(
    buildImportedCoverageProductionWorkItem(candidateSpec(), {
      runGit: gitFixture({prExtraOwner: true}),
    }),
    /실제 PR 3-dot 변경범위와 candidate 범위가 다릅니다/u,
  );
});

test('중간 commit에서 금지 경로를 바꿨다가 되돌려도 등록을 거부한다', async () => {
  await assert.rejects(
    buildImportedCoverageProductionWorkItem(candidateSpec(), {
      runGit: gitFixture({revertedIntermediatePath: true}),
    }),
    /commit별 changed-path union과 최종 diff가 다릅니다/u,
  );
});

test('coverage task는 후보 증거 없는 일반 planned 등록을 거부한다', () => {
  assert.throws(
    () => buildPlannedProductionWorkItem(workId),
    /--coverage-candidates/u,
  );
});

test('append-only contract hash가 바뀌면 queue 검증이 거부한다', async () => {
  const [queue, registry] = await Promise.all([
    readFile(
      new URL('../../../artifacts/publication/production-queue.json', import.meta.url),
      'utf8',
    ).then(JSON.parse),
    readFile(
      new URL('../../../artifacts/publication/production-queue-registry.json', import.meta.url),
      'utf8',
    ).then(JSON.parse),
  ]);
  const target = queue.items.find(item => item.work_id === workId);
  target.candidate_import.source_head_sha = 'f'.repeat(40);
  const errors = validateProductionQueue(queue, {itemRegistry: registry});
  assert.ok(errors.some(error => (
    error.includes('append-only registry') ||
    error.includes('contract_sha256')
  )));
});

test('queue와 registry를 함께 위조해 self-hash해도 독립 Git proof 없이는 거부한다', async () => {
  const [queue, registry] = await Promise.all([
    readFile(
      new URL('../../../artifacts/publication/production-queue.json', import.meta.url),
      'utf8',
    ).then(JSON.parse),
    readFile(
      new URL('../../../artifacts/publication/production-queue-registry.json', import.meta.url),
      'utf8',
    ).then(JSON.parse),
  ]);
  const target = queue.items.find(item => (
    item.work_id ===
    'coverage-expansion-family-inheritance-kr-knowledge-core-20260726-024'
  ));
  target.candidate_import.source_head_sha = 'f'.repeat(40);
  const registration = registry.registrations.find(entry => (
    entry.work_id === target.work_id
  ));
  registration.contract_sha256 = coverageCandidateContractReceipt(target);
  delete registration.receipt;
  registration.receipt = topicReceipt(registration);
  registry.registry_receipt = registration.receipt;

  const errors = validateProductionQueue(queue, {itemRegistry: registry});
  assert.ok(!errors.some(error => error.includes('append-only registry')));
  assert.ok(errors.some(error => error.includes('독립 Git·planner 재검증')));
});

test('실제 PR 결박 전 migration_required로 상태만 바꾸면 거부한다', async () => {
  const [queue, registry] = await Promise.all([
    readFile(
      new URL('../../../artifacts/publication/production-queue.json', import.meta.url),
      'utf8',
    ).then(JSON.parse),
    readFile(
      new URL('../../../artifacts/publication/production-queue-registry.json', import.meta.url),
      'utf8',
    ).then(JSON.parse),
  ]);
  const target = queue.items.find(item => item.work_id === workId);
  target.status = 'migration_required';
  const errors = validateProductionQueue(queue, {itemRegistry: registry});
  assert.ok(errors.some(error => error.includes('실제 PR 결박 전 awaiting_pr')));
});
