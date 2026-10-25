import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Canonical} from './publication-derived-core.mjs';
import {verifyMaintenancePublication, hasMaintenancePublicationProof} from './queue-maintenance-publication.mjs';

function fixture() {
  const previous={snapshot_id:'old',knowledge:{sources:[{coordinate_id:'s',source_snapshot_id:'old'}]}};
  const current={snapshot_id:'new',knowledge:{sources:[{coordinate_id:'s',source_snapshot_id:'new'}]}};
  const topics=new Map([['artifacts/publication/topics/example.json',{topic_id:'example',content_entries:[{content_id:'c'}]}]]);
  const reviews=new Map(Array.from({length:7},(_,i)=>['review'+i,{reviewed_laws:[i]}]));
  const evidence={schema:'rulelink_public_source_check_v1',previous_snapshot_id:'old',previous_bundle_sha256:sha256Canonical(previous),reviews:[...reviews].map(([file,v])=>({file,sha256:sha256Canonical(v)})),source_checks:[{coordinate_id:'s',original_source_sha256:sha256Canonical(previous.knowledge.sources[0]),resulting_source_sha256:sha256Canonical(current.knowledge.sources[0])}],updated_files:[...topics].map(([file,v])=>({file,sha256:sha256Canonical(v)}))};
  const record={schema:'rulelink_queue_maintenance_publication_v1',from_snapshot_id:'old',to_snapshot_id:'new',previous_bundle_sha256:sha256Canonical(previous),current_bundle_sha256:sha256Canonical(current),source_check_sha256:sha256Canonical(evidence),topics:evidence.updated_files};
  return {previous,current,topics,reviews,evidence,record};
}
test('과거 승인 변경 없이 실검토 출판 해시에 결박한 별도 증거만 허용한다',()=>{
  const f=fixture(), proof=verifyMaintenancePublication(f);
  assert.ok(hasMaintenancePublicationProof(proof,f.record.topics[0].file,f.record.topics[0].sha256));
  assert.equal(hasMaintenancePublicationProof({...proof},f.record.topics[0].file,f.record.topics[0].sha256),false);
  assert.ok(Object.isFrozen(proof));
  assert.throws(()=>{proof.set('unreviewed-topic','forged-receipt');}, TypeError);
  assert.throws(()=>{proof.get=()=> 'forged-receipt';}, TypeError);
  f.record.topics.push({file:'unreviewed-topic',sha256:'forged-receipt'});
  assert.equal(hasMaintenancePublicationProof(proof,'unreviewed-topic','forged-receipt'),false);
  assert.equal(hasMaintenancePublicationProof(proof,'unknown',undefined),false);
  assert.equal(hasMaintenancePublicationProof(proof,'unknown',''),false);
});
test('출판본·근거·주제·실검토 보고서 변조와 집합 누락은 거부한다',()=>{
  for(const mutate of [
    f=>f.current.snapshot_id='forged', f=>f.record.from_snapshot_id='other',
    f=>f.current.knowledge.sources[0].source_snapshot_id='forged',
    f=>f.topics.values().next().value.content_entries[0].content_id='other',
    f=>f.reviews.values().next().value.reviewed_laws=[],
    f=>f.evidence.source_checks=[], f=>f.record.topics=[],
    f=>f.evidence.reviews.pop(),
  ]) {const f=fixture();mutate(f);assert.throws(()=>verifyMaintenancePublication(f));}
});
