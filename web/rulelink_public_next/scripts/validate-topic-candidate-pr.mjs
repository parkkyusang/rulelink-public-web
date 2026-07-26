import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {appendFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  applyKnowledgeComposition,
  loadComposition,
} from './compose-publication-knowledge.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const webRoot = path.resolve(scriptDirectory, '..');
const repositoryRoot = path.resolve(webRoot, '..', '..');
const defaultQueuePath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'production-queue.json',
);
const defaultCurrentPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);
const defaultManifestPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'topics',
  'manifest.json',
);
const candidateSchema = 'rulelink_existing_topic_candidate_import_v2';
const candidateHeadPattern = /^codex\/content-[a-z0-9._/-]+$/u;
const topicPathPattern =
  /^artifacts\/publication\/topics\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u;
const testPathPattern =
  /^web\/rulelink_public_next\/scripts\/[a-z0-9]+(?:-[a-z0-9]+)*\.test\.mjs$/u;
const migrationOwnedPaths = Object.freeze([
  'artifacts/publication/current/bundle.json',
  'artifacts/publication/topics/manifest.json',
  'artifacts/publication/production-queue.json',
  'artifacts/publication/production-queue-registry.json',
  'artifacts/publication/release.json',
  'web/rulelink_public_next/deploy/release.json',
]);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function splitLines(value) {
  return String(value ?? '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean);
}

function sorted(values) {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, 'en'),
  );
}

function isMigrationOwnedPath(filePath) {
  return (
    migrationOwnedPaths.includes(filePath) ||
    filePath.startsWith('artifacts/publication/snapshots/')
  );
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    canonicalJson(Object.keys(value).sort()) ===
    canonicalJson([...expected].sort())
  );
}

