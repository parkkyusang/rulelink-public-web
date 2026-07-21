import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const reporterPath = fileURLToPath(new URL('./report-publication-diff.mjs', import.meta.url));

test('추가된 공개 콘텐츠와 경로를 JSON으로 보고한다', async () => {
  await withTask(async ({currentPath, candidatePath, repoRoot}) => {
    await writeJson(currentPath, bundle('snapshot-before'));
    const candidate = bundle('snapshot-after');
    candidate.cards = [issueCard()];
    candidate.file_hashes['issue:one'] = 'b'.repeat(64);
    await writeJson(candidatePath, candidate);

    const result = report(candidatePath, currentPath, repoRoot, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.schema, 'rulelink_publication_diff_report_v1');
    assert.deepEqual(value.collections.issue_cards.added, ['issue.one']);
    assert.deepEqual(value.routes.added, ['/ko/issues/issue-one']);
    assert.equal(value.review_window.earliest_expires_at, '2026-10-21T00:00:00+09:00');
  });
});

test('변경·제외된 식별자와 공개 경로 제거를 구분한다', async () => {
  await withTask(async ({currentPath, candidatePath, repoRoot}) => {
    const current = bundle('snapshot-before');
    current.cards = [issueCard()];
    current.change_briefs = [changeBrief()];
    const candidate = bundle('snapshot-after');
    candidate.cards = [issueCard({title_ko: '바뀐 제목'})];
    await writeJson(currentPath, current);
    await writeJson(candidatePath, candidate);

    const result = report(candidatePath, currentPath, repoRoot, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.deepEqual(value.collections.issue_cards.changed, ['issue.one']);
    assert.deepEqual(value.collections.change_briefs.removed, ['brief.one']);
    assert.deepEqual(value.routes.removed, ['/feed.xml', '/ko/changes', '/ko/changes/brief-one']);
    assert.equal(value.requires_attention, true);
  });
});

test('같은 snapshot_id의 다른 후보는 보고 단계에서 거부한다', async () => {
  await withTask(async ({currentPath, candidatePath, repoRoot}) => {
    await writeJson(currentPath, bundle('snapshot-same'));
    await writeJson(candidatePath, {...bundle('snapshot-same'), built_at: '2026-07-21T01:00:00+00:00'});
    const result = report(candidatePath, currentPath, repoRoot, ['--json']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /같은 snapshot_id/);
  });
});

test('공개 안전검증을 통과하지 못한 후보는 보고하지 않는다', async () => {
  await withTask(async ({currentPath, candidatePath, repoRoot}) => {
    await writeJson(currentPath, bundle('snapshot-before'));
    await writeJson(candidatePath, {...bundle('snapshot-invalid'), schema: 'rulelink_editorial_preview_bundle_v1'});
    const result = report(candidatePath, currentPath, repoRoot, ['--json']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /후보 출판본 검증에 실패/);
  });
});

test('사람이 읽는 한글 마크다운 보고서를 만든다', async () => {
  await withTask(async ({currentPath, candidatePath, repoRoot}) => {
    await writeJson(currentPath, bundle('snapshot-before'));
    const candidate = bundle('snapshot-after');
    candidate.change_briefs = [changeBrief()];
    await writeJson(candidatePath, candidate);
    const result = report(candidatePath, currentPath, repoRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# RuleLink 공개 출판 변경 보고/);
    assert.match(result.stdout, /법령변화/);
    assert.match(result.stdout, /\/ko\/changes\/brief-one/);
  });
});

function report(candidatePath, currentPath, repoRoot, extraArgs = []) {
  return spawnSync(process.execPath, [
    reporterPath,
    candidatePath,
    '--current',
    currentPath,
    '--repo-root',
    repoRoot,
    ...extraArgs,
  ], {
    cwd: path.dirname(reporterPath),
    encoding: 'utf8',
    env: {
      ...process.env,
      RULELINK_VALIDATION_NOW: '2026-07-21T12:00:00+09:00',
    },
  });
}

async function withTask(callback) {
  const taskRoot = await mkdtemp(path.join(tmpdir(), 'rulelink-publication-report-'));
  try {
    await callback({
      currentPath: path.join(taskRoot, 'current.json'),
      candidatePath: path.join(taskRoot, 'candidate.json'),
      repoRoot: path.join(taskRoot, 'repo'),
    });
  } finally {
    await rm(taskRoot, {recursive: true, force: true});
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function bundle(snapshotId) {
  return {
    schema: 'rulelink_published_bundle_v1',
    snapshot_id: snapshotId,
    built_at: '2026-07-21T00:00:00+00:00',
    source_snapshot_id: `source.${snapshotId}`,
    jurisdiction: 'KR',
    locale: 'ko-KR',
    cards: [],
    assertions: [],
    change_briefs: [],
    file_hashes: {'fixture:approval': 'a'.repeat(64)},
  };
}

function issueCard(overrides = {}) {
  return {
    issue_card_id: 'issue.one',
    slug: 'issue-one',
    title_ko: '문제카드',
    editorial_status: 'approved',
    reviewed_at: '2026-07-21T09:00:00+09:00',
    expires_at: '2026-10-21T00:00:00+09:00',
    assertion_ids: [],
    ...overrides,
  };
}

function changeBrief(overrides = {}) {
  return {
    change_brief_id: 'brief.one',
    slug: 'brief-one',
    title_ko: '법령변화',
    editorial_status: 'approved',
    lifecycle: 'future_effective',
    effective_date: '2026-08-01',
    reviewed_at: '2026-07-21T09:00:00+09:00',
    expires_at: '2026-10-21T00:00:00+09:00',
    related_issue_card_ids: [],
    assertion_ids: [],
    ...overrides,
  };
}
