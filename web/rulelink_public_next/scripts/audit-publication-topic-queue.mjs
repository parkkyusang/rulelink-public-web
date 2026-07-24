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
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const contentTypeContractPath = path.join(appRoot, 'src', 'lib', 'knowledge-content-types.json');

const contentTypeContract = JSON.parse(await readFile(contentTypeContractPath, 'utf8'));
const canonicalContentTypes = new Set(Object.keys(contentTypeContract.canonical));
const contentTypeAliases = new Map(Object.entries(contentTypeContract.aliases));
const KNOWLEDGE_TOPIC_SCHEMA = 'rulelink_public_knowledge_topic_v1';
const TOPIC_HANDOFF_SCHEMA = 'rulelink_public_topic_handoff_v1';
const PUBLIC_SOURCE_FIELDS = [
  'coordinate_id',
  'source_id',
  'source_kind',
  'law_name_ko',
  'article_no',
  'title_ko',
  'case_number',
  'decision_date',
  'document_kind',
  'effective_date',
  'promulgation_number',
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

export function summarizeContentTypes(entries) {
  const canonicalCounts = {};
  const aliases = [];
  const unknown = [];
  for (const entry of entries) {
    const type = String(entry.content_type ?? '');
    const normalized = canonicalContentTypes.has(type) ? type : contentTypeAliases.get(type);
    if (!normalized) {
      unknown.push({content_id: entry.content_id, content_type: type || '<empty>'});
      continue;
    }
    canonicalCounts[normalized] = (canonicalCounts[normalized] ?? 0) + 1;
    if (normalized !== type) {
      aliases.push({content_id: entry.content_id, content_type: type, normalized_content_type: normalized});
    }
  }
  return {canonical_counts: canonicalCounts, aliases, unknown};
}

export function summarizeKnowledgeRelations(entries) {
  const typedEntries = entries.filter(entry => Array.isArray(entry.related_edges));
  return {
    typed_entries: typedEntries.length,
    typed_edges: typedEntries.reduce((total, entry) => total + entry.related_edges.length, 0),
    legacy_only_entries: entries.length - typedEntries.length,
    concierge_entries: entries.filter(entry => entry.product_roles?.includes('concierge_entry')).length,
  };
}

export function auditPublicationTopicQueue({manifest, topicFiles, conceptGroups = [], snapshotId = ''}) {
  const nextManifest = structuredClone(manifest);
  const listedFiles = new Set((nextManifest.topics ?? []).map(item => item.file));
  const queuedFiles = [...topicFiles.keys()]
    .filter(file => !listedFiles.has(file))
    .sort((left, right) => left.localeCompare(right, 'en'));

  nextManifest.content_entry_topic_order = [
    ...(nextManifest.content_entry_topic_order ?? (nextManifest.topics ?? []).map(item => item.topic_id)),
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
  const knowledge = assembleKnowledge(nextManifest, projectedTopics, conceptGroups, {snapshotId});
  const errors = validateKnowledgeGraph(knowledge);
  const contentTypes = summarizeContentTypes(knowledge.content_entries);
  const relations = summarizeKnowledgeRelations(knowledge.content_entries);
  for (const unknown of contentTypes.unknown) {
    errors.push(`${unknown.content_id} -> 지원하지 않는 콘텐츠 유형: ${unknown.content_type}`);
  }
  if (errors.length) {
    throw new Error(['합성 예상본의 연결 검증에 실패했습니다.', ...errors.map(error => `- ${error}`)].join('\n'));
  }

  return {
    snapshot_id: snapshotId || null,
    queued_files: queuedFiles,
    knowledge,
    content_types: contentTypes,
    relations,
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

export async function loadAndAuditPublicationTopicQueue() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const current = JSON.parse(await readFile(currentPath, 'utf8'));
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
  return auditPublicationTopicQueue({
    manifest,
    topicFiles,
    conceptGroups,
    snapshotId: current.snapshot_id,
  });
}

function validateKnowledgeGraph(knowledge) {
  const errors = [];
  const sourceIds = new Set(knowledge.sources.map(item => item.coordinate_id));
  const hubIds = new Set(knowledge.topic_hubs.map(item => item.hub_id));
  const ruleIds = new Set(knowledge.rule_cards.map(item => item.rule_id));
  const scenarioIds = new Set(knowledge.scenario_branches.map(item => item.scenario_id));
  const contentIds = new Set(knowledge.content_entries.map(item => item.content_id));
  const conceptIds = new Set((knowledge.concept_cards ?? []).map(item => item.concept_id));
  const referencedSources = new Set();

  const check = (owner, values, allowed, label) => {
    for (const value of values ?? []) {
      if (!allowed.has(value)) errors.push(`${owner} -> 존재하지 않는 ${label}: ${String(value)}`);
    }
  };
  const checkSources = (owner, values) => {
    check(owner, values, sourceIds, '근거');
    for (const value of values ?? []) referencedSources.add(value);
  };

  for (const hub of knowledge.topic_hubs) check(hub.hub_id, hub.content_ids, contentIds, '콘텐츠');
  for (const rule of knowledge.rule_cards) checkSources(rule.rule_id, rule.source_coordinate_ids);
  for (const scenario of knowledge.scenario_branches) {
    check(scenario.scenario_id, scenario.rule_ids, ruleIds, '법리');
    checkSources(scenario.scenario_id, scenario.source_coordinate_ids);
  }
  for (const entry of knowledge.content_entries) {
    check(entry.content_id, entry.rule_ids, ruleIds, '법리');
    check(entry.content_id, entry.scenario_ids, scenarioIds, '사실분기');
    checkSources(entry.content_id, entry.source_coordinate_ids);
    check(entry.content_id, entry.hub_ids, hubIds, '허브');
    check(entry.content_id, entry.related_content_ids, contentIds, '관련 콘텐츠');
    check(entry.content_id, entry.concept_ids, conceptIds, '개념');
  }
  for (const concept of knowledge.concept_cards ?? []) {
    checkSources(concept.concept_id, concept.source_coordinate_ids);
    check(concept.concept_id, concept.related_rule_ids, ruleIds, '관련 법리');
    check(concept.concept_id, concept.related_concept_ids, conceptIds, '관련 개념');
    check(concept.concept_id, concept.related_content_ids, contentIds, '관련 콘텐츠');
    for (const assertion of concept.assertions ?? []) {
      checkSources(assertion.assertion_id, assertion.source_coordinate_ids);
    }
    for (const relation of concept.term_relations ?? []) {
      checkSources(`${concept.concept_id}:${relation.term_ko}`, relation.source_coordinate_ids);
    }
  }
  for (const source of knowledge.sources) {
    if (!referencedSources.has(source.coordinate_id)) {
      errors.push(`어느 법리·사실분기·콘텐츠·개념에서도 참조하지 않는 근거: ${source.coordinate_id}`);
    }
  }

  validateUniqueSlugs(knowledge.topic_hubs, 'hub_id', '허브', errors);
  validateUniqueSlugs(knowledge.content_entries, 'content_id', '콘텐츠', errors);
  validateUniqueSlugs(knowledge.concept_cards ?? [], 'concept_id', '개념', errors);
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
  console.log(`합성 예상본 검증 통과: manifest 밖 주제 ${result.queued_files.length}개 (${queued})`);
  console.log(`예상 정본: 허브 ${result.counts.hubs} / 콘텐츠 ${result.counts.content} / 법리 ${result.counts.rules} / 사실분기 ${result.counts.scenarios} / 근거 ${result.counts.sources}`);
  console.log(`콘텐츠 유형: 과거 별칭 ${result.content_types.aliases.length}건 / 미지원 ${result.content_types.unknown.length}건`);
  console.log(`관계 계약: 타입 간선 ${result.relations.typed_edges}건 / 기존 무타입 항목 ${result.relations.legacy_only_entries}건 / 컨시어지 진입 역할 ${result.relations.concierge_entries}건`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(`합성 예상본 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
