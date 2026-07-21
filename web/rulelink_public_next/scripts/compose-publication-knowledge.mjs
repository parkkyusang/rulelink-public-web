import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const defaultManifestPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'manifest.json');
const defaultCurrentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const collections = [
  ['sources', 'coordinate_id'],
  ['topic_hubs', 'hub_id'],
  ['rule_cards', 'rule_id'],
  ['scenario_branches', 'scenario_id'],
  ['content_entries', 'content_id'],
];

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function isLawyerWorkspaceEntry(value) {
  return value
    && typeof value === 'object'
    && value.href === '/ko/lawyer-workspace'
    && value.audience === 'verified_attorney'
    && typeof value.question_ko === 'string'
    && value.question_ko.trim().length > 0
    && Array.isArray(value.decision_facts_ko)
    && value.decision_facts_ko.length > 0
    && value.decision_facts_ko.every(item => typeof item === 'string' && item.trim().length > 0);
}

export function contentReceipt(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function assembleKnowledge(manifest, loadedTopics, loadedConceptGroups = []) {
  if (manifest?.schema !== 'rulelink_public_knowledge_manifest_v1') throw new Error('주제 조립 manifest 스키마가 올바르지 않습니다.');
  if (manifest.knowledge_schema !== 'rulelink_public_knowledge_index_v1') throw new Error('공개 지식 스키마가 올바르지 않습니다.');
  if (!Array.isArray(manifest.topics) || !manifest.topics.length) throw new Error('조립할 주제가 없습니다.');
  if (manifest.topics.length !== loadedTopics.length) throw new Error('manifest와 읽은 주제 파일 수가 다릅니다.');

  const topicIds = new Set();
  const fileNames = new Set();
  const topicsById = new Map();
  const assembled = {
    schema: manifest.knowledge_schema,
    sources: [],
    topic_hubs: [],
    rule_cards: [],
    scenario_branches: [],
    content_entries: [],
  };

  for (let index = 0; index < manifest.topics.length; index += 1) {
    const descriptor = manifest.topics[index];
    const topic = loadedTopics[index];
    if (!descriptor || typeof descriptor.topic_id !== 'string' || typeof descriptor.file !== 'string') throw new Error(`manifest.topics[${index}]가 올바르지 않습니다.`);
    if (topicIds.has(descriptor.topic_id)) throw new Error(`중복 주제 식별자: ${descriptor.topic_id}`);
    if (fileNames.has(descriptor.file)) throw new Error(`중복 주제 파일: ${descriptor.file}`);
    topicIds.add(descriptor.topic_id);
    fileNames.add(descriptor.file);
    if (topic?.schema !== 'rulelink_public_knowledge_topic_v1') throw new Error(`${descriptor.file}의 주제 스키마가 올바르지 않습니다.`);
    if (topic.topic_id !== descriptor.topic_id) throw new Error(`${descriptor.file}의 topic_id가 manifest와 다릅니다.`);
    for (const [collection] of collections) {
      if (!Array.isArray(topic[collection])) throw new Error(`${descriptor.file}의 ${collection}가 배열이 아닙니다.`);
    }
    for (const [entryIndex, entry] of topic.content_entries.entries()) {
      if (entry?.concierge_entry !== undefined) {
        throw new Error(`${descriptor.file}의 content_entries[${entryIndex}]에 금지된 concierge_entry가 있습니다.`);
      }
      if (entry?.lawyer_workspace_entry !== undefined && !isLawyerWorkspaceEntry(entry.lawyer_workspace_entry)) {
        throw new Error(`${descriptor.file}의 content_entries[${entryIndex}].lawyer_workspace_entry가 변호사 전용 게이트 계약과 다릅니다.`);
      }
    }
    if (topic.topic_hubs.length !== 1 || topic.topic_hubs[0].hub_id !== descriptor.topic_id) throw new Error(`${descriptor.file}는 자신이 소유하는 주제 허브 하나만 포함해야 합니다.`);
    const declaredContent = topic.topic_hubs[0].content_ids;
    const actualContent = topic.content_entries.map(entry => entry.content_id);
    if (canonicalJson(declaredContent) !== canonicalJson(actualContent)) throw new Error(`${descriptor.file}의 허브 content_ids와 실제 콘텐츠 순서가 다릅니다.`);
    for (const entry of topic.content_entries) {
      if (!Array.isArray(entry.hub_ids) || !entry.hub_ids.includes(descriptor.topic_id)) throw new Error(`${descriptor.file}의 ${entry.content_id}가 소유 주제를 참조하지 않습니다.`);
    }
    topicsById.set(descriptor.topic_id, topic);
  }

  const defaultOrder = manifest.topics.map(item => item.topic_id);
  const entryOrder = manifest.content_entry_topic_order ?? defaultOrder;
  if (entryOrder.length !== defaultOrder.length || new Set(entryOrder).size !== defaultOrder.length || entryOrder.some(topicId => !topicsById.has(topicId))) {
    throw new Error('content_entry_topic_order는 manifest의 모든 주제를 한 번씩 포함해야 합니다.');
  }
  for (const [collection] of collections) {
    const order = collection === 'content_entries' ? entryOrder : defaultOrder;
    for (const topicId of order) assembled[collection].push(...topicsById.get(topicId)[collection]);
  }

  const conceptDescriptors = manifest.concepts ?? [];
  if (!Array.isArray(conceptDescriptors)) throw new Error('manifest.concepts는 배열이어야 합니다.');
  if (conceptDescriptors.length !== loadedConceptGroups.length) throw new Error('manifest와 읽은 개념 파일 수가 다릅니다.');
  if (conceptDescriptors.length) assembled.concept_cards = [];
  const conceptGroupIds = new Set();
  const conceptFiles = new Set();
  for (let index = 0; index < conceptDescriptors.length; index += 1) {
    const descriptor = conceptDescriptors[index];
    const group = loadedConceptGroups[index];
    if (!descriptor || typeof descriptor.concept_group_id !== 'string' || typeof descriptor.file !== 'string') {
      throw new Error(`manifest.concepts[${index}]가 올바르지 않습니다.`);
    }
    if (conceptGroupIds.has(descriptor.concept_group_id)) throw new Error(`중복 개념 묶음 식별자: ${descriptor.concept_group_id}`);
    if (conceptFiles.has(descriptor.file)) throw new Error(`중복 개념 파일: ${descriptor.file}`);
    conceptGroupIds.add(descriptor.concept_group_id);
    conceptFiles.add(descriptor.file);
    if (group?.schema !== 'rulelink_public_concept_group_v1') throw new Error(`${descriptor.file}의 개념 묶음 스키마가 올바르지 않습니다.`);
    if (group.concept_group_id !== descriptor.concept_group_id) throw new Error(`${descriptor.file}의 concept_group_id가 manifest와 다릅니다.`);
    if (!Array.isArray(group.sources) || !Array.isArray(group.concept_cards)) throw new Error(`${descriptor.file}의 sources 또는 concept_cards가 배열이 아닙니다.`);
    assembled.sources.push(...group.sources);
    assembled.concept_cards.push(...group.concept_cards);
  }
  if (assembled.concept_cards) {
    const conceptIds = new Set();
    for (const concept of assembled.concept_cards) {
      if (typeof concept?.concept_id !== 'string' || !concept.concept_id) throw new Error('개념카드에 유효하지 않은 concept_id가 있습니다.');
      if (conceptIds.has(concept.concept_id)) throw new Error(`개념 묶음 사이에 중복된 concept_id: ${concept.concept_id}`);
      conceptIds.add(concept.concept_id);
    }
  }

  for (const [collection, idKey] of collections) {
    const ids = new Set();
    for (const item of assembled[collection]) {
      const id = item?.[idKey];
      if (typeof id !== 'string' || !id) throw new Error(`${collection}에 유효하지 않은 ${idKey}가 있습니다.`);
      if (ids.has(id)) throw new Error(`주제 사이에 중복된 ${idKey}: ${id}`);
      ids.add(id);
    }
  }
  return assembled;
}

export function assembleChangeBriefSets(manifest, loadedSets, knowledge) {
  if (manifest.change_brief_sets === undefined) {
    if (loadedSets.length) throw new Error('manifest에 없는 법령변화 원본이 전달됐습니다.');
    return null;
  }
  const descriptors = manifest.change_brief_sets;
  if (!Array.isArray(descriptors) || descriptors.length !== loadedSets.length) {
    throw new Error('manifest.change_brief_sets와 읽은 법령변화 파일 수가 다릅니다.');
  }
  const setIds = new Set();
  const files = new Set();
  const assertions = [];
  const changeBriefs = [];
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    const set = loadedSets[index];
    if (!descriptor || typeof descriptor.change_brief_set_id !== 'string' || typeof descriptor.file !== 'string') {
      throw new Error(`manifest.change_brief_sets[${index}]가 올바르지 않습니다.`);
    }
    if (setIds.has(descriptor.change_brief_set_id)) throw new Error(`중복 법령변화 묶음 식별자: ${descriptor.change_brief_set_id}`);
    if (files.has(descriptor.file)) throw new Error(`중복 법령변화 파일: ${descriptor.file}`);
    setIds.add(descriptor.change_brief_set_id);
    files.add(descriptor.file);
    if (set?.schema !== 'rulelink_public_change_brief_set_v1') throw new Error(`${descriptor.file}의 법령변화 묶음 스키마가 올바르지 않습니다.`);
    if (!Array.isArray(set.assertions) || !Array.isArray(set.change_briefs)) {
      throw new Error(`${descriptor.file}의 assertions 또는 change_briefs가 배열이 아닙니다.`);
    }
    assertions.push(...set.assertions);
    changeBriefs.push(...set.change_briefs);
  }

  const assertionIds = uniqueCompositionIds(assertions, 'assertion_id', '법령변화 주장');
  uniqueCompositionIds(changeBriefs, 'change_brief_id', '법령변화 브리핑');
  const contentIds = new Set(knowledge.content_entries.map(entry => entry.content_id));
  for (const brief of changeBriefs) {
    for (const assertionId of brief.assertion_ids ?? []) {
      if (!assertionIds.has(assertionId)) throw new Error(`${brief.change_brief_id}가 존재하지 않는 주장 ${assertionId}을 참조합니다.`);
    }
    for (const contentId of brief.related_content_ids ?? []) {
      if (!contentIds.has(contentId)) throw new Error(`${brief.change_brief_id}가 존재하지 않는 공개 콘텐츠 ${contentId}을 참조합니다.`);
    }
  }
  return {
    schema: 'rulelink_public_change_composition_v1',
    assertions,
    change_briefs: changeBriefs,
  };
}

