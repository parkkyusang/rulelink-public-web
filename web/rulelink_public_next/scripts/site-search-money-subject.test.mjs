import test from 'node:test';
import assert from 'node:assert/strict';
import {rankSiteSearchDocuments,tokenizeSiteSearchQuery} from '../src/lib/site-search-discovery.ts';
import {encodeSiteSearchIndex,decodeSiteSearchIndex} from '../src/lib/site-search-index.ts';

const now=new Date('2026-10-25T00:00:00Z');
function document(id,title,summary,audience) {
  return {id,kind:'knowledge',href:'/ko/knowledge/'+id,title,summary,context:'생활법률',reviewedAt:now.toISOString(),expiresAt:'2027-10-25T00:00:00Z',evidenceLabels:[],fields:{searchIntent:[],audience:[audience],decision:[],detail:[]}};
}
test('금전 대상은 근거 법령명이나 URL 없이 실제 상황·구제 설명으로 회수한다',()=>{
  const docs=[
    document('case-alpha','개인 거래 피해 대응','송금 내역을 보존하고 민사 회수를 준비합니다.','중고거래 사기 피해자'),
    document('case-beta','개인 거래 신고','신고 절차와 관할을 확인합니다.','중고거래 사기 피해자'),
  ];
  for(const query of ['중고거래 사기당했는데 돈 돌려받고 싶어요','중고거래 사기 피해금 회수','중고거래 사기 금전 반환']) {
    const results=rankSiteSearchDocuments(docs,{now,query});
    assert.equal(results[0]?.id,'case-alpha',query);
    assert.ok(results.every(result=>result.id!=='case-beta'),query);
    assert.ok(results[0].matchReasons.length);
  }
});
test('같은 금전 의미축은 계약·거래 문서에도 적용되며 다른 필수 상황을 생략하지 않는다',()=>{
  const docs=[document('case-gamma','계약 해제','거래대금 반환과 정산을 확인합니다.','계약 당사자')];
  assert.equal(rankSiteSearchDocuments(docs,{now,query:'계약 돈 반환'})[0]?.id,'case-gamma');
  assert.equal(rankSiteSearchDocuments(docs,{now,query:'산재 돈 반환'}).length,0);
});
test('한 글자 금전 명사는 정확 어휘만 확장하고 부분문자·역할 조건은 넓히지 않는다',()=>{
  assert.ok(tokenizeSiteSearchQuery('돈').some(group=>group.includes('@subject:money')));
  assert.ok(!tokenizeSiteSearchQuery('혼돈').some(group=>group.includes('@subject:money')));
  const docs=[document('case-delta','사기 피해 회수','송금 내역과 반환 요구를 준비합니다.','사기 피해자')];
  assert.equal(rankSiteSearchDocuments(docs,{now,query:'고소를 당했어요 돈 반환'}).length,0);
});
test('v3 전송·복원 뒤 브라우저 검색도 의미축과 실제 회수 결과를 유지한다',()=>{
  const docs=[{...document('case-epsilon','개인 거래 피해 대응','민사 회수를 준비합니다.','중고거래 사기 피해자'),semanticFacets:['@subject:money']}];
  const payload=encodeSiteSearchIndex(docs,now.toISOString());
  assert.equal(payload.schema,'rulelink_public_search_index_v3');
  const decoded=decodeSiteSearchIndex(JSON.parse(JSON.stringify(payload)));
  assert.ok(decoded);
  assert.deepEqual(decoded.documents[0].semanticFacets,['@subject:money']);
  const options={now,query:'중고거래 사기당했는데 돈 돌려받고 싶어요'};
  const resultFields=results=>results.map(({id,score,matchReasons,semanticFacets})=>({id,score,matchReasons,semanticFacets}));
  assert.deepEqual(resultFields(rankSiteSearchDocuments(decoded.documents,options)),resultFields(rankSiteSearchDocuments(docs,options)));
  assert.equal(rankSiteSearchDocuments(decoded.documents,options)[0]?.id,'case-epsilon');
});
