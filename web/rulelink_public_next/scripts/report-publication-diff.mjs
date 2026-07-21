import {access, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.join(scriptDir, 'validate-publication-bundle.mjs');
const options = parseArguments(process.argv.slice(2));
const repoRoot = options.repoRoot
  ? path.resolve(options.repoRoot)
  : path.resolve(process.cwd(), '..', '..');
const candidatePath = path.resolve(options.candidate);
const currentPath = options.current
  ? path.resolve(options.current)
  : path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

validateCandidate(candidatePath);
const candidateBytes = await readFile(candidatePath);
const candidate = parseBundle(candidateBytes, '후보 출판본');
const currentBytes = await exists(currentPath) ? await readFile(currentPath) : null;
const current = currentBytes ? parseBundle(currentBytes, '현재 출판본') : emptyBundle();

if (
  currentBytes
  && current.snapshot_id === candidate.snapshot_id
  && sha256(currentBytes) !== sha256(candidateBytes)
) {
  fail(`같은 snapshot_id로 다른 내용을 출판할 수 없습니다: ${candidate.snapshot_id}`);
}

const report = buildReport(current, candidate, {
  currentSha256: currentBytes ? sha256(currentBytes) : null,
  candidateSha256: sha256(candidateBytes),
});
process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report));

function validateCandidate(bundlePath) {
  const validation = spawnSync(process.execPath, [validatorPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      RULELINK_WEB_BUNDLE_PATH: bundlePath,
      RULELINK_REQUIRE_PUBLICATION_BUNDLE: 'true',
    },
  });
  if (validation.status !== 0) {
    fail(`후보 출판본 검증에 실패했습니다.\n${validation.stderr || validation.stdout}`);
  }
}

function buildReport(before, after, hashes) {
  const definitions = [
    ['issue_cards', '문제카드', before.cards, after.cards, 'issue_card_id'],
    ['change_briefs', '법령변화', before.change_briefs, after.change_briefs, 'change_brief_id'],
    ['knowledge_entries', '지식 콘텐츠', before.knowledge?.content_entries, after.knowledge?.content_entries, 'content_id'],
    ['knowledge_hubs', '지식 허브', before.knowledge?.topic_hubs, after.knowledge?.topic_hubs, 'hub_id'],
    ['public_topics', '공개 주제', before.catalog?.topics, after.catalog?.topics, 'topic_id'],
    ['assertions', '근거 주장', before.assertions, after.assertions, 'assertion_id'],
    ['rule_cards', '법리카드', before.knowledge?.rule_cards, after.knowledge?.rule_cards, 'rule_id'],
    ['scenario_branches', '사실분기', before.knowledge?.scenario_branches, after.knowledge?.scenario_branches, 'scenario_id'],
    ['sources', '공식 근거', before.knowledge?.sources, after.knowledge?.sources, 'coordinate_id'],
  ];
  const collections = Object.fromEntries(definitions.map(([key, label, oldItems, newItems, idKey]) => [
    key,
    {
      label,
      before: array(oldItems).length,
      after: array(newItems).length,
      ...diffItems(oldItems, newItems, idKey),
    },
  ]));

  const beforeRoutes = publicRoutes(before);
  const afterRoutes = publicRoutes(after);
  const routes = {
    before: beforeRoutes.size,
    after: afterRoutes.size,
    added: difference(afterRoutes, beforeRoutes),
    removed: difference(beforeRoutes, afterRoutes),
  };
  const fileHashes = diffRecordKeys(before.file_hashes, after.file_hashes);
  const publicKeys = ['issue_cards', 'change_briefs', 'knowledge_entries', 'knowledge_hubs', 'public_topics'];
  const changedPublicItems = publicKeys.reduce((sum, key) => sum + collections[key].changed.length, 0);
  const removedPublicItems = publicKeys.reduce((sum, key) => sum + collections[key].removed.length, 0);
  const notices = [];
  if (routes.removed.length) notices.push(`공개 URL ${routes.removed.length}개가 제거됩니다.`);
  if (removedPublicItems) notices.push(`기존 공개 콘텐츠 ${removedPublicItems}개가 제외됩니다.`);
  if (changedPublicItems) notices.push(`기존 공개 콘텐츠 ${changedPublicItems}개의 본문 또는 메타데이터가 바뀝니다.`);
  if (fileHashes.removed.length) notices.push(`승인 해시 영수증 ${fileHashes.removed.length}개가 제거됩니다.`);
  if (before.source_snapshot_id && before.source_snapshot_id !== after.source_snapshot_id) {
    notices.push('기준 출처 스냅샷이 바뀝니다.');
  }

  return {
    schema: 'rulelink_publication_diff_report_v1',
    from_snapshot_id: before.snapshot_id || null,
    to_snapshot_id: after.snapshot_id,
    source_snapshot: {
      before: before.source_snapshot_id || null,
      after: after.source_snapshot_id,
      changed: Boolean(before.source_snapshot_id && before.source_snapshot_id !== after.source_snapshot_id),
    },
    bundle_sha256: {
      before: hashes.currentSha256,
      after: hashes.candidateSha256,
    },
    collections,
    routes,
    review_window: reviewWindow(after),
    lifecycle: lifecycleCounts(after.change_briefs),
    file_hashes: fileHashes,
    requires_attention: notices.length > 0,
    notices,
  };
}

