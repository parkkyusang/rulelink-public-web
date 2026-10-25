import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {normalizeArticle,reviewIndex,verifyCorrections,verifyBrief,statuteMethod,applySourceCheckDate,currentStatuteOfficialUrl} from './renew-publication-from-source-check.mjs';

const report=value=>({file:'검토.json',value:{schema:'검토_v1',...value}});
const source={coordinate_id:'coord.test',article_no:'제26조',source_snapshot_id:'snapshot:'+'a'.repeat(32),last_verified_at:'2026-07-20T00:00:00Z'};
const law={law_name_ko:'검토법',promulgation_date:'20000101',effective_date:'20000101'};
test('현행 공식 원문 링크는 DB 현재 법명·조문 안정주소이며 판본·시행일도 사전 검증한다',()=>{
  const valid={mst:'290789',effective_date:'20261002',law_name_ko:'새 법명'};
  assert.equal(currentStatuteOfficialUrl(valid,'제26조의2'),new URL('https://www.law.go.kr/법령/새 법명/제26조의2').href);
  assert.notEqual(currentStatuteOfficialUrl(valid,'제26조'),currentStatuteOfficialUrl({...valid,law_name_ko:'옛 법명'},'제26조'));
  for(const invalid of [{mst:'',effective_date:'20261002'},{mst:'12&x=1',effective_date:'20261002'},{mst:'0',effective_date:'20261002'},{mst:'12',effective_date:'20260230'},{mst:'12',effective_date:'2026-10-02'},{mst:'12',effective_date:'20261301'}]) assert.throws(()=>currentStatuteOfficialUrl({...valid,...invalid},'제26조'));
  for(const article of ['', '제26조제1항', '26', '제0조']) assert.throws(()=>currentStatuteOfficialUrl(valid,article));
  assert.throws(()=>currentStatuteOfficialUrl({...valid,law_name_ko:''},'제26조'));
});
test('조문 검토는 법령명과 정확한 조문번호 쌍이며 같은 법 미검토 조문은 실패한다',()=>{
  const index=reviewIndex([report({reviewed_laws:[{law_name:'검토법',articles:['제25조']} ]})]);
  assert.throws(()=>statuteMethod(source,law,'sha256:'+'b'.repeat(64),index),/검토 누락/u);
  index.articles.add('검토법|0026');
  assert.equal(statuteMethod(source,law,'sha256:'+'b'.repeat(64),index),'content_impact_review');
  assert.throws(()=>statuteMethod(source,{...law,law_name_ko:'다른법'},'sha256:'+'b'.repeat(64),index),/검토 누락/u);
});
test('날짜가 오래된 현행판도 해시 불일치를 우회할 수 없고 같은 해시만 별도 검토 없이 통과한다',()=>{
  const index=reviewIndex([]);
  assert.throws(()=>statuteMethod(source,law,'sha256:'+'b'.repeat(64),index),/검토 누락/u);
  assert.equal(statuteMethod(source,law,'sha256:'+'a'.repeat(64),index),'unchanged_text');
  assert.throws(()=>statuteMethod({...source,source_snapshot_id:'snapshot:'},law,'sha256:'+'a'.repeat(64),index),/검토 누락/u);
});
test('조문 정규화는 가지번호를 보존하고 항·호 포함 과대 범위는 거부한다',()=>{
  assert.equal(normalizeArticle('26'),'0026');
  assert.equal(normalizeArticle('제246조의2'),'0246_02');
  assert.equal(normalizeArticle('246의2'),'0246_02');
  for(const invalid of ['제26조제1항','26/27','조문없음','']) assert.throws(()=>normalizeArticle(invalid));
});
test('보고서 필수 형식·개별 판례·공식 문서 증거가 빈 값이면 차단한다',()=>{
  assert.throws(()=>reviewIndex([{value:{}}]));
  assert.throws(()=>reviewIndex([report({reviewed_laws:[{law_name:'검토법'}]})]));
  assert.throws(()=>reviewIndex([report({precedent_checks:[{case_number:'판례번호'}]})]));
  assert.throws(()=>reviewIndex([report({official_document_checks:[{law_id:'1',promulgation_no:'2'}]})]));
  const index=reviewIndex([report({precedent_checks:[{case_number:'2005다4529',result_ko:'대조일치'}],official_document_checks:[{law_id:'001',promulgation_no:'22',result_ko:'대조일치'}]})]);
  assert.deepEqual([...index.cases],['2005다4529']); assert.deepEqual([...index.documents],['001|22']);
});
test('역사적 증거는 식별자 문자열 추측이 아닌 호출자의 exact 판정으로 보존한다',()=>{
  const historical=structuredClone(source), current=structuredClone(source);
  assert.equal(statuteMethod(historical,law,'sha256:'+'b'.repeat(64),reviewIndex([]),true),'historical_evidence_preserved');
  applySourceCheckDate(historical,'2026-10-20T20:09:48.352980+00:00',true);
  applySourceCheckDate(current,'2026-10-20T20:09:48.352980+00:00',false);
  assert.deepEqual(historical,source); assert.equal(current.last_verified_at,'2026-10-20T20:09:48.352980+00:00');
  assert.throws(()=>statuteMethod({...source,coordinate_id:'coord.historical-guess'},law,'sha256:'+'b'.repeat(64),reviewIndex([])),/검토 누락/u);
});
test('노동·형사·직접필드 교정 형식 모두 실제 대상 필드와 일치해야 한다',()=>{
  const reports=[report({findings:[{changes:[{id:'c',field:'items[0]',new:'교정'}]},{targets:[{id:'r',field_path:'norm.effect',new_text:'효과'}]},{content_id:'c',field_path:'items.1',after:'두번째'}]})];
  const loaded=[{data:{content_entries:[{content_id:'c',items:['교정','두번째']}],rule_cards:[{rule_id:'r',norm:{effect:'효과'}}]}}];
  assert.doesNotThrow(()=>verifyCorrections(reports,loaded));
  for(const target of ['first','second','rule','missing','duplicate']) {
    const modified=structuredClone(loaded);
    if(target==='first') modified[0].data.content_entries[0].items[0]='구문안';
    if(target==='second') modified[0].data.content_entries[0].items[1]='구문안';
    if(target==='rule') modified[0].data.rule_cards[0].norm.effect='구문안';
    if(target==='missing') modified[0].data.rule_cards=[];
    if(target==='duplicate') modified[0].data.content_entries.push(structuredClone(modified[0].data.content_entries[0]));
    assert.throws(()=>verifyCorrections(reports,modified),/교정 미반영/u);
  }
});
test('변화 안내는 개별 검토 pass와 교정 후 입력 해시에 결박하고 본문 변조를 거부한다',()=>{
  const brief={change_id:'change.a',summary_ko:'검토된 설명',reviewed_at:'원래검토일',expires_at:'원래기한'};
  const digest=createHash('sha256').update(JSON.stringify(brief)).digest('hex');
  const reviewed={current_review_status:'pass_after_correction',corrected_input_sha256:digest,original_reviewed_at:'원래검토일',original_expires_at:'원래기한'};
  assert.doesNotThrow(()=>verifyBrief(reviewed,brief));
  assert.doesNotThrow(()=>verifyBrief(reviewed,{...brief,reviewed_at:'새검토일',expires_at:'새기한'}));
  assert.throws(()=>verifyBrief(reviewed,{...brief,summary_ko:'변조'}),/불일치/u);
  assert.throws(()=>verifyBrief({...reviewed,current_review_status:'not_reviewed'},brief),/누락/u);
  assert.throws(()=>verifyBrief(undefined,brief),/누락/u);
});
test('실제 일곱 보고서와 topic 교정 대상은 쓰기 전에 전부 검증된다',async()=>{
  const names=['labor-review','criminal-review','other-law-review','expanded-civil-review','expanded-social-review','change-brief-review','root-review'];
  const reports=await Promise.all(names.map(async name=>{
    const value=JSON.parse(await readFile(new URL(`./fixtures/source-check-20261025/${name}.json`,import.meta.url),'utf8'));
    return {file:name,value};
  }));
  const manifest=JSON.parse(await readFile('../../artifacts/publication/topics/manifest.json','utf8'));
  const loaded=await Promise.all(manifest.topics.map(async descriptor=>({data:JSON.parse(await readFile('../../artifacts/publication/topics/'+descriptor.file,'utf8'))})));
  assert.equal(reviewIndex(reports).cases.size,13);
  verifyCorrections(reports,loaded);
});