function uniqueCompositionIds(items, idKey, label) {
  const ids = new Set();
  for (const item of items) {
    const id = item?.[idKey];
    if (typeof id !== 'string' || !id) throw new Error(`${label}에 유효하지 않은 ${idKey}가 있습니다.`);
    if (ids.has(id)) throw new Error(`중복된 ${label} 식별자: ${id}`);
    ids.add(id);
  }
  return ids;
}

export function applyKnowledgeComposition(bundle, knowledge, changeComposition = null) {
  const next = JSON.parse(JSON.stringify(bundle));
  next.knowledge = knowledge;
  if (changeComposition) {
    next.assertions = changeComposition.assertions;
    next.change_briefs = changeComposition.change_briefs;
  }
  const hashes = {...(next.file_hashes ?? {})};
  for (const key of Object.keys(hashes)) {
    if (key.startsWith('knowledge:content.') || key.startsWith('knowledge-concept:') || key.startsWith('knowledge-index:')) delete hashes[key];
  }
  for (const entry of knowledge.content_entries) hashes[`knowledge:${entry.content_id}`] = contentReceipt(entry);
  for (const concept of knowledge.concept_cards ?? []) hashes[`knowledge-concept:${concept.concept_id}`] = contentReceipt(concept);
  hashes[`knowledge-index:${knowledge.schema}`] = contentReceipt(knowledge);
  if (changeComposition) {
    for (const key of Object.keys(hashes)) {
      if (key.startsWith('change-assertion:') || key.startsWith('change-brief:') || key.startsWith('change-index:')) delete hashes[key];
    }
    for (const assertion of changeComposition.assertions) hashes[`change-assertion:${assertion.assertion_id}`] = contentReceipt(assertion);
    for (const brief of changeComposition.change_briefs) hashes[`change-brief:${brief.change_brief_id}`] = contentReceipt(brief);
    hashes[`change-index:${changeComposition.schema}`] = contentReceipt(changeComposition);
  }
  next.file_hashes = hashes;
  return next;
}