export async function classifyTopicCandidatePullRequest({
  baseSha,
  headSha,
  headRef,
  queue,
  runGit,
}) {
  for (const [field, value] of Object.entries({baseSha, headSha})) {
    if (!/^[0-9a-f]{40}$/u.test(value ?? '')) {
      throw new Error(`${field}는 40자리 Git commit SHA여야 합니다.`);
    }
  }
  if (typeof headRef !== 'string' || headRef.length === 0) {
    throw new Error('실제 pull request head ref가 필요합니다.');
  }
  if (!queue || queue.schema !== 'rulelink_publication_production_queue_v1') {
    throw new Error('생산 대기열 정본 형식이 올바르지 않습니다.');
  }
  if (typeof runGit !== 'function') {
    throw new Error('Git 검증 실행기가 필요합니다.');
  }

  for (const sha of [baseSha, headSha]) {
    await runGit(['cat-file', '-e', `${sha}^{commit}`]);
  }
  const mergeBase = String(
    await runGit(['merge-base', baseSha, headSha]),
  ).trim();
  if (mergeBase !== baseSha) {
    throw new Error(
      `pull request merge-base가 실제 base SHA와 다릅니다: ${mergeBase}`,
    );
  }

  const statusRows = splitLines(
    await runGit([
      'diff',
      '--name-status',
      '--find-renames=100%',
      `${baseSha}..${headSha}`,
    ]),
  );
  if (statusRows.length === 0) {
    throw new Error('pull request 변경 파일이 없습니다.');
  }
  const changedFiles = [];
  for (const row of statusRows) {
    const [status, ...paths] = row.split('\t');
    if (!/^[AM]$/u.test(status) || paths.length !== 1) {
      throw new Error(
        `후보 게이트는 추가·수정 파일만 허용합니다: ${row}`,
      );
    }
    changedFiles.push(paths[0]);
  }
  const actualFiles = sorted(changedFiles);
  const changedTopics = actualFiles.filter(filePath =>
    topicPathPattern.test(filePath),
  );
  const migrationChange = actualFiles.some(isMigrationOwnedPath);

  if (migrationChange) {
    return {
      mode: 'standard',
      reason: 'publication_migration_or_queue_change',
      changedFiles: actualFiles,
      topicFiles: changedTopics,
      testFiles: actualFiles.filter(filePath => testPathPattern.test(filePath)),
      workIds: [],
    };
  }
  if (changedTopics.length === 0) {
    return {
      mode: 'standard',
      reason: 'non_topic_change',
      changedFiles: actualFiles,
      topicFiles: [],
      testFiles: [],
      workIds: [],
    };
  }
  if (!candidateHeadPattern.test(headRef)) {
    throw new Error(
      `topic-only 후보 pull request head는 codex/content-*여야 합니다: ${headRef}`,
    );
  }

  const registered = [];
  for (const topicFile of changedTopics) {
    const matches = (queue.items ?? []).filter(item =>
      item.topic_file === topicFile &&
      item.change_mode === 'existing_topic_revision' &&
      item.candidate_import?.schema === candidateSchema,
    );
    if (matches.length !== 1) {
      throw new Error(
        `${topicFile}에 정확히 하나의 등록된 기존 주제 후보가 필요합니다: ${matches.length}`,
      );
    }
    registered.push(matches[0]);
  }

  const expectedFiles = sorted(
    registered.flatMap(item => item.candidate_import.pr_changed_files ?? []),
  );
  if (canonicalJson(expectedFiles) !== canonicalJson(actualFiles)) {
    const expectedSet = new Set(expectedFiles);
    const actualSet = new Set(actualFiles);
    const extra = actualFiles.filter(filePath => !expectedSet.has(filePath));
    const missing = expectedFiles.filter(filePath => !actualSet.has(filePath));
    throw new Error(
      `등록된 후보 범위와 실제 PR 범위가 다릅니다: ` +
      `extra=${extra.join(',') || '-'} missing=${missing.join(',') || '-'}`,
    );
  }

  const expectedCommits = sorted(
    registered.flatMap(item => item.candidate_import.range_commit_shas ?? []),
  );
  const actualCommitRows = splitLines(
    await runGit([
      'rev-list',
      '--reverse',
      '--topo-order',
      '--parents',
      `${baseSha}..${headSha}`,
    ]),
  );
  const actualCommits = [];
  for (const row of actualCommitRows) {
    const [commitSha, ...parents] = row.split(/\s+/u);
    if (parents.length !== 1) {
      throw new Error(
        `topic-only 후보 범위에는 merge commit을 둘 수 없습니다: ${commitSha}`,
      );
    }
    actualCommits.push(commitSha);
  }
  if (
    canonicalJson(sorted(actualCommits)) !== canonicalJson(expectedCommits)
  ) {
    throw new Error(
      `등록된 후보 commit 집합과 실제 PR commit 집합이 다릅니다: ` +
      `expected=${expectedCommits.join(',')} actual=${actualCommits.join(',')}`,
    );
  }

  for (const item of registered) {
    const candidate = item.candidate_import;
    if (
      item.status !== 'awaiting_pr' ||
      item.direct_merge !== false ||
      candidate.lifecycle_gate !== 'awaiting_pr'
    ) {
      throw new Error(
        `${item.work_id}는 awaiting_pr·direct_merge=false 후보여야 합니다.`,
      );
    }
    if (
      candidate.required_pr_base_sha !== baseSha ||
      candidate.source_base_sha !== baseSha ||
      candidate.candidate_pr_merge_base_sha !== baseSha
    ) {
      throw new Error(
        `${item.work_id}의 등록 base/merge-base가 실제 PR base와 다릅니다.`,
      );
    }
    if (
      !Array.isArray(candidate.range_commit_shas) ||
      !candidate.range_commit_shas.includes(candidate.source_head_sha)
    ) {
      throw new Error(
        `${item.work_id}의 source head가 등록 commit 범위에 없습니다.`,
      );
    }
    await runGit([
      'merge-base',
      '--is-ancestor',
      candidate.source_head_sha,
      headSha,
    ]);
    if (
      !Array.isArray(item.integrate_requires) ||
      !['current_bundle', 'new_immutable_snapshot', 'migrate_publication']
        .every(value => item.integrate_requires.includes(value))
    ) {
      throw new Error(
        `${item.work_id}에 publication migration 요구사항이 닫히지 않았습니다.`,
      );
    }
    if (
      !exactKeys(candidate.expected_counts, [
        'sources',
        'rule_cards',
        'scenario_branches',
        'content_entries',
        'topic_hubs',
        'authority_units',
      ])
    ) {
      throw new Error(`${item.work_id}의 expected_counts 형식이 올바르지 않습니다.`);
    }
    if (
      canonicalJson(item.counts ?? {}) !==
      canonicalJson(candidate.expected_counts)
    ) {
      throw new Error(
        `${item.work_id}의 대기열 counts와 후보 expected_counts가 다릅니다.`,
      );
    }
    if (
      !candidate.pr_changed_files.includes(item.topic_file) ||
      !candidate.pr_changed_files.includes(item.test_file)
    ) {
      throw new Error(
        `${item.work_id}의 topic/test 파일이 등록 PR 범위에 없습니다.`,
      );
    }
  }

  return {
    mode: 'candidate',
    reason: 'registered_existing_topic_candidate',
    changedFiles: actualFiles,
    topicFiles: changedTopics,
    testFiles: registered.map(item => item.test_file),
    workIds: registered.map(item => item.work_id),
    expectedTopics: registered.map(item => ({
      workId: item.work_id,
      topicId: item.topic_id,
      topicFile: item.topic_file,
      counts: item.candidate_import.expected_counts,
    })),
  };
}

