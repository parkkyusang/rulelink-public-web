import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256Canonical} from './publication-derived-core.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(appRoot, '../..');
const proofs = new WeakMap();

// 과거 콘텐츠 승인 영수증을 변경하지 않고 실제 근거점검 출판을 별도 결박한다.
export function verifyMaintenancePublication({record, previous, current, evidence, topics, reviews}) {
  if (record.schema !== 'rulelink_queue_maintenance_publication_v1'
    || record.from_snapshot_id !== previous.snapshot_id || record.to_snapshot_id !== current.snapshot_id
    || record.from_snapshot_id === record.to_snapshot_id
    || record.previous_bundle_sha256 !== sha256Canonical(previous)
    || record.current_bundle_sha256 !== sha256Canonical(current)
    || record.source_check_sha256 !== sha256Canonical(evidence)
    || evidence.schema !== 'rulelink_public_source_check_v1'
    || evidence.previous_snapshot_id !== previous.snapshot_id
    || evidence.previous_bundle_sha256 !== sha256Canonical(previous)) throw new Error('유지보수 출판 판본·근거점검 결박 불일치');
  if (!Array.isArray(evidence.reviews) || evidence.reviews.length !== 7
    || new Set(evidence.reviews.map(x => x.file)).size !== 7) throw new Error('실검토 보고서 집합 불일치');
  for (const review of evidence.reviews) if (sha256Canonical(reviews.get(review.file)) !== review.sha256) throw new Error('실검토 보고서 해시 불일치');
  const sources = current.knowledge.sources;
  if (evidence.source_checks.length !== sources.length || new Set(evidence.source_checks.map(x=>x.coordinate_id)).size !== sources.length) throw new Error('근거점검 집합 불일치');
  for (const source of sources) {
    const check = evidence.source_checks.find(x=>x.coordinate_id===source.coordinate_id);
    const old = previous.knowledge.sources.find(x=>x.coordinate_id===source.coordinate_id);
    if (!check || !old || check.original_source_sha256 !== sha256Canonical(old)
      || check.resulting_source_sha256 !== sha256Canonical(source)) throw new Error('현행 근거점검 결과 불일치');
  }
  for (const key of ['source_authority_units','source_version_bridges','authority_reading_units','authority_bindings']) {
    if(sha256Canonical(current.knowledge[key]??[])!==sha256Canonical(previous.knowledge[key]??[])) throw new Error('보호된 권위자료 변경');
  }
  if (!Array.isArray(record.topics) || !record.topics.length || new Set(record.topics.map(x=>x.file)).size!==record.topics.length) throw new Error('주제 집합 누락·중복');
  for (const topic of record.topics) {
    const actual = topics.get(topic.file);
    const reviewed = evidence.updated_files.find(x=>x.file===topic.file);
    if (!actual || !reviewed || topic.sha256!==sha256Canonical(actual) || reviewed.sha256!==topic.sha256) throw new Error('현재 주제의 실검토 출판 해시 불일치');
  }
  const proof = Object.freeze({});
  proofs.set(proof, new Map(record.topics.map(x=>[x.file,x.sha256])));
  return proof;
}
export function hasMaintenancePublicationProof(proof, topicFile, receipt) {
  const topics = proofs.get(proof);
  return typeof receipt === 'string' && topics?.has(topicFile) === true && topics.get(topicFile) === receipt;
}

export async function loadMaintenancePublication(queue, current, io = {}) {
  const read = io.readFile ?? readFile;
  const records = queue.maintenance_publications ?? [];
  const matches = records.filter(x=>x.to_snapshot_id===current.snapshot_id);
  if (!matches.length) return null;
  if(matches.length!==1) throw new Error('유지보수 출판 중복');
  const record=matches[0];
  if(!/^artifacts\/publication\/coverage\/source-check-[0-9]+\.json$/u.test(record.source_check_ref)
    || !/^[a-z0-9._-]+$/u.test(record.from_snapshot_id)) throw new Error('유지보수 증거 경로 오류');
  const previous=JSON.parse(await read(path.join(root,'artifacts/publication/snapshots',record.from_snapshot_id,'bundle.json'),'utf8'));
  const evidence=JSON.parse(await read(path.join(root,record.source_check_ref),'utf8'));
  const topics=new Map();
  for(const topic of record.topics) {
    if(!/^artifacts\/publication\/(topics|concepts)\/[a-z0-9._-]+\.json$/u.test(topic.file)) throw new Error('주제 경로 오류');
    topics.set(topic.file,JSON.parse(await read(path.join(root,topic.file),'utf8')));
  }
  const reviews=new Map();
  for(const ref of evidence.reviews) {
    if(!/^scripts\/fixtures\/source-check-[0-9]+\/[a-z0-9-]+\.json$/u.test(ref.file)) throw new Error('실검토 경로 오류');
    reviews.set(ref.file,JSON.parse(await read(path.join(appRoot,ref.file),'utf8')));
  }
  return Object.freeze({record: Object.freeze({...record}), proof:verifyMaintenancePublication({record,previous,current,evidence,topics,reviews})});
}

async function main() {
  const queueFile=path.join(root,'artifacts/publication/production-queue.json');
  const queue=JSON.parse(await readFile(queueFile,'utf8'));
  const current=JSON.parse(await readFile(path.join(root,'artifacts/publication/current/bundle.json'),'utf8'));
  const ref=process.argv[2];
  if(!/^artifacts\/publication\/coverage\/source-check-[0-9]+\.json$/u.test(ref??'')) throw new Error('검증된 근거점검 보고서 경로 필요');
  const evidence=JSON.parse(await readFile(path.join(root,ref),'utf8'));
  const files=[...new Set(queue.items.filter(x=>x.change_mode==='existing_topic_revision'&&x.integrated_snapshot_id).map(x=>x.topic_file))];
  const topics=[];
  for(const file of files) topics.push({file,sha256:sha256Canonical(JSON.parse(await readFile(path.join(root,file),'utf8')))});
  const record={schema:'rulelink_queue_maintenance_publication_v1',from_snapshot_id:evidence.previous_snapshot_id,to_snapshot_id:current.snapshot_id,previous_bundle_sha256:evidence.previous_bundle_sha256,current_bundle_sha256:sha256Canonical(current),source_check_ref:ref,source_check_sha256:sha256Canonical(evidence),topics};
  const records=queue.maintenance_publications??[];
  if(records.some(x=>x.to_snapshot_id===current.snapshot_id)) throw new Error('동일 출판 기록은 덮어쓸 수 없습니다.');
  const next={...queue,maintenance_publications:[...records,record]};
  await loadMaintenancePublication(next,current);
  if(process.argv.includes('--write')) await writeFile(queueFile,JSON.stringify(next,null,2)+'\n');
  console.log(JSON.stringify({write:process.argv.includes('--write'),from:record.from_snapshot_id,to:record.to_snapshot_id,topics:topics.length}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
