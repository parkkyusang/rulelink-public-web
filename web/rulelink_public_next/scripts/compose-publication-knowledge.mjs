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

export function assembleKnowledge(manifest, loadedTopics) {
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

export function applyKnowledgeComposition(bundle, knowledge) {
  const next = JSON.parse(JSON.stringify(bundle));
  next.knowledge = knowledge;
  const hashes = {...(next.file_hashes ?? {})};
  for (const key of Object.keys(hashes)) {
    if (key.startsWith('knowledge:content.') || key.startsWith('knowledge-index:')) delete hashes[key];
  }
  for (const entry of knowledge.content_entries) hashes[`knowledge:${entry.content_id}`] = contentReceipt(entry);
  hashes[`knowledge-index:${knowledge.schema}`] = contentReceipt(knowledge);
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
  return {manifest, knowledge: assembleKnowledge(manifest, loadedTopics)};
}

async function main() {
  const args = process.argv.slice(2);
  const writeMode = args.includes('--write');
  const manifestValue = option(args, '--manifest');
  const currentValue = option(args, '--current');
  const manifestPath = manifestValue ? path.resolve(manifestValue) : defaultManifestPath;
  const currentPath = currentValue ? path.resolve(currentValue) : defaultCurrentPath;
  const current = JSON.parse(await readFile(currentPath, 'utf8'));
  const {knowledge} = await loadComposition(manifestPath);
  let expected = applyKnowledgeComposition(current, knowledge);

  if (!writeMode) {
    if (canonicalJson(current.knowledge) !== canonicalJson(expected.knowledge)) throw new Error('현재 공개 지식이 주제별 원본의 합성 결과와 다릅니다. current를 직접 편집하지 말고 조립기를 실행하세요.');
    if (canonicalJson(current.file_hashes) !== canonicalJson(expected.file_hashes)) throw new Error('현재 공개 지식의 해시 영수증이 주제별 합성 결과와 다릅니다.');
    console.log(`주제별 공개 지식 합성 검증 통과: ${knowledge.topic_hubs.length}개 허브, ${knowledge.content_entries.length}개 콘텐츠`);
    return;
  }

  const snapshotId = option(args, '--snapshot-id');
  const builtAt = option(args, '--built-at');
  const sourceSnapshotId = option(args, '--source-snapshot-id');
  if (!snapshotId || !/^[a-z0-9][a-z0-9._-]*$/.test(snapshotId)) throw new Error('--write에는 안전한 --snapshot-id가 필요합니다.');
  if (!builtAt || Number.isNaN(Date.parse(builtAt))) throw new Error('--write에는 ISO 날짜형식의 --built-at이 필요합니다.');
  if (!sourceSnapshotId) throw new Error('--write에는 --source-snapshot-id가 필요합니다.');

  expected = applyKnowledgeComposition({...current, snapshot_id: snapshotId, built_at: builtAt, source_snapshot_id: sourceSnapshotId}, knowledge);
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
  console.log(`주제별 공개 지식 합성 완료: ${snapshotId}, ${knowledge.content_entries.length}개 콘텐츠`);
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