export async function composeTopicCandidateBundle({
  currentPath = defaultCurrentPath,
  manifestPath = defaultManifestPath,
  headSha,
  builtAt = new Date().toISOString(),
}) {
  const current = JSON.parse(await readFile(currentPath, 'utf8'));
  const snapshotId = `${current.snapshot_id}-candidate-${headSha.slice(0, 12)}`;
  const {knowledge, changeComposition} = await loadComposition(manifestPath, {
    snapshotId,
  });
  return applyKnowledgeComposition(
    {
      ...current,
      snapshot_id: snapshotId,
      built_at: builtAt,
    },
    knowledge,
    changeComposition,
  );
}

async function defaultRunGit(args) {
  const safeRepositoryRoot = repositoryRoot.replaceAll('\\', '/');
  const {stdout} = await execFileAsync('git', [
    '-c',
    `safe.directory=${safeRepositoryRoot}`,
    ...args,
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function runCommand(command, args, options = {}) {
  const {stdout, stderr} = await execFileAsync(command, args, {
    cwd: options.cwd ?? webRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: {...process.env, ...(options.env ?? {})},
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

export async function validateCandidate({
  classification,
  headSha,
  outputPath,
}) {
  if (classification.mode !== 'candidate') {
    throw new Error('표준 publication PR은 후보 게이트를 실행할 수 없습니다.');
  }
  const trackedBefore = await defaultRunGit([
    'status',
    '--porcelain=v1',
    '--untracked-files=no',
  ]);
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-topic-candidate-'),
  );
  const candidatePath =
    outputPath ?? path.join(tempRoot, 'candidate-bundle.json');
  let validationError = null;
  try {
    for (const expected of classification.expectedTopics) {
      const topic = JSON.parse(
        await readFile(path.join(repositoryRoot, expected.topicFile), 'utf8'),
      );
      if (topic.topic_id !== expected.topicId) {
        throw new Error(
          `${expected.workId}의 topic_id가 등록값과 다릅니다: ${topic.topic_id}`,
        );
      }
      const actualCounts = {
        sources: topic.sources?.length ?? 0,
        rule_cards: topic.rule_cards?.length ?? 0,
        scenario_branches: topic.scenario_branches?.length ?? 0,
        content_entries: topic.content_entries?.length ?? 0,
        topic_hubs: topic.topic_hubs?.length ?? 0,
        authority_units: topic.authority_reading_units?.length ?? 0,
      };
      if (canonicalJson(actualCounts) !== canonicalJson(expected.counts)) {
        throw new Error(
          `${expected.workId}의 실제 topic counts가 등록값과 다릅니다: ` +
          `expected=${canonicalJson(expected.counts)} ` +
          `actual=${canonicalJson(actualCounts)}`,
        );
      }
    }

    const candidate = await composeTopicCandidateBundle({
      headSha,
      builtAt: new Date().toISOString(),
    });
    await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);

    await runCommand(process.execPath, [
      path.join(scriptDirectory, 'validate-publication-bundle.mjs'),
    ], {
      env: {
        RULELINK_WEB_BUNDLE_PATH: candidatePath,
        RULELINK_REQUIRE_PUBLICATION_BUNDLE: 'true',
      },
    });
    await runCommand(process.execPath, [
      path.join(scriptDirectory, 'validate-public-authority-reading.mjs'),
      candidatePath,
    ]);
    const semanticArgs = [
      path.join(scriptDirectory, 'audit-publication-semantic-overlap.mjs'),
      '--current',
      defaultCurrentPath,
      '--format',
      'ko',
    ];
    for (const topicFile of classification.topicFiles) {
      semanticArgs.push('--topic', path.join(repositoryRoot, topicFile));
    }
    await runCommand(process.execPath, semanticArgs);
    await runCommand(process.execPath, [
      path.join(scriptDirectory, 'audit-publication-topic-queue.mjs'),
    ]);

    const trackedAfter = await defaultRunGit([
      'status',
      '--porcelain=v1',
      '--untracked-files=no',
    ]);
    if (trackedAfter !== trackedBefore) {
      throw new Error(
        '후보 검증기가 저장소의 tracked 파일을 변경했습니다.',
      );
    }
    return {
      candidatePath,
      snapshotId: candidate.snapshot_id,
      contentCount: candidate.knowledge.content_entries.length,
    };
  } catch (error) {
    validationError = error;
    throw error;
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
    const trackedAfter = await defaultRunGit([
      'status',
      '--porcelain=v1',
      '--untracked-files=no',
    ]);
    if (trackedAfter !== trackedBefore && !validationError) {
      throw new Error(
        '후보 검증기가 저장소의 tracked 파일을 변경했습니다.',
      );
    }
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return '';
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} 값이 필요합니다.`);
  }
  return value;
}

async function pullRequestContext(args) {
  const eventPath =
    option(args, '--event-path') || process.env.GITHUB_EVENT_PATH || '';
  if (eventPath) {
    const event = JSON.parse(await readFile(path.resolve(eventPath), 'utf8'));
    const pullRequest = event.pull_request;
    if (!pullRequest?.base?.sha || !pullRequest?.head?.sha || !pullRequest?.head?.ref) {
      throw new Error('GitHub pull_request event의 base/head 정보가 없습니다.');
    }
    return {
      baseSha: pullRequest.base.sha,
      headSha: pullRequest.head.sha,
      headRef: pullRequest.head.ref,
    };
  }
  return {
    baseSha: option(args, '--base'),
    headSha: option(args, '--head'),
    headRef: option(args, '--head-ref'),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const context = await pullRequestContext(args);
  const checkedOutHead = String(
    await defaultRunGit(['rev-parse', 'HEAD']),
  ).trim();
  if (checkedOutHead !== context.headSha) {
    throw new Error(
      `검증 checkout이 실제 pull request head와 다릅니다: ` +
      `checkout=${checkedOutHead} event=${context.headSha}`,
    );
  }
  const queuePath = path.resolve(
    option(args, '--queue') || defaultQueuePath,
  );
  const queue = JSON.parse(await readFile(queuePath, 'utf8'));
  const classification = await classifyTopicCandidatePullRequest({
    ...context,
    queue,
    runGit: defaultRunGit,
  });
  const githubOutput =
    option(args, '--github-output') || process.env.GITHUB_OUTPUT || '';
  if (githubOutput) {
    await appendFile(
      path.resolve(githubOutput),
      `rulelink_mode=${classification.mode}\n`,
      'utf8',
    );
  }

  let validation = null;
  if (args.includes('--validate-candidate')) {
    const candidateOutput = option(args, '--candidate-output');
    validation = await validateCandidate({
      classification,
      headSha: context.headSha,
      outputPath: candidateOutput ? path.resolve(candidateOutput) : '',
    });
  }
  process.stdout.write(
    `${JSON.stringify({
      ...classification,
      base_sha: context.baseSha,
      head_sha: context.headSha,
      ...(validation
        ? {
            candidate_bundle_path: validation.candidatePath,
            candidate_snapshot_id: validation.snapshotId,
            candidate_content_count: validation.contentCount,
          }
        : {}),
    })}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    process.stderr.write(
      `topic candidate PR gate failed: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