function diffItems(oldItems, newItems, idKey) {
  const before = new Map(array(oldItems).map(item => [item[idKey], item]));
  const after = new Map(array(newItems).map(item => [item[idKey], item]));
  const added = [...after.keys()].filter(id => !before.has(id)).sort();
  const removed = [...before.keys()].filter(id => !after.has(id)).sort();
  const changed = [...after.keys()]
    .filter(id => before.has(id) && stableJson(before.get(id)) !== stableJson(after.get(id)))
    .sort();
  return {added, changed, removed};
}

function diffRecordKeys(oldValue, newValue) {
  const before = record(oldValue);
  const after = record(newValue);
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));
  return {
    before: beforeKeys.size,
    after: afterKeys.size,
    added: difference(afterKeys, beforeKeys),
    changed: [...afterKeys].filter(key => beforeKeys.has(key) && before[key] !== after[key]).sort(),
    removed: difference(beforeKeys, afterKeys),
  };
}

function publicRoutes(bundle) {
  const routes = new Set(['/', '/ko/method', '/ko/search', '/publication.json', '/robots.txt']);
  for (const item of array(bundle.cards)) routes.add(`/ko/issues/${item.slug}`);
  for (const item of array(bundle.change_briefs)) routes.add(`/ko/changes/${item.slug}`);
  for (const item of array(bundle.knowledge?.content_entries)) routes.add(`/ko/knowledge/${item.slug}`);
  for (const item of array(bundle.knowledge?.topic_hubs)) routes.add(`/ko/hubs/${item.slug}`);
  for (const item of array(bundle.catalog?.topics)) routes.add(`/ko/topics/${item.slug}`);
  if (array(bundle.change_briefs).length) {
    routes.add('/ko/changes');
    routes.add('/feed.xml');
  }
  if (array(bundle.knowledge?.content_entries).length) routes.add('/ko/knowledge');
  return routes;
}

function reviewWindow(bundle) {
  const items = [
    ...array(bundle.cards),
    ...array(bundle.change_briefs),
    ...array(bundle.knowledge?.content_entries),
  ];
  const reviewed = items.map(item => item.reviewed_at).filter(validDate).sort();
  const expires = items.map(item => item.expires_at).filter(validDate).sort();
  return {
    latest_reviewed_at: reviewed.at(-1) || null,
    earliest_expires_at: expires[0] || null,
  };
}

