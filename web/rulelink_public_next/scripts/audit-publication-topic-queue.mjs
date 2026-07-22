import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {assembleKnowledge} from './compose-publication-knowledge.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const topicsDirectory = path.join(repoRoot, 'artifacts', 'publication', 'topics');
const conceptsDirectory = path.join(repoRoot, 'artifacts', 'publication', 'concepts');
const manifestPath = path.join(topicsDirectory, 'manifest.json');
const contentTypeContractPath = path.join(appRoot, 'src', 'lib', 'knowledge-content-types.json');
const contentTypeContract = JSON.parse(await readFile(contentTypeContractPath, 'utf8'));
const canonicalContentTypes = new Set(Object.keys(contentTypeContract.canonical));
const contentTypeAliases = new Map(Object.entries(contentTypeContract.aliases));

const KNOWLEDGE_TOPIC_SCHEMA = 'rulelink_public_knowledge_topic_v1';
const TOPIC_HANDOFF_SCHEMA = 'rulelink_public_topic_handoff_v1';
const PUBLIC_SOURCE_FIELDS = [
  'coordinate_id',
  'source_id',
  'law_name_ko',
  'article_no',
  'official_url',
  'source_snapshot_id',
  'last_verified_at',
];

export function projectQueuedTopic(value) {
  const topic = structuredClone(value);
  if (topic?.schema === KNOWLEDGE_TOPIC_SCHEMA) return topic;
  if (topic?.schema !== TOPIC_HANDOFF_SCHEMA) {
    throw new Error(`지원하지 않는 주제 스키마입니다: ${String(topic?.schema)}`);
  }
  if (!Array.isArray(topic.topic_hubs) || topic.topic_hubs.length !== 1 || !topic.topic_hubs[0]?.hub_id) {
    throw new Error('인계 주제는 공개 허브 하나를 포함해야 합니다.');
  }

  topic.schema = KNOWLEDGE_TOPIC_SCHEMA;
  topic.topic_id = topic.topic_hubs[0].hub_id;
  topic.sources = (topic.sources ?? []).map(source => Object.fromEntries(
    PUBLIC_SOURCE_FIELDS
      .filter(field => source[field] !== undefined)
      .map(field => [field, source[field]]),
  ));
  return topic;
}

export function auditPublicationTopicQueue({manifest, topicFiles, conceptGroups = []}) {
  const listedFiles = new Set((manifest.topics ?? []).map(item => item.file));
  const queuedFiles = [...topicFiles.keys()]
    .filter(file => !listedFiles.has(file))
    .sort((left, right) => left.localeCompare(right, 'en'));
  const nextManifest = structuredClone(manifest);
  nextManifest.content_entry_topic_order = [
    ...(nextManifest.content_entry_topic_order ?? nextManifest.topics.map(item => item.topic_id)),
  ];

  for (const file of queuedFiles) {
    const topic = projectQueuedTopic(topicFiles.get(file));
    nextManifest.topics.push({topic_id: topic.topic_id, file});
    nextManifest.content_entry_topic_order.push(topic.topic_id);
  }

  const projectedTopics = nextManifest.topics.map(descriptor => {
    if (!topicFiles.has(descriptor.file)) throw new Error(`주제 파일을 찾을 수 없습니다: ${descriptor.file}`);
    return projectQueuedTopic(topicFiles.get(descriptor.file));
  });
  const knowledge = assembleKnowledge(nextManifest, projectedTopics, conceptGroups);
  const errors = validateKnowledgeReferences(knowledge);
  const contentTypes = summarizeContentTypes(knowledge.content_entries);
  for (const unknown of contentTypes.unknown) {
    errors.push(`${unknown.content_id} -> 지원하지 않는 콘텐츠 유형: ${unknown.content_type}`);
  }
  if (errors.length) {
    throw new Error(['공개 콘텐츠 대기열의 연결 검증에 실패했습니다.', ...errors.map(error => `- ${error}`)].join('\n'));
  }

  return {
    queued_files: queuedFiles,
    manifest: nextManifest,
    knowledge,
    content_types: contentTypes,
    counts: {
      topics: nextManifest.topics.length,
      sources: knowledge.sources.length,
      hubs: knowledge.topic_hubs.length,
      rules: knowledge.rule_cards.length,
      scenarios: knowledge.scenario_branches.length,
      content: knowledge.content_entries.length,
      concepts: knowledge.concept_cards?.length ?? 0,
    },
  };
}

