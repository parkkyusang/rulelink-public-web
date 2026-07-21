import {access, readFile} from 'node:fs/promises';
import path from 'node:path';

const bundlePath = process.env.RULELINK_WEB_BUNDLE_PATH
  ? path.resolve(process.env.RULELINK_WEB_BUNDLE_PATH)
  : path.join(process.cwd(), 'content', 'bundle.json');

if (!(await exists(bundlePath))) {
  if (process.env.RULELINK_REQUIRE_PUBLICATION_BUNDLE === 'true') {
    fail([`승인 출판본을 찾지 못했습니다: ${bundlePath}`]);
  }
  process.stdout.write(`승인 출판본이 없어 공개 번들 검증을 건너뜁니다: ${bundlePath}\n`);
  process.exit(0);
}

let bundle;
try {
  bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
} catch (error) {
  fail([`출판본 JSON을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`]);
}

const errors = validatePublishedBundle(bundle);
if (errors.length) fail(errors);
process.stdout.write(`공개 번들 안전검증 통과: ${bundlePath}\n`);

export function validatePublishedBundle(value) {
  const errors = [];
  if (!isRecord(value)) return ['출판본 최상위 값은 객체여야 합니다.'];
  if (value.schema !== 'rulelink_published_bundle_v1') {
    errors.push('공개 빌드는 rulelink_published_bundle_v1만 허용합니다.');
  }
  if (value.preview_only === true) errors.push('내부 편집 미리보기 표시는 공개 번들에 들어갈 수 없습니다.');
  if (value.jurisdiction !== 'KR') errors.push('공개 번들의 관할은 KR이어야 합니다.');
  if (value.locale !== 'ko-KR') errors.push('공개 번들의 언어는 ko-KR이어야 합니다.');

  const cards = requireArray(value, 'cards', errors);
  const assertions = requireArray(value, 'assertions', errors);
  const briefs = optionalArray(value, 'change_briefs', errors);
  const assertionIds = uniqueIds(assertions, 'assertion_id', '주장', errors);

  for (const [index, card] of cards.entries()) {
    if (!isRecord(card)) {
      errors.push(`cards[${index}]는 객체여야 합니다.`);
      continue;
    }
    if (card.editorial_status !== 'approved') {
      errors.push(`문제카드 ${label(card, 'issue_card_id')}가 승인 상태가 아닙니다.`);
    }
    checkReferences(card.assertion_ids, assertionIds, `문제카드 ${label(card, 'issue_card_id')}의 assertion_ids`, errors);
  }

  for (const [index, brief] of briefs.entries()) {
    if (!isRecord(brief)) {
      errors.push(`change_briefs[${index}]는 객체여야 합니다.`);
      continue;
    }
    if (brief.editorial_status !== 'approved') {
      errors.push(`법령변화 브리핑 ${label(brief, 'change_brief_id')}이 승인 상태가 아닙니다.`);
    }
    checkReferences(brief.assertion_ids, assertionIds, `법령변화 브리핑 ${label(brief, 'change_brief_id')}의 assertion_ids`, errors);
  }

  if (value.knowledge !== undefined) validateKnowledge(value.knowledge, errors);
  scanForInternalData(value, '$', errors);
  return [...new Set(errors)];
}

