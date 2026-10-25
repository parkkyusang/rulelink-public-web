import assert from 'node:assert/strict';
import test from 'node:test';
import {migrateCoverage, portableBundleHash} from './migrate-source-checked-coverage.mjs';
import {canonicalSha256} from './publication-coverage-core.mjs';

function fixture() {
  const knowledge = {sources:[{coordinate_id:'s',source_snapshot_id:'old',last_verified_at:'old'}],content_entries:[{content_id:'c',summary_ko:'검토한 본문',reviewed_at:'old'}],rule_cards:[{rule_id:'r',proposition_ko:'법리'}],scenario_branches:[{scenario_id:'q',when_true_ko:'분기'}],source_authority_units:[],source_version_bridges:[],authority_reading_units:[],authority_bindings:[]};
  const previous={snapshot_id:'old',knowledge},current=structuredClone(previous);
  current.snapshot_id='new'; current.knowledge.sources[0].source_snapshot_id='new'; current.knowledge.sources[0].last_verified_at='new'; current.knowledge.content_entries[0].reviewed_at='new';
  return {previous,current,previousHash:'old-hash',currentHash:'new-hash',manifest:{base_snapshot_id:'old',base_bundle_sha256:'old-hash'},domains:[{units:[{coverage_unit_id:'u',as_of:'2026-07-24',canonical_content_ids:['c'],required_rule_ids:['r'],required_scenario_ids:['q'],required_authority_binding_ids:[],source_version_requirements:[{coordinate_id:'s',source_snapshot_id:'old',last_verified_at:'old'}]}]}],evidence:{previous_snapshot_id:'old',previous_bundle_sha256:canonicalSha256(previous),source_checks:[{coordinate_id:'s',historical:false,resulting_source_sha256:canonicalSha256(current.knowledge.sources[0])}]},evaluation:{verified_result_receipts:[]},release:{releases:[]}};
}
test('검토증거와 의미불변 확인 후 판본만 이관하고 평가시점은 보존한다',()=>{
  const f=fixture(),r=migrateCoverage(f);assert.equal(r.manifest.base_snapshot_id,'new');assert.equal(r.domains[0].units[0].source_version_requirements[0].source_snapshot_id,'new');assert.equal(r.domains[0].units[0].as_of,'2026-07-24');assert.equal(f.domains[0].units[0].source_version_requirements[0].source_snapshot_id,'old');
});
test('본문·법리·분기·권위자료 변경과 근거증거 위조는 자동이관하지 않는다',()=>{
  for(const mutate of [f=>f.current.knowledge.content_entries[0].summary_ko='변경',f=>f.current.knowledge.rule_cards[0].proposition_ko='변경',f=>f.current.knowledge.scenario_branches[0].when_true_ko='변경',f=>f.current.knowledge.authority_bindings.push({binding_id:'new'}),f=>f.evidence.source_checks[0].resulting_source_sha256='forged',f=>f.evaluation.verified_result_receipts.push({}),f=>f.release.releases.push({})]){const f=fixture();mutate(f);assert.throws(()=>migrateCoverage(f));}
});
test('출판 해시는 개행 정규화만 허용하고 본문 변경은 구별한다',()=>{
  assert.equal(portableBundleHash('{\r\n}'),portableBundleHash('{\n}'));assert.notEqual(portableBundleHash('{}'),portableBundleHash('{ }'));
});
