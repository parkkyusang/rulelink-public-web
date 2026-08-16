import assert from 'node:assert/strict';
import {access, mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {prepareNewTopicCandidateManifest} from './validate-topic-candidate-pr.mjs';
import {
  inspectTopicCandidateV3PullRequest,
  topicCandidateV3ContractReceipt,
  validateTopicCandidateV3QueueContract,
} from './topic-candidate-v3-contract.mjs';

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const sourceBaseSha = 'c'.repeat(40);
const sourceHeadSha = 'd'.repeat(40);
const topicFile = 'artifacts/publication/topics/fixture-topic.json';
const testFile =
  'web/rulelink_public_next/scripts/fixture-topic-contract.test.mjs';
const regressionFile =
  'web/rulelink_public_next/scripts/fixture-topic-regression.test.mjs';
const topicBlob = '1'.repeat(40);
const testBlob = '2'.repeat(40);
const regressionBlob = '3'.repeat(40);

function clone(value) {
  return structuredClone(value);
}

function fixture({kind = 'existing_topic', withSupersede = true} = {}) {
  const item = {
    queue_id: 'publication-work-fixture-v3',
    work_id: 'fixture-v3',
    title_ko: '검증용 주제 후보',
    topic_id: 'hub.fixture-topic',
    topic_file: topicFile,
    test_file: testFile,
    change_mode:
      kind === 'new_topic' ? 'new_topic' : 'existing_topic_revision',
    status: 'awaiting_pr',
    counts: {
      sources: 0,
      rule_cards: 0,
      scenario_branches: 0,
      content_entries: 0,
      topic_hubs: 1,
      authority_units: 0,
    },
    quality_targets: {},
    prerequisite_gates: [{
      gate_id: 'quality.fixture-approved',
      gate_kind: 'quality_schema',
      owner_role: 'quality_governance',
      status: 'pending',
    }],
    release_checks: [{
      check_id: 'canonical-urls-unchanged',
      status: 'pending',
    }],
    depends_on_work_ids: [],
    integration_checks: ['등록된 v3 후보를 publication migration으로 이관한다.'],
    direct_merge: false,
    integrate_requires: [
      'current_bundle',
      'new_immutable_snapshot',
      'migrate_publication',
    ],
    supersedes_work_ids: withSupersede ? ['fixture-v2'] : [],
    candidate_import: {
      schema: 'rulelink_topic_candidate_import_v3',
      state: 'approved_source',
      lifecycle_gate: 'awaiting_pr',
      candidate_kind: kind,
      approved_source_base_sha: sourceBaseSha,
      approved_source_head_sha: sourceHeadSha,
      approved_files: [
        {path: topicFile, blob_sha: topicBlob},
        {path: testFile, blob_sha: testBlob},
        {path: regressionFile, blob_sha: regressionBlob},
      ],
      additional_regression_test_files: [regressionFile],
      topic_before_sha256:
        kind === 'new_topic' ? null : '4'.repeat(64),
      topic_after_sha256: '5'.repeat(64),
      expected_counts: {
        sources: 0,
        rule_cards: 0,
        scenario_branches: 0,
        content_entries: 0,
        topic_hubs: 1,
        authority_units: 0,
      },
      expected_quality_targets: {},
      expected_depends_on_work_ids: [],
      expected_integration_checks: [
        '등록된 v3 후보를 publication migration으로 이관한다.',
      ],
      expected_prerequisite_gates: [{
        gate_id: 'quality.fixture-approved',
        gate_kind: 'quality_schema',
        owner_role: 'quality_governance',
        verification_method: 'github_merged_head',
        evidence_pattern:
          '^parkkyusang/rulelink-public-web#\\d+@[0-9a-f]{40}$',
        evidence_pattern_flags: 'u',
      }],
      expected_release_check_ids: ['canonical-urls-unchanged'],
    },
  };
  const oldItem = {
    queue_id: 'publication-work-fixture-v2',
    work_id: 'fixture-v2',
    title_ko: '이전 후보',
    topic_id: item.topic_id,
    topic_file: item.topic_file,
    test_file: item.test_file,
    change_mode: item.change_mode,
    status: 'withdrawn',
    terminal_reason_ko: '비순환 v3 계약으로 대체합니다.',
    superseded_by_work_id: item.work_id,
    candidate_import: {
      schema: 'rulelink_existing_topic_candidate_import_v2',
      source_head_sha: '6'.repeat(40),
    },
  };
  const queue = {
    schema: 'rulelink_publication_production_queue_v1',
    items: withSupersede ? [oldItem, item] : [item],
  };
  const registry = {
    schema: 'rulelink_publication_queue_item_registry_v1',
    registrations: [{
      sequence: 1,
      queue_id: item.queue_id,
      work_id: item.work_id,
      contract_sha256: topicCandidateV3ContractReceipt(item),
    }],
  };
  return {item, oldItem, queue, registry};
}

function makeRunGit({
  queue,
  registry,
  manifestTopic = true,
  currentTopic = true,
  sourceFiles = [topicFile, testFile, regressionFile],
  sourceBlobs = {},
} = {}) {
  const manifest = {
    schema: 'rulelink_public_knowledge_manifest_v1',
    knowledge_schema: 'rulelink_public_knowledge_index_v1',
    topics: manifestTopic
      ? [{topic_id: 'hub.fixture-topic', file: 'fixture-topic.json'}]
      : [],
  };
  const current = {
    knowledge: {
      topic_hubs: currentTopic ? [{hub_id: 'hub.fixture-topic'}] : [],
    },
  };
  const topic = {
    topic_id: 'hub.fixture-topic',
    topic_hubs: [{hub_id: 'hub.fixture-topic'}],
    sources: [],
    rule_cards: [],
    scenario_branches: [],
    content_entries: [],
    authority_reading_units: [],
  };
  const blobs = {
    [topicFile]: topicBlob,
    [testFile]: testBlob,
    [regressionFile]: regressionBlob,
    ...sourceBlobs,
  };
  const validCommits = new Set([
    baseSha,
    headSha,
    sourceBaseSha,
    sourceHeadSha,
  ]);
  return async args => {
    const key = args.join(' ');
    if (args[0] === 'show' && args[1] === `${baseSha}:artifacts/publication/production-queue.json`) {
      return JSON.stringify(queue);
    }
    if (args[0] === 'show' && args[1] === `${baseSha}:artifacts/publication/production-queue-registry.json`) {
      return JSON.stringify(registry);
    }
    if (args[0] === 'show' && args[1] === `${baseSha}:artifacts/publication/topics/manifest.json`) {
      return JSON.stringify(manifest);
    }
    if (args[0] === 'show' && args[1] === `${baseSha}:artifacts/publication/current/bundle.json`) {
      return JSON.stringify(current);
    }
    if (args[0] === 'show' && args[1] === `${headSha}:${topicFile}`) {
      return JSON.stringify(topic);
    }
    if (args[0] === 'cat-file') {
      const commit = args[2].replace(/\^\{commit\}$/u, '');
      if (!validCommits.has(commit)) throw new Error(`unknown commit ${commit}`);
      return '';
    }
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') return '';
    if (args[0] === 'diff' && args[1] === '--name-only') {
      return `${sourceFiles.join('\n')}\n`;
    }
    if (args[0] === 'rev-list') return `${headSha} ${baseSha}\n`;
    if (args[0] === 'rev-parse') {
      const [commit, file] = args[1].split(':');
      if (commit !== sourceHeadSha && commit !== headSha) {
        throw new Error(`unexpected blob commit ${commit}`);
      }
      return `${blobs[file]}\n`;
    }
    throw new Error(`unexpected git call: ${key}`);
  };
}

test('v3 계약은 승인 source blob을 현재 PR에 재포장하고 actual head를 실행 시 관측한다', async () => {
  const {queue, registry} = fixture();
  assert.deepEqual(
    validateTopicCandidateV3QueueContract(queue, {itemRegistry: registry}),
    [],
  );
  const result = await inspectTopicCandidateV3PullRequest({
    baseSha,
    headSha,
    actualFiles: [topicFile, testFile, regressionFile],
    changedTopics: [topicFile],
    runGit: makeRunGit({queue, registry}),
  });
  assert.equal(result.reason, 'registered_topic_candidate_v3');
  assert.deepEqual(result.workIds, ['fixture-v3']);
});

test('승인 source blob·head·base 위조를 각각 차단한다', async () => {
  const cases = [
    candidate => {
      candidate.approved_files[0].blob_sha = '9'.repeat(40);
    },
    candidate => {
      candidate.approved_source_head_sha = '8'.repeat(40);
    },
    candidate => {
      candidate.approved_source_base_sha = '7'.repeat(40);
    },
  ];
  for (const mutate of cases) {
    const state = fixture();
    mutate(state.item.candidate_import);
    state.registry.registrations[0].contract_sha256 =
      topicCandidateV3ContractReceipt(state.item);
    await assert.rejects(
      inspectTopicCandidateV3PullRequest({
        baseSha,
        headSha,
        actualFiles: [topicFile, testFile, regressionFile],
        changedTopics: [topicFile],
        runGit: makeRunGit(state),
      }),
    );
  }
});

test('양방향 supersede가 없거나 종료 후보만 재사용하면 차단한다', async () => {
  const missingReverse = fixture();
  delete missingReverse.oldItem.superseded_by_work_id;
  assert.ok(
    validateTopicCandidateV3QueueContract(missingReverse.queue, {
      itemRegistry: missingReverse.registry,
    }).some(error => error.includes('양방향')),
  );

  const stale = fixture();
  stale.item.status = 'withdrawn';
  stale.item.terminal_reason_ko = '종료';
  stale.registry.registrations[0].contract_sha256 =
    topicCandidateV3ContractReceipt(stale.item);
  await assert.rejects(
    inspectTopicCandidateV3PullRequest({
      baseSha,
      headSha,
      actualFiles: [topicFile, testFile, regressionFile],
      changedTopics: [topicFile],
      runGit: makeRunGit(stale),
    }),
    /역참조/u,
  );
});

test('v3 불변 계약 영수증은 상태 전이를 허용하되 계약 본문 변경은 차단한다', () => {
  const state = fixture();
  const registeredReceipt = topicCandidateV3ContractReceipt(state.item);
  for (const status of ['blocked', 'withdrawn', 'superseded']) {
    const transitioned = clone(state.item);
    transitioned.status = status;
    assert.equal(
      topicCandidateV3ContractReceipt(transitioned),
      registeredReceipt,
    );
  }
  const rewritten = clone(state.item);
  rewritten.quality_targets = {...rewritten.quality_targets, verified_after: 1};
  assert.notEqual(
    topicCandidateV3ContractReceipt(rewritten),
    registeredReceipt,
  );
});

test('integrated v3 후보는 허용 상태지만 같은 주제의 새 활성 후보를 막지 않는다', () => {
  const state = fixture();
  state.item.status = 'integrated';
  const next = clone(state.item);
  next.queue_id = 'publication-work-fixture-v3-next';
  next.work_id = 'fixture-v3-next';
  next.status = 'awaiting_pr';
  next.supersedes_work_ids = [];
  next.candidate_import.approved_source_base_sha = '7'.repeat(40);
  next.candidate_import.approved_source_head_sha = '8'.repeat(40);
  next.candidate_import.approved_files = [
    {path: topicFile, blob_sha: '9'.repeat(40)},
    {path: testFile, blob_sha: 'a'.repeat(40)},
    {path: regressionFile, blob_sha: 'b'.repeat(40)},
  ];
  next.candidate_import.topic_before_sha256 = 'c'.repeat(64);
  next.candidate_import.topic_after_sha256 = 'd'.repeat(64);
  state.queue.items.push(next);
  state.registry.registrations.push({
    sequence: 2,
    queue_id: next.queue_id,
    work_id: next.work_id,
    contract_sha256: topicCandidateV3ContractReceipt(next),
  });
  assert.deepEqual(
    validateTopicCandidateV3QueueContract(state.queue, {
      itemRegistry: state.registry,
    }),
    [],
  );
});

test('v3 게이트 검증 방식과 release check ID는 지원되는 계약만 허용한다', () => {
  const cases = [
    candidate => {
      candidate.expected_prerequisite_gates[0].verification_method =
        'github_merged_haed';
    },
    candidate => {
      candidate.expected_release_check_ids = ['canonical-url-unchanged'];
    },
  ];
  for (const mutate of cases) {
    const state = fixture();
    mutate(state.item.candidate_import);
    state.registry.registrations[0].contract_sha256 =
      topicCandidateV3ContractReceipt(state.item);
    assert.notDeepEqual(
      validateTopicCandidateV3QueueContract(state.queue, {
        itemRegistry: state.registry,
      }),
      [],
    );
  }
});

test('등록되지 않은 추가 회귀시험을 PR에 끼워 넣을 수 없다', async () => {
  const state = fixture();
  await assert.rejects(
    inspectTopicCandidateV3PullRequest({
      baseSha,
      headSha,
      actualFiles: [
        topicFile,
        testFile,
        regressionFile,
        'web/rulelink_public_next/scripts/unregistered.test.mjs',
      ],
      changedTopics: [topicFile],
      runGit: makeRunGit(state),
    }),
    /미등록 파일/u,
  );
});

test('신규 주제가 base current 또는 manifest와 충돌하면 차단한다', async () => {
  const state = fixture({kind: 'new_topic', withSupersede: false});
  await assert.rejects(
    inspectTopicCandidateV3PullRequest({
      baseSha,
      headSha,
      actualFiles: [topicFile, testFile, regressionFile],
      changedTopics: [topicFile],
      runGit: makeRunGit({
        ...state,
        manifestTopic: false,
        currentTopic: true,
      }),
    }),
    /충돌/u,
  );
  const result = await inspectTopicCandidateV3PullRequest({
    baseSha,
    headSha,
    actualFiles: [topicFile, testFile, regressionFile],
    changedTopics: [topicFile],
    runGit: makeRunGit({
      ...state,
      manifestTopic: false,
      currentTopic: false,
    }),
  });
  assert.equal(result.expectedTopics[0].candidateKind, 'new_topic');
});

test('v3 생산계약은 선행 게이트와 출시 점검의 누락·위조를 차단한다', () => {
  const mutations = [
    item => item.prerequisite_gates.pop(),
    item => {
      item.prerequisite_gates[0].owner_role = 'content_production';
    },
    item => item.release_checks.pop(),
    item => {
      item.release_checks[0].check_id = 'runtime-responsive-no-overflow';
    },
  ];
  for (const mutate of mutations) {
    const state = fixture();
    mutate(state.item);
    state.registry.registrations[0].contract_sha256 =
      topicCandidateV3ContractReceipt(state.item);
    assert.notDeepEqual(
      validateTopicCandidateV3QueueContract(state.queue, {
        itemRegistry: state.registry,
      }),
      [],
    );
  }
});

test('신규 주제 후보 manifest는 기존 상대경로를 보존한 격리 합성 트리를 만든다', async () => {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-topic-candidate-v3-manifest-'),
  );
  try {
    const candidateManifestPath = await prepareNewTopicCandidateManifest({
      tempRoot,
      newTopics: [
        {
          topicId: 'hub.fixture-new-topic',
          topicFile:
            'artifacts/publication/topics/administrative-appeals.json',
        },
      ],
    });
    const manifest = JSON.parse(
      await readFile(candidateManifestPath, 'utf8'),
    );
    assert.equal(
      path.dirname(candidateManifestPath),
      path.join(tempRoot, 'publication', 'topics'),
    );
    for (const descriptor of manifest.topics ?? []) {
      await access(
        path.join(path.dirname(candidateManifestPath), descriptor.file),
      );
    }
    await access(path.join(tempRoot, 'publication', 'concepts'));
    assert.deepEqual(manifest.topics.at(-1), {
      topic_id: 'hub.fixture-new-topic',
      file: 'administrative-appeals.json',
    });
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});