function lifecycleCounts(items) {
  return array(items).reduce((counts, item) => {
    const key = typeof item.lifecycle === 'string' ? item.lifecycle : 'unspecified';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function renderMarkdown(report) {
  const lines = [
    '# RuleLink 공개 출판 변경 보고',
    '',
    `- 현재 출판본: ${report.from_snapshot_id || '없음'}`,
    `- 후보 출판본: ${report.to_snapshot_id}`,
    `- 기준 출처 스냅샷: ${report.source_snapshot.before || '없음'} → ${report.source_snapshot.after}`,
    `- 가장 최근 법률 검토시각: ${report.review_window.latest_reviewed_at || '해당 없음'}`,
    `- 가장 가까운 재검토 기한: ${report.review_window.earliest_expires_at || '해당 없음'}`,
    '',
    '## 공개 콘텐츠와 근거 변화',
    '',
    '| 구분 | 현재 | 후보 | 추가 | 변경 | 제외 |',
    '|---|---:|---:|---:|---:|---:|',
  ];
  for (const value of Object.values(report.collections)) {
    lines.push(`| ${value.label} | ${value.before} | ${value.after} | ${value.added.length} | ${value.changed.length} | ${value.removed.length} |`);
  }
  lines.push(
    '',
    '## 공개 경로',
    '',
    `- 현재 ${report.routes.before}개 → 후보 ${report.routes.after}개`,
    `- 추가: ${list(report.routes.added)}`,
    `- 제거: ${list(report.routes.removed)}`,
    '',
    '## 승인 해시 영수증',
    '',
    `- 현재 ${report.file_hashes.before}개 → 후보 ${report.file_hashes.after}개`,
    `- 추가: ${list(report.file_hashes.added)}`,
    `- 변경: ${list(report.file_hashes.changed)}`,
    `- 제거: ${list(report.file_hashes.removed)}`,
    '',
    '## 검토가 필요한 변화',
    '',
  );
  if (report.notices.length) {
    for (const notice of report.notices) lines.push(`- ${notice}`);
  } else {
    lines.push('- 기존 공개 콘텐츠를 변경하거나 제거하는 변화가 없습니다.');
  }
  lines.push('', '## 식별자별 상세', '');
  for (const value of Object.values(report.collections)) {
    if (!value.added.length && !value.changed.length && !value.removed.length) continue;
    lines.push(
      `### ${value.label}`,
      '',
      `- 추가: ${list(value.added)}`,
      `- 변경: ${list(value.changed)}`,
      `- 제외: ${list(value.removed)}`,
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

function parseArguments(args) {
  let candidate = '';
  let current = '';
  let repoRoot = '';
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') {
      json = true;
    } else if (argument === '--current') {
      current = args[index + 1] || '';
      index += 1;
    } else if (argument === '--repo-root') {
      repoRoot = args[index + 1] || '';
      index += 1;
    } else if (!argument.startsWith('-') && !candidate) {
      candidate = argument;
    } else {
      fail(`알 수 없는 인수입니다: ${argument}`);
    }
  }
  if (!candidate) {
    fail('사용법: npm run report:publication -- <후보 bundle.json> [--current <현재 bundle.json>] [--json] [--repo-root <경로>]');
  }
  if (args.includes('--current') && !current) fail('--current 뒤에 경로가 필요합니다.');
  if (args.includes('--repo-root') && !repoRoot) fail('--repo-root 뒤에 경로가 필요합니다.');
  return {candidate, current, repoRoot, json};
}

function parseBundle(bytes, name) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(`${name}을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function emptyBundle() {
  return {
    snapshot_id: '',
    source_snapshot_id: '',
    cards: [],
    assertions: [],
    change_briefs: [],
    file_hashes: {},
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function difference(left, right) {
  return [...left].filter(value => !right.has(value)).sort();
}

function list(values) {
  return values.length ? values.map(value => `\`${value}\``).join(', ') : '없음';
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
