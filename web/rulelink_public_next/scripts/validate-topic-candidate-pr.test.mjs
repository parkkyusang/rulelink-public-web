import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  assertTrackedStateUnchanged,
  classifyTopicCandidatePullRequest,
  composeTopicCandidateBundle,
  validateCandidate,
} from './validate-topic-candidate-pr.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const topicFile = 'artifacts/publication/topics/example-topic.json';
const testFile =
  'web/rulelink_public_next/scripts/example-topic-candidate.test.mjs';

function queueFixture() {
  return {
    schema: 'rulelink_publication_production_queue_v1',
    items: [
      {
        work_id: 'coverage-example',
        status: 'awaiting_pr',
        direct_merge: false,
        change_mode: 'existing_topic_revision',
        topic_file: topicFile,
        test_file: testFile,
        counts: {
          sources: 1,
          rule_cards: 1,
          scenario_branches: 1,
          content_entries: 1,
          topic_hubs: 1,
          authority_units: 1,
        },
        integrate_requires: [
          'current_bundle',
          'new_immutable_snapshot',
          'migrate_publication',
        ],
        candidate_import: {
          schema: 'rulelink_existing_topic_candidate_import_v2',
          lifecycle_gate: 'awaiting_pr',
          source_base_sha: baseSha,
          source_head_sha: headSha,
          required_pr_base_sha: baseSha,
          candidate_pr_merge_base_sha: baseSha,
          range_commit_shas: [headSha],
          pr_changed_files: [topicFile, testFile],
          expected_counts: {
            sources: 1,
            rule_cards: 1,
            scenario_branches: 1,
            content_entries: 1,
            topic_hubs: 1,
            authority_units: 1,
          },
        },
      },
    ],
  };
}

function gitFixture({
  files = [topicFile, testFile],
  mergeBase = baseSha,
  commits = [`${headSha} ${baseSha}`],
} = {}) {
  return async args => {
    const command = args.join(' ');
    if (args[0] === 'cat-file') return '';
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') return '';
    if (args[0] === 'merge-base') return `${mergeBase}\n`;
    if (args[0] === 'diff' && args[1] === '--name-status') {
      return `${files.map(file => `M\t${file}`).join('\n')}\n`;
    }
    if (args[0] === 'rev-list') return `${commits.join('\n')}\n`;
    throw new Error(`unexpected git call: ${command}`);
  };
}

test('등록된 topic+test exact 범위만 후보 게이트로 분류한다', async () => {
  const result = await classifyTopicCandidatePullRequest({
    baseSha,
    headSha,
    headRef: 'codex/content-example-20260727',
    queue: queueFixture(),
    runGit: gitFixture(),
  });
  assert.equal(result.mode, 'candidate');
  assert.deepEqual(result.changedFiles, [topicFile, testFile].sort());
  assert.deepEqual(result.workIds, ['coverage-example']);
});

test('등록 범위 밖 파일이 하나라도 있으면 후보 게이트를 통과하지 못한다', async () => {
  await assert.rejects(
    classifyTopicCandidatePullRequest({
      baseSha,
      headSha,
      headRef: 'codex/content-example-20260727',
      queue: queueFixture(),
      runGit: gitFixture({files: [topicFile, testFile, 'README.md']}),
    }),
    /등록된 후보 범위와 실제 PR 범위가 다릅니다/u,
  );
});

test('대기열 counts와 후보 expected_counts가 다르면 fail-closed다', async () => {
  const queue = queueFixture();
  queue.items[0].counts.content_entries = 2;
  await assert.rejects(
    classifyTopicCandidatePullRequest({
      baseSha,
      headSha,
      headRef: 'codex/content-example-20260727',
      queue,
      runGit: gitFixture(),
    }),
    /대기열 counts와 후보 expected_counts가 다릅니다/u,
  );
});

test('후보 검증의 성공·실패와 무관하게 tracked 상태 변화는 hard fail한다', () => {
  assert.doesNotThrow(() =>
    assertTrackedStateUnchanged(' M existing.txt\n', ' M existing.txt\n'),
  );
  assert.throws(
    () =>
      assertTrackedStateUnchanged(
        ' M existing.txt\n',
        ' M existing.txt\n M validator-write.txt\n',
      ),
    /성공 여부와 무관하게/u,
  );
});

test('current·snapshot·queue 이관 PR은 후보 게이트로 우회하지 못한다', async () => {
  const result = await classifyTopicCandidatePullRequest({
    baseSha,
    headSha,
    headRef: 'codex/integrate-publication-example',
    queue: queueFixture(),
    runGit: gitFixture({
      files: [
        topicFile,
        'artifacts/publication/current/bundle.json',
        'artifacts/publication/snapshots/example/bundle.json',
      ],
    }),
  });
  assert.equal(result.mode, 'standard');
  assert.equal(result.reason, 'publication_migration_or_queue_change');
});

