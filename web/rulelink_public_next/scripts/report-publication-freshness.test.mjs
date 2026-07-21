import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const reporterPath = fileURLToPath(new URL('./report-publication-freshness.mjs', import.meta.url));

test('공개본 구조와 가장 가까운 재검토 기한을 보고한다', async () => {
  await withBundle(async bundlePath => {
    await writeFile(bundlePath, JSON.stringify(bundle()), 'utf8');
    const result = report(bundlePath, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.schema, 'rulelink_publication_freshness_report_v1');
    assert.equal(value.counts.change_briefs, 1);
    assert.equal(value.counts.knowledge_entries, 1);
    assert.equal(value.earliest_expires_at, '2026-08-10T00:00:00+09:00');
    assert.equal(value.oldest_source_verified_at, '2026-06-01T00:00:00+09:00');
  });
});

test('정상·재검토 임박·기한 경과를 시각 기준으로 구분한다', async () => {
  await withBundle(async bundlePath => {
    const value = bundle();
    value.cards = [
      item('issue.expired', '2026-07-21T11:59:00+09:00'),
      item('issue.soon', '2026-08-10T00:00:00+09:00'),
      item('issue.healthy', '2026-10-21T00:00:00+09:00'),
    ];
    await writeFile(bundlePath, JSON.stringify(value), 'utf8');
    const result = report(bundlePath, ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const reportValue = JSON.parse(result.stdout);
    assert.deepEqual(reportValue.status_counts, {healthy: 2, due_soon: 2, expired: 1, invalid: 0});
    assert.equal(reportValue.items.find(entry => entry.id === 'issue.expired').status, 'expired');
  });
});

test('한글 마크다운에 지식 구조와 재검토 일정을 표시한다', async () => {
  await withBundle(async bundlePath => {
    await writeFile(bundlePath, JSON.stringify(bundle()), 'utf8');
    const result = report(bundlePath);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# RuleLink 공개본 최신성 일일 점검/);
    assert.match(result.stdout, /법리카드 1개 · 사실분기 1개 · 공식 근거 1개/);
    assert.match(result.stdout, /재검토 일정/);
    assert.match(result.stdout, /법령 시행 상태/);
  });
});

function report(bundlePath, extraArgs = []) {
  return spawnSync(process.execPath, [reporterPath, '--bundle', bundlePath, ...extraArgs], {
    encoding: 'utf8',
    env: {
      ...process.env,
      RULELINK_VALIDATION_NOW: '2026-07-21T12:00:00+09:00',
    },
  });
}

async function withBundle(callback) {
  const root = await mkdtemp(path.join(tmpdir(), 'rulelink-freshness-report-'));
  try {
    await callback(path.join(root, 'bundle.json'));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

function bundle() {
  return {
    snapshot_id: 'snapshot.test',
    source_snapshot_id: 'source.test',
    cards: [],
    assertions: [{
      assertion_id: 'assertion.one',
      source_coordinates: [{last_verified_at: '2026-06-01T00:00:00+09:00'}],
    }],
    change_briefs: [{
      ...item('brief.one', '2026-10-21T00:00:00+09:00'),
      change_brief_id: 'brief.one',
      lifecycle: 'recently_effective',
      effective_date: '2026-07-01',
    }],
    knowledge: {
      sources: [{last_verified_at: '2026-07-01T00:00:00+09:00'}],
      rule_cards: [{rule_id: 'rule.one'}],
      scenario_branches: [{scenario_id: 'scenario.one'}],
      topic_hubs: [{hub_id: 'hub.one'}],
      content_entries: [{
        ...item('content.one', '2026-08-10T00:00:00+09:00'),
        content_id: 'content.one',
      }],
    },
  };
}

function item(id, expiresAt) {
  return {
    issue_card_id: id,
    title_ko: id,
    reviewed_at: '2026-07-01T00:00:00+09:00',
    expires_at: expiresAt,
  };
}