export async function loadComposition(manifestPath = defaultManifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestDirectory = path.dirname(manifestPath);
  const loadedTopics = [];
  for (const descriptor of manifest.topics ?? []) {
    if (!/^[a-z0-9-]+\.json$/.test(descriptor.file)) throw new Error(`주제 파일명이 안전하지 않습니다: ${descriptor.file}`);
    loadedTopics.push(JSON.parse(await readFile(path.join(manifestDirectory, descriptor.file), 'utf8')));
  }
  const loadedChangeBriefSets = [];
  for (const descriptor of manifest.change_brief_sets ?? []) {
    if (!/^[a-z0-9-]+\.json$/.test(descriptor.file)) throw new Error(`법령변화 파일명이 안전하지 않습니다: ${descriptor.file}`);
    loadedChangeBriefSets.push(JSON.parse(await readFile(path.join(manifestDirectory, descriptor.file), 'utf8')));
  }
  const loadedConceptGroups = [];
  const conceptDirectory = path.resolve(manifestDirectory, '..', 'concepts');
  for (const descriptor of manifest.concepts ?? []) {
    if (!/^[a-z0-9-]+\.json$/.test(descriptor.file)) throw new Error(`개념 파일명이 안전하지 않습니다: ${descriptor.file}`);
    loadedConceptGroups.push(JSON.parse(await readFile(path.join(conceptDirectory, descriptor.file), 'utf8')));
  }
  const knowledge = assembleKnowledge(manifest, loadedTopics, loadedConceptGroups);
  return {
    manifest,
    knowledge,
    changeComposition: assembleChangeBriefSets(manifest, loadedChangeBriefSets, knowledge),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const writeMode = args.includes('--write');
  const manifestValue = option(args, '--manifest');
  const currentValue = option(args, '--current');
  const manifestPath = manifestValue ? path.resolve(manifestValue) : defaultManifestPath;
  const currentPath = currentValue ? path.resolve(currentValue) : defaultCurrentPath;
  const current = JSON.parse(await readFile(currentPath, 'utf8'));
  const {knowledge, changeComposition} = await loadComposition(manifestPath);
  let expected = applyKnowledgeComposition(current, knowledge, changeComposition);

  if (!writeMode) {
    if (canonicalJson(current.knowledge) !== canonicalJson(expected.knowledge)) throw new Error('현재 공개 지식이 주제별 원본의 합성 결과와 다릅니다. current를 직접 편집하지 말고 조립기를 실행하세요.');
    if (changeComposition && (
      canonicalJson(current.assertions) !== canonicalJson(expected.assertions)
      || canonicalJson(current.change_briefs) !== canonicalJson(expected.change_briefs)
    )) throw new Error('현재 법령변화 공개본이 독립 원본의 합성 결과와 다릅니다.');
    if (canonicalJson(current.file_hashes) !== canonicalJson(expected.file_hashes)) throw new Error('현재 공개 지식의 해시 영수증이 주제별 합성 결과와 다릅니다.');
    console.log(`주제별 공개 지식 합성 검증 통과: ${knowledge.topic_hubs.length}개 허브, ${knowledge.content_entries.length}개 콘텐츠, ${knowledge.concept_cards?.length ?? 0}개 개념`);
    return;
  }

  const snapshotId = option(args, '--snapshot-id');
  const builtAt = option(args, '--built-at');
  const sourceSnapshotId = option(args, '--source-snapshot-id');
  if (!snapshotId || !/^[a-z0-9][a-z0-9._-]*$/.test(snapshotId)) throw new Error('--write에는 안전한 --snapshot-id가 필요합니다.');
  if (!builtAt || Number.isNaN(Date.parse(builtAt))) throw new Error('--write에는 ISO 날짜형식의 --built-at이 필요합니다.');
  if (!sourceSnapshotId) throw new Error('--write에는 --source-snapshot-id가 필요합니다.');

  expected = applyKnowledgeComposition(
    {...current, snapshot_id: snapshotId, built_at: builtAt, source_snapshot_id: sourceSnapshotId},
    knowledge,
    changeComposition,
  );
  const text = `${JSON.stringify(expected, null, 2)}\n`;
  const snapshotPath = path.join(repoRoot, 'artifacts', 'publication', 'snapshots', snapshotId, 'bundle.json');
  try {
    const existing = await readFile(snapshotPath, 'utf8');
    if (existing !== text) throw new Error(`불변 스냅샷을 덮어쓸 수 없습니다: ${snapshotId}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(path.dirname(snapshotPath), {recursive: true});
    await writeFile(snapshotPath, text, 'utf8');
  }
  await writeFile(currentPath, text, 'utf8');
  console.log(`주제별 공개 지식 합성 완료: ${snapshotId}, ${knowledge.content_entries.length}개 콘텐츠, ${knowledge.concept_cards?.length ?? 0}개 개념`);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 값이 없습니다.`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(`공개 지식 합성 실패: ${error.message}`);
    process.exitCode = 1;
  });
}