export function summarizeContentTypes(entries) {
  const canonicalCounts = {};
  const aliases = [];
  const unknown = [];
  for (const entry of entries) {
    const type = String(entry.content_type ?? '');
    if (canonicalContentTypes.has(type)) {
      canonicalCounts[type] = (canonicalCounts[type] ?? 0) + 1;
      continue;
    }
    const normalized = contentTypeAliases.get(type);
    if (normalized) {
      canonicalCounts[normalized] = (canonicalCounts[normalized] ?? 0) + 1;
      aliases.push({content_id: entry.content_id, content_type: type, normalized_content_type: normalized});
      continue;
    }
    unknown.push({content_id: entry.content_id, content_type: type || '<empty>'});
  }
  return {canonical_counts: canonicalCounts, aliases, unknown};
}

export async function loadAndAuditPublicationTopicQueue() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const topicFiles = new Map();
  for (const file of await readdir(topicsDirectory)) {
    if (!/^[a-z0-9-]+\.json$/u.test(file) || file === 'manifest.json') continue;
    const value = JSON.parse(await readFile(path.join(topicsDirectory, file), 'utf8'));
    if (![KNOWLEDGE_TOPIC_SCHEMA, TOPIC_HANDOFF_SCHEMA].includes(value?.schema)) continue;
    topicFiles.set(file, value);
  }
  const conceptGroups = await Promise.all((manifest.concepts ?? []).map(async descriptor => (
    JSON.parse(await readFile(path.join(conceptsDirectory, descriptor.file), 'utf8'))
  )));
  return auditPublicationTopicQueue({manifest, topicFiles, conceptGroups});
}

function validateKnowledgeReferences(knowledge) {
  const errors = [];
  const sourceIds = new Set(knowledge.sources.map(item => item.coordinate_id));
  const hubIds = new Set(knowledge.topic_hubs.map(item => item.hub_id));
  const ruleIds = new Set(knowledge.rule_cards.map(item => item.rule_id));
  const scenarioIds = new Set(knowledge.scenario_branches.map(item => item.scenario_id));
  const contentIds = new Set(knowledge.content_entries.map(item => item.content_id));

  const check = (owner, values, allowed, label) => {
    for (const value of values ?? []) {
      if (!allowed.has(value)) errors.push(`${owner} -> 존재하지 않는 ${label}: ${String(value)}`);
    }
  };
  for (const hub of knowledge.topic_hubs) check(hub.hub_id, hub.content_ids, contentIds, '콘텐츠');
  for (const rule of knowledge.rule_cards) check(rule.rule_id, rule.source_coordinate_ids, sourceIds, '근거');
  for (const scenario of knowledge.scenario_branches) {
    check(scenario.scenario_id, scenario.rule_ids, ruleIds, '법리');
    check(scenario.scenario_id, scenario.source_coordinate_ids, sourceIds, '근거');
  }
  for (const entry of knowledge.content_entries) {
    check(entry.content_id, entry.rule_ids, ruleIds, '법리');
    check(entry.content_id, entry.scenario_ids, scenarioIds, '사실분기');
    check(entry.content_id, entry.source_coordinate_ids, sourceIds, '근거');
    check(entry.content_id, entry.hub_ids, hubIds, '허브');
    check(entry.content_id, entry.related_content_ids, contentIds, '관련 콘텐츠');
  }
  for (const concept of knowledge.concept_cards ?? []) {
    check(concept.concept_id, concept.source_coordinate_ids, sourceIds, '근거');
    check(concept.concept_id, concept.related_content_ids, contentIds, '관련 콘텐츠');
    for (const assertion of concept.assertions ?? []) {
      check(assertion.assertion_id, assertion.source_coordinate_ids, sourceIds, '근거');
    }
  }
  validateUniqueSlugs(knowledge.topic_hubs, 'hub_id', '허브', errors);
  validateUniqueSlugs(knowledge.content_entries, 'content_id', '콘텐츠', errors);
  return errors;
}

function validateUniqueSlugs(items, idKey, label, errors) {
  const slugs = new Set();
  for (const item of items) {
    if (typeof item.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(item.slug)) {
      errors.push(`${label} ${String(item[idKey])}의 공개 URL 식별자가 올바르지 않습니다.`);
      continue;
    }
    if (slugs.has(item.slug)) errors.push(`${label} 공개 URL 식별자가 중복됩니다: ${item.slug}`);
    slugs.add(item.slug);
  }
}

async function main() {
  const result = await loadAndAuditPublicationTopicQueue();
  const queued = result.queued_files.length ? result.queued_files.join(', ') : '없음';
  console.log(`공개 콘텐츠 대기열 검증 통과: 미통합 주제 ${result.queued_files.length}개 (${queued})`);
  console.log(`예상 정본: 허브 ${result.counts.hubs} / 콘텐츠 ${result.counts.content} / 법리 ${result.counts.rules} / 사실분기 ${result.counts.scenarios} / 근거 ${result.counts.sources}`);
  console.log(`콘텐츠 유형: 과거 별칭 ${result.content_types.aliases.length}건 / 미지원 ${result.content_types.unknown.length}건`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(`공개 콘텐츠 대기열 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
