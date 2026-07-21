import {readFile} from 'node:fs/promises';
import path from 'node:path';

const options = parseArguments(process.argv.slice(2));
const repoRoot = options.repoRoot
  ? path.resolve(options.repoRoot)
  : path.resolve(process.cwd(), '..', '..');
const bundlePath = options.bundle
  ? path.resolve(options.bundle)
  : path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const now = parseNow(process.env.RULELINK_VALIDATION_NOW);

let bundle;
try {
  bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
} catch (error) {
  fail(`현재 공개 출판본을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
}

const report = buildFreshnessReport(bundle, now);
process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report));

function buildFreshnessReport(value, 기준시각) {
  const items = [
    ...array(value.cards).map(item => publicationItem('문제카드', item.issue_card_id, item.title_ko, item, 기준시각)),
    ...array(value.change_briefs).map(item => publicationItem('법령변화', item.change_brief_id, item.title_ko, item, 기준시각)),
    ...array(value.knowledge?.content_entries).map(item => publicationItem('지식 콘텐츠', item.content_id, item.title_ko, item, 기준시각)),
  ].sort((left, right) => timestamp(left.expires_at) - timestamp(right.expires_at));

  const sourceDates = [
    ...array(value.assertions).flatMap(assertion => array(assertion.source_coordinates).map(source => source.last_verified_at)),
    ...array(value.knowledge?.sources).map(source => source.last_verified_at),
  ].filter(validDate).sort();

  const lifecycle = array(value.change_briefs)
    .map(brief => ({
      change_brief_id: brief.change_brief_id,
      title_ko: brief.title_ko,
      lifecycle: brief.lifecycle,
      effective_date: brief.effective_date,
      days_from_effective_date: daysBetween(dateAtSeoulStart(brief.effective_date), 기준시각),
    }))
    .sort((left, right) => String(left.effective_date).localeCompare(String(right.effective_date)));

  const statusCounts = items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {healthy: 0, due_soon: 0, expired: 0, invalid: 0});

  return {
    schema: 'rulelink_publication_freshness_report_v1',
    checked_at: 기준시각.toISOString(),
    snapshot_id: value.snapshot_id,
    source_snapshot_id: value.source_snapshot_id,
    counts: {
      issue_cards: array(value.cards).length,
      change_briefs: array(value.change_briefs).length,
      knowledge_entries: array(value.knowledge?.content_entries).length,
      knowledge_hubs: array(value.knowledge?.topic_hubs).length,
      rule_cards: array(value.knowledge?.rule_cards).length,
      scenario_branches: array(value.knowledge?.scenario_branches).length,
      official_sources: array(value.knowledge?.sources).length,
    },
    status_counts: statusCounts,
    earliest_expires_at: items.find(item => validDate(item.expires_at))?.expires_at || null,
    oldest_source_verified_at: sourceDates[0] || null,
    items,
    lifecycle,
  };
}

function publicationItem(type, id, title, value, 기준시각) {
  const expiry = validDate(value.expires_at) ? new Date(value.expires_at) : null;
  const daysRemaining = expiry ? daysBetween(expiry, 기준시각) : null;
  let status = 'invalid';
  if (daysRemaining !== null) {
    status = daysRemaining < 0 ? 'expired' : daysRemaining <= 30 ? 'due_soon' : 'healthy';
  }
  return {
    type,
    id,
    title_ko: title || id,
    reviewed_at: value.reviewed_at || null,
    expires_at: value.expires_at || null,
    days_remaining: daysRemaining,
    status,
  };
}

function renderMarkdown(report) {
  const lines = [
    '# RuleLink 공개본 최신성 일일 점검',
    '',
    `- 출판본: ${report.snapshot_id}`,
    `- 점검시각: ${report.checked_at}`,
    `- 가장 가까운 재검토 기한: ${report.earliest_expires_at || '해당 없음'}`,
    `- 가장 오래된 공식 근거 확인시각: ${report.oldest_source_verified_at || '해당 없음'}`,
    `- 상태: 정상 ${report.status_counts.healthy} · 30일 이내 재검토 ${report.status_counts.due_soon} · 기한 경과 ${report.status_counts.expired} · 날짜 오류 ${report.status_counts.invalid}`,
    '',
    '## 공개 지식 구조',
    '',
    `- 문제카드 ${report.counts.issue_cards}개 · 법령변화 ${report.counts.change_briefs}개 · 지식 콘텐츠 ${report.counts.knowledge_entries}개 · 지식 허브 ${report.counts.knowledge_hubs}개`,
    `- 법리카드 ${report.counts.rule_cards}개 · 사실분기 ${report.counts.scenario_branches}개 · 공식 근거 ${report.counts.official_sources}개`,
    '',
    '## 재검토 일정',
    '',
    '| 상태 | 유형 | 콘텐츠 | 재검토 기한 | 남은 날 |',
    '|---|---|---|---|---:|',
  ];
  if (!report.items.length) {
    lines.push('| 해당 없음 | - | - | - | - |');
  } else {
    for (const item of report.items) {
      lines.push(`| ${statusLabel(item.status)} | ${item.type} | ${escapeCell(item.title_ko)} | ${item.expires_at || '날짜 오류'} | ${item.days_remaining ?? '-'} |`);
    }
  }
  if (report.lifecycle.length) {
    lines.push('', '## 법령 시행 상태', '', '| 법령변화 | 상태 | 시행일 | 시행일과의 일수 |', '|---|---|---|---:|');
    for (const item of report.lifecycle) {
      lines.push(`| ${escapeCell(item.title_ko)} | ${item.lifecycle} | ${item.effective_date} | ${item.days_from_effective_date ?? '-'} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function parseArguments(args) {
  let bundle = '';
  let repoRoot = '';
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') {
      json = true;
    } else if (argument === '--bundle') {
      bundle = args[index + 1] || '';
      index += 1;
    } else if (argument === '--repo-root') {
      repoRoot = args[index + 1] || '';
      index += 1;
    } else {
      fail(`알 수 없는 인수입니다: ${argument}`);
    }
  }
  if (args.includes('--bundle') && !bundle) fail('--bundle 뒤에 경로가 필요합니다.');
  if (args.includes('--repo-root') && !repoRoot) fail('--repo-root 뒤에 경로가 필요합니다.');
  return {bundle, repoRoot, json};
}

function parseNow(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) fail('RULELINK_VALIDATION_NOW가 유효한 날짜시각이 아닙니다.');
  return parsed;
}

function daysBetween(target, 기준시각) {
  if (!(target instanceof Date) || Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - 기준시각.getTime()) / 86400000);
}

function dateAtSeoulStart(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timestamp(value) {
  return validDate(value) ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function statusLabel(value) {
  return {
    healthy: '정상',
    due_soon: '재검토 임박',
    expired: '기한 경과',
    invalid: '날짜 오류',
  }[value] || value;
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
