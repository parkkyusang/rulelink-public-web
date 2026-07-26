import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  buildImportedCoverageProductionWorkItem,
  buildPlannedProductionWorkItem,
} from './register-publication-production-work.mjs';
import {
  PRODUCTION_WORK_CONTRACTS,
  validateProductionQueue,
} from './validate-publication-production-queue.mjs';

const workId =
  'coverage-expansion-housing-lease-deposit-kr-knowledge-core-20260726-024';
const baseSha = '1'.repeat(40);
const headSha = '2'.repeat(40);
const requiredPrBaseSha = '3'.repeat(40);
const topicFile =
  'artifacts/publication/topics/housing-lease-deposit.json';
const candidateTestFile =
  'web/rulelink_public_next/scripts/housing-lease-deposit-response-map-topic.test.mjs';

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
    source_branch: 'codex/content-wave-025-20260726',
    source_base_sha: baseSha,
    source_head_sha: headSha,
    required_pr_base_sha: requiredPrBaseSha,
  };
}

function gitFixture({extraOwner = false} = {}) {
  return async args => {
    if (args[0] === 'cat-file' || args[0] === 'merge-base') return '';
    if (args[0] === 'diff') {
      return [
        topicFile,
        candidateTestFile,
        ...(extraOwner ? ['README.md'] : []),
        '',
      ].join('\n');
    }
    if (args[0] === 'show') {
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