test('실제 PR base·merge-base·head ref가 다르면 fail-closed다', async () => {
  await assert.rejects(
    classifyTopicCandidatePullRequest({
      baseSha,
      headSha,
      headRef: 'feature/unregistered',
      queue: queueFixture(),
      runGit: gitFixture(),
    }),
    /codex\/content-\*/u,
  );
  await assert.rejects(
    classifyTopicCandidatePullRequest({
      baseSha,
      headSha,
      headRef: 'codex/content-example-20260727',
      queue: queueFixture(),
      runGit: gitFixture({mergeBase: 'c'.repeat(40)}),
    }),
    /merge-base/u,
  );
});

test('임시 합성 번들의 source 참조 누락은 실제 bundle validator가 차단한다', async () => {
  await withCandidate(async ({candidatePath, candidate}) => {
    const rule = candidate.knowledge.rule_cards.find(
      value => value.source_coordinate_ids?.length,
    );
    assert.ok(rule);
    const removedSourceId = rule.source_coordinate_ids[0];
    candidate.knowledge.sources = candidate.knowledge.sources.filter(
      value => value.coordinate_id !== removedSourceId,
    );
    await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
    const result = runBundleValidator(candidatePath);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /source_coordinate_ids|존재하지 않는 참조/u,
    );
  });
});

test('임시 합성 번들의 authority anchor 변조는 실제 authority validator가 차단한다', async () => {
  await withCandidate(async ({candidatePath, candidate}) => {
    const reading = candidate.knowledge.authority_reading_units.find(
      value => value.anchors?.length,
    );
    assert.ok(reading);
    reading.anchors[0].official_text_hash = '0'.repeat(64);
    await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
    const result = spawnSync(
      process.execPath,
      [
        path.join(scriptDirectory, 'validate-public-authority-reading.mjs'),
        candidatePath,
      ],
      {cwd: path.resolve(scriptDirectory, '..'), encoding: 'utf8'},
    );
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /official_text_hash|anchor/u,
    );
  });
});

test('임시 합성 번들의 authority reading 누락은 실제 authority validator가 차단한다', async () => {
  await withCandidate(async ({candidatePath, candidate}) => {
    const reading = candidate.knowledge.authority_reading_units.find(
      value => value.anchors?.length,
    );
    assert.ok(reading);
    candidate.knowledge.authority_reading_units =
      candidate.knowledge.authority_reading_units.filter(
        value => value.authority_reading_unit_id !== reading.authority_reading_unit_id,
      );
    await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
    const result = spawnSync(
      process.execPath,
      [
        path.join(scriptDirectory, 'validate-public-authority-reading.mjs'),
        candidatePath,
      ],
      {cwd: path.resolve(scriptDirectory, '..'), encoding: 'utf8'},
    );
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /authority_reading_unit|binding|존재하지/u,
    );
  });
});

test('후보 검증은 임시 디렉터리를 남기거나 tracked 파일을 바꾸지 않는다', async () => {
  const manifestPath = path.join(
    repositoryRoot,
    'artifacts',
    'publication',
    'topics',
    'manifest.json',
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const selected = manifest.topics[0];
  const topicFile = `artifacts/publication/topics/${selected.file}`;
  const topic = JSON.parse(
    await readFile(path.join(repositoryRoot, topicFile), 'utf8'),
  );
  const classification = {
    mode: 'candidate',
    topicFiles: [topicFile],
    expectedTopics: [
      {
        workId: 'fixture.dynamic-topic',
        topicId: topic.topic_id,
        topicFile,
        counts: {
          sources: topic.sources?.length ?? 0,
          rule_cards: topic.rule_cards?.length ?? 0,
          scenario_branches: topic.scenario_branches?.length ?? 0,
          content_entries: topic.content_entries?.length ?? 0,
          topic_hubs: topic.topic_hubs?.length ?? 0,
          authority_units: topic.authority_reading_units?.length ?? 0,
        },
      },
    ],
  };
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-topic-gate-output-'),
  );
  const outputPath = path.join(tempRoot, 'candidate.json');
  const before = (await readdir(os.tmpdir()))
    .filter(name => name.startsWith('rulelink-topic-candidate-'))
    .sort();
  try {
    const result = await validateCandidate({
      classification,
      headSha,
      outputPath,
    });
    assert.equal(result.candidatePath, outputPath);
    const after = (await readdir(os.tmpdir()))
      .filter(name => name.startsWith('rulelink-topic-candidate-'))
      .sort();
    assert.deepEqual(after, before);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});

async function withCandidate(callback) {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-topic-gate-test-'),
  );
  const candidatePath = path.join(tempRoot, 'candidate.json');
  try {
    const candidate = await composeTopicCandidateBundle({
      headSha,
      builtAt: new Date().toISOString(),
    });
    await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
    await callback({candidatePath, candidate});
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
}

function runBundleValidator(candidatePath) {
  return spawnSync(
    process.execPath,
    [path.join(scriptDirectory, 'validate-publication-bundle.mjs')],
    {
      cwd: path.resolve(scriptDirectory, '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        RULELINK_WEB_BUNDLE_PATH: candidatePath,
        RULELINK_REQUIRE_PUBLICATION_BUNDLE: 'true',
      },
    },
  );
}