function validateKnowledge(value, errors) {
  if (!isRecord(value)) {
    errors.push('knowledge는 객체여야 합니다.');
    return;
  }
  if (value.schema !== 'rulelink_public_knowledge_index_v1') {
    errors.push('knowledge.schema은 rulelink_public_knowledge_index_v1이어야 합니다.');
  }
  const sources = requireArray(value, 'sources', errors, 'knowledge');
  const rules = requireArray(value, 'rule_cards', errors, 'knowledge');
  const scenarios = requireArray(value, 'scenario_branches', errors, 'knowledge');
  const entries = requireArray(value, 'content_entries', errors, 'knowledge');
  const hubs = requireArray(value, 'topic_hubs', errors, 'knowledge');

  const sourceIds = uniqueIds(sources, 'coordinate_id', '공식 근거', errors);
  const ruleIds = uniqueIds(rules, 'rule_id', '법리카드', errors);
  const scenarioIds = uniqueIds(scenarios, 'scenario_id', '사실분기', errors);
  const entryIds = uniqueIds(entries, 'content_id', '지식 콘텐츠', errors);
  const hubIds = uniqueIds(hubs, 'hub_id', '주제 허브', errors);

  for (const source of sources) {
    if (!isRecord(source)) continue;
    if ('source_hash' in source) errors.push(`공개 지식 근거 ${label(source, 'coordinate_id')}에 source_hash가 남아 있습니다.`);
    if (!isOfficialHttpsUrl(source.official_url)) {
      errors.push(`공개 지식 근거 ${label(source, 'coordinate_id')}의 공식 URL이 허용된 정부 도메인이 아닙니다.`);
    }
  }

  for (const rule of rules) {
    if (!isRecord(rule)) continue;
    checkReferences(rule.source_coordinate_ids, sourceIds, `법리카드 ${label(rule, 'rule_id')}의 source_coordinate_ids`, errors);
  }

  for (const scenario of scenarios) {
    if (!isRecord(scenario)) continue;
    checkReferences(scenario.rule_ids, ruleIds, `사실분기 ${label(scenario, 'scenario_id')}의 rule_ids`, errors);
    checkReferences(scenario.source_coordinate_ids, sourceIds, `사실분기 ${label(scenario, 'scenario_id')}의 source_coordinate_ids`, errors);
  }

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (entry.editorial_status !== 'approved') {
      errors.push(`지식 콘텐츠 ${label(entry, 'content_id')}가 승인 상태가 아닙니다.`);
    }
    checkReferences(entry.rule_ids, ruleIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 rule_ids`, errors);
    checkReferences(entry.scenario_ids, scenarioIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 scenario_ids`, errors);
    checkReferences(entry.source_coordinate_ids, sourceIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 source_coordinate_ids`, errors);
    checkReferences(entry.hub_ids, hubIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 hub_ids`, errors);
    checkReferences(entry.related_content_ids, entryIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 related_content_ids`, errors);
    if (entry.concierge_entry !== undefined) {
      const href = isRecord(entry.concierge_entry) ? entry.concierge_entry.href : undefined;
      if (!isConciergeUrl(href)) {
        errors.push(`지식 콘텐츠 ${label(entry, 'content_id')}의 컨시어지 주소가 허용된 별도 사이트가 아닙니다.`);
      }
    }
  }

  for (const hub of hubs) {
    if (!isRecord(hub)) continue;
    checkReferences(hub.content_ids, entryIds, `주제 허브 ${label(hub, 'hub_id')}의 content_ids`, errors);
  }
}

function scanForInternalData(value, location, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForInternalData(item, `${location}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) {
    if (typeof value === 'string' && looksLikeInternalPath(value)) {
      errors.push(`내부 경로로 보이는 문자열이 공개 번들에 있습니다: ${location}`);
    }
    return;
  }
  const forbiddenKeys = new Set([
    'raw_prompt',
    'user_prompt',
    'case_folder',
    'job_id',
    'internal_path',
    'source_path',
    'memo_path',
    'artifact_path',
  ]);
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) errors.push(`내부 전용 필드가 공개 번들에 있습니다: ${location}.${key}`);
    scanForInternalData(child, `${location}.${key}`, errors);
  }
}

function looksLikeInternalPath(value) {
  return /[A-Za-z]:\\/.test(value)
    || value.startsWith('file://')
    || /(?:^|[/\\])00_inbox(?:[/\\]|$)/i.test(value)
    || /(?:^|[/\\])inbox[/\\]jobs(?:[/\\]|$)/i.test(value)
    || /(?:^|[/\\])\.codex[/\\]skills(?:[/\\]|$)/i.test(value)
    || /(?:^|[/\\])data[/\\]db(?:[/\\]|$)/i.test(value);
}

function isOfficialHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'go.kr' || url.hostname.endsWith('.go.kr'));
  } catch {
    return false;
  }
}

function isConciergeUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'liale-review.lolphysical.xyz';
  } catch {
    return false;
  }
}

function requireArray(value, key, errors, prefix = '') {
  if (!Array.isArray(value[key])) {
    errors.push(`${prefix ? `${prefix}.` : ''}${key}는 배열이어야 합니다.`);
    return [];
  }
  return value[key];
}

function optionalArray(value, key, errors) {
  if (value[key] === undefined) return [];
  return requireArray(value, key, errors);
}

function uniqueIds(items, key, labelName, errors) {
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!isRecord(item) || typeof item[key] !== 'string' || !item[key]) {
      errors.push(`${labelName}[${index}]의 ${key}가 없습니다.`);
      continue;
    }
    if (ids.has(item[key])) errors.push(`${labelName} 식별자가 중복됩니다: ${item[key]}`);
    ids.add(item[key]);
  }
  return ids;
}

function checkReferences(value, allowed, location, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${location}는 배열이어야 합니다.`);
    return;
  }
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item)) errors.push(`${location}에 존재하지 않는 참조가 있습니다: ${String(item)}`);
  }
}

function label(value, key) {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : '(식별자 없음)';
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fail(errors) {
  for (const error of errors) process.stderr.write(`공개 번들 안전검증 실패: ${error}\n`);
  process.exit(1);
}
