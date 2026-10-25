import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveContentSourceCoordinates, sha256Canonical, historicalOnlySourceCoordinateIds} from './publication-derived-core.mjs';

// 원천자료 수집 증거와 개별 조문·판례·변화 안내의 내용 검토를 따로 결박한다.
// 날짜만으로 판본 동일을 추정하거나 법령명만으로 조문 검토범위를 넓히지 않는다.
export function normalizeArticle(value) {
  const match=String(value).match(/^(?:제)?(\d+)(?:조)?(?:의(\d+))?$/u);
  if(!match) throw new Error(`정확한 조문번호가 아닙니다: ${value}`);
  return match[1].padStart(4,'0')+(match[2]?'_'+match[2].padStart(2,'0'):'');
}
export function reviewIndex(reports) {
  const articles=new Set(), cases=new Set(), documents=new Set();
  for(const {value} of reports) {
    if(typeof value.schema!=='string'||!Array.isArray(value.reviewed_laws??[])) throw new Error('검토보고서 형식 오류');
    for(const law of value.reviewed_laws??[]) {
      const name=law.name??law.law_name??law.law_name_ko;
      if(!name||!Array.isArray(law.articles)||!law.articles.length) throw new Error('검토 조문 목록 누락');
      for(const article of law.articles) if(article!=='전문') articles.add(name+'|'+normalizeArticle(article));
    }
    for(const review of [...(value.precedent_reviews??[]),...(value.precedent_checks??[])]) {
      const number=review.case_no??review.case_number;
      if(!number||!(review.result??review.result_ko)) throw new Error('판례 실검토 증거 누락');
      cases.add(number);
    }
    for(const review of value.official_document_checks??[]) {
      if(!review.law_id||!review.promulgation_no||!review.result_ko) throw new Error('공식문서 실검토 증거 누락');
      documents.add(review.law_id+'|'+review.promulgation_no);
    }
  }
  return {articles,cases,documents};
}
function fieldValue(entity,field) {return String(field).replace(/\[(\d+)\]/gu,'.$1').split('.').reduce((v,k)=>v?.[k],entity);}
export function verifyCorrections(reports,loaded) {
  const entities=loaded.flatMap(({data})=>Object.values(data).filter(Array.isArray).flat()).filter(x=>x&&typeof x==='object');
  for(const {value} of reports) for(const finding of value.findings??[]) {
    for(const target of finding.changes??finding.targets??[finding]) {
      const id=target.id??target.content_id??target.rule_id??target.scenario_id;
      const field=target.field??target.field_path, after=target.new??target.new_text??target.after;
      if(!id||!field||typeof after!=='string') throw new Error('교정 보고서의 대상/필드/교정문 누락');
      const matches=entities.filter(x=>[x.content_id,x.rule_id,x.scenario_id,x.change_id,x.change_brief_id].includes(id));
      if(matches.length!==1||fieldValue(matches[0],field)!==after) throw new Error(`필수 교정 미반영: ${id} ${field}`);
    }
  }
}
export function verifyBrief(review,brief) {
  if(!review||!['pass','pass_after_correction'].includes(review.current_review_status)) throw new Error(`변화 안내 실검토 누락: ${brief.change_id??brief.change_brief_id}`);
  const reviewed=structuredClone(brief);
  if(review.original_reviewed_at!==undefined) reviewed.reviewed_at=review.original_reviewed_at;
  if(review.original_expires_at!==undefined) reviewed.expires_at=review.original_expires_at;
  const digest=createHash('sha256').update(JSON.stringify(reviewed)).digest('hex');
  if(digest!==(review.corrected_input_sha256??review.input_sha256)) throw new Error(`변화 안내 검토 입력 불일치: ${brief.change_id??brief.change_brief_id}`);
}
export function statuteMethod(source,law,hash,index,historical=false) {
  if(historical) return 'historical_evidence_preserved';
  const digest=String(source.source_snapshot_id).replace(/^snapshot:/u,'');
  if(/^[a-f0-9]{32,64}$/u.test(digest)&&hash.slice(7).startsWith(digest)) return 'unchanged_text';
  if(!index.articles.has(law.law_name_ko+'|'+normalizeArticle(source.article_no))) throw new Error(`내용 영향 검토 누락: ${source.coordinate_id}`);
  return 'content_impact_review';
}
export function applySourceCheckDate(source,checkedAt,historical) {
  if(!historical) source.last_verified_at=checkedAt;
}
export function currentStatuteOfficialUrl(law,articleNo) {
  const mst=String(law.mst??''), date=String(law.effective_date??'');
  if(!/^[1-9]\d*$/u.test(mst)||!/^\d{8}$/u.test(date)) throw new Error('현행 공식 URL의 법령 판본·시행일 누락');
  const iso=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  if(!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso) throw new Error('현행 공식 URL의 시행일 오류');
  if(typeof law.law_name_ko!=='string'||!law.law_name_ko.trim()||!/^제[1-9]\d*조(?:의[1-9]\d*)?$/u.test(articleNo??'')) throw new Error('현행 공식 URL의 법령명·조문번호 오류');
  // 판본·해시는 점검 증거에 보존하고, 읽기 링크는 공식 현행 조문 안정 주소를 사용한다.
  return `https://www.law.go.kr/${['법령',law.law_name_ko.trim(),articleNo].map(encodeURIComponent).join('/')}`;
}
async function main() {
  const root=path.resolve('../..'), lawPath=process.argv[2], precedentPath=process.argv[3];
  if(!lawPath||!precedentPath) throw new Error('법령 DB와 판례 DB 경로가 필요합니다.');
  const write=process.argv.includes('--write'), now=new Date().toISOString();
  const refreshRoot=path.resolve(path.dirname(lawPath),'../source_maintenance/runs/20261020_standard_live_01');
  const refresh=JSON.parse(await readFile(path.join(refreshRoot,'full_refresh.json'),'utf8'));
  const independent=JSON.parse(await readFile(path.join(refreshRoot,'independent_post_promotion_audit.json'),'utf8'));
  if(refresh.status!=='completed'||independent.schema!=='rulelink_full_refresh_independent_post_promotion_audit_v1'||independent.run_id!=='20261020_standard_live_01'||!Number.isFinite(Date.parse(independent.checked_at))) throw new Error('공식 전체 갱신 독립감사 검증 실패');
  const sourceCheckedAt=independent.checked_at;
  const reports=await Promise.all(['labor-review','criminal-review','other-law-review','expanded-civil-review','expanded-social-review','change-brief-review','root-review'].map(async name=>{
    const file=`scripts/fixtures/source-check-20261025/${name}.json`;
    return {file,value:JSON.parse(await readFile(file,'utf8'))};
  }));
  const reviews=reviewIndex(reports);
  const manifest=JSON.parse(await readFile(path.join(root,'artifacts/publication/topics/manifest.json'),'utf8'));
  const previous=JSON.parse(await readFile(path.join(root,'artifacts/publication/current/bundle.json'),'utf8'));
  const previousLibrary=JSON.parse(await readFile(path.join(root,'artifacts/publication/derived/source-text-library.json'),'utf8'));
  const historicalIds=historicalOnlySourceCoordinateIds(previous);
  const protectedCoordinates=new Set((previous.knowledge.source_authority_units??[]).map(x=>x.source_coordinate_id));
  const lawDb=new DatabaseSync(lawPath,{readOnly:true}), caseDb=new DatabaseSync(precedentPath,{readOnly:true});
  const lawQuery=lawDb.prepare('SELECT * FROM statute_laws WHERE law_name_ko=?');
  const lawByKey=lawDb.prepare('SELECT * FROM statute_laws WHERE law_key=?');
  const articleById=lawDb.prepare("SELECT * FROM statute_articles WHERE id=? AND language='ko'");
  const articleQuery=lawDb.prepare("SELECT * FROM statute_articles WHERE law_key=? AND article_no_normalized=? AND language='ko'");
  const caseQuery=caseDb.prepare('SELECT * FROM precedent_cases WHERE case_no=?');
  const evidence=[], nextDates=new Map(), sourceUpdates=new Map(), loaded=[];
  const descriptors=[...manifest.topics.map(x=>['topics',x]),...manifest.concepts.map(x=>['concepts',x])];
  for(const [folder,descriptor] of descriptors) {
    const file=path.join(root,'artifacts/publication',folder,descriptor.file), data=JSON.parse(await readFile(file,'utf8'));
    for(const source of data.sources) {
      const original=structuredClone(source), historical=historicalIds.has(source.coordinate_id);
      let method,current,quoteAvailable=false;
      if((source.source_kind??'statute')==='statute') {
        // 기관명·법령명 변경에도 원장 source_id의 법령 식별자를 우선한다.
        const direct=articleById.all(source.source_id);
        const laws=direct.length===1?lawByKey.all(direct[0].law_key):lawQuery.all(source.law_name_ko);
        if(laws.length!==1||laws[0].source_status!=='official_current_catalogue') throw new Error(`법령 식별 실패: ${source.coordinate_id}`);
        const law=laws[0], rows=articleQuery.all(law.law_key,normalizeArticle(source.article_no));
        if(rows.length!==1||rows[0].source_status!=='official_source_verified') throw new Error(`조문 식별 실패: ${source.coordinate_id}`);
        const article=rows[0], hash='sha256:'+createHash('sha256').update(article.article_text).digest('hex');
        if(hash!==article.source_hash) throw new Error(`조문 해시 손상: ${source.coordinate_id}`);
        method=statuteMethod(source,law,hash,reviews,historical);
        if(!historical&&!protectedCoordinates.has(source.coordinate_id)) {
          source.law_name_ko=law.law_name_ko;
          source.official_url=currentStatuteOfficialUrl(law,source.article_no);
          source.source_id=article.id; source.source_snapshot_id='snapshot:'+hash.slice(7);
          quoteAvailable=!/<\/?[a-z][^>]*>|\ufffd/iu.test(article.article_text);
        } else {
          quoteAvailable=previousLibrary.bindings.some(x=>x.coordinate_id===source.coordinate_id&&x.public_source_snapshot_id===source.source_snapshot_id);
        }
        current={source_id:article.id,article_no:source.article_no,law_id:law.law_id,promulgation_date:law.promulgation_date,effective_date:law.effective_date,official_text_sha256:hash.slice(7),acquired_at:article.retrieved_at,preserved_authority_binding:protectedCoordinates.has(source.coordinate_id)};
      } else if(source.source_kind==='precedent') {
        if(!reviews.cases.has(source.case_number)) throw new Error(`판례 내용 검토 누락: ${source.case_number}`);
        const rows=caseQuery.all(source.case_number);
        if(rows.length!==1||!rows[0].source_status.startsWith('official_')) throw new Error(`판례 식별 실패: ${source.case_number}`);
        const row=rows[0];
        if(row.decision_date.replaceAll('-','')!==source.decision_date.replaceAll('-','')) throw new Error(`판례 선고일 불일치: ${source.case_number}`);
        method='cited_holding_rechecked';
        current={serial_number:row.serial_number,case_number:row.case_no,holding_sha256:createHash('sha256').update(row.holding_text+'\n'+row.summary_text).digest('hex'),source_hash:row.source_hash,acquired_at:row.retrieved_at};
      } else {
        const rows=lawQuery.all(source.title_ko);
        if(rows.length!==1||!source.promulgation_number.includes(rows[0].promulgation_no)) throw new Error(`공식 문서 공포번호 불일치: ${source.coordinate_id}`);
        if(!reviews.documents.has(rows[0].law_id+'|'+rows[0].promulgation_no)) throw new Error(`공식 문서 검토 누락: ${source.coordinate_id}`);
        method=historical?'historical_evidence_preserved':'promulgation_metadata_rechecked';
        current={law_id:rows[0].law_id,promulgation_no:rows[0].promulgation_no,effective_date:rows[0].effective_date,acquired_at:rows[0].retrieved_at};
      }
      applySourceCheckDate(source,sourceCheckedAt,historical);
      const next=historical?null:new Date(Date.parse(sourceCheckedAt)+(quoteAvailable?180:90)*86400000).toISOString();
      if(next) nextDates.set(source.coordinate_id,next);
      sourceUpdates.set(original.source_id+'|'+original.source_snapshot_id,source);
      evidence.push({coordinate_id:source.coordinate_id,method,original_source_sha256:sha256Canonical(original),current,resulting_source_sha256:sha256Canonical(source),next_check_at:next,historical});
    }
    loaded.push({file,data});
  }
  lawDb.close(); caseDb.close();
  const expected=new Set(previous.knowledge.sources.map(x=>x.coordinate_id));
  if(evidence.length!==expected.size||new Set(evidence.map(x=>x.coordinate_id)).size!==expected.size||evidence.some(x=>!expected.has(x.coordinate_id))) throw new Error('전체 근거 집합이 다릅니다.');
  for(const {data} of loaded) {
    for(const entry of data.content_entries??[]) {
      const dependencies=resolveContentSourceCoordinates(previous.knowledge,entry).filter(id=>!historicalIds.has(id));
      const dates=dependencies.map(id=>nextDates.get(id));
      if(!dates.length||dates.some(x=>!x)) throw new Error(`근거 점검 누락: ${entry.content_id}`);
      entry.reviewed_at=now; entry.expires_at=dates.sort()[0];
    }
    for(const concept of data.concept_cards??[]) {
      const ids=new Set([...(concept.source_coordinate_ids??[]),...(concept.assertions??[]).flatMap(x=>x.source_coordinate_ids??[])]);
      const dates=[...ids].filter(id=>!historicalIds.has(id)).map(id=>nextDates.get(id));
      if(!dates.length||dates.some(x=>!x)) throw new Error(`개념 근거 점검 누락: ${concept.concept_id}`);
      concept.reviewed_at=now; concept.expires_at=dates.sort()[0];
    }
  }
  const briefReviews=reports.flatMap(({value})=>value.entries??[]);
  const seenBriefIds=new Set();
  for(const descriptor of manifest.change_brief_sets) {
    const file=path.join(root,'artifacts/publication/topics',descriptor.file), data=JSON.parse(await readFile(file,'utf8'));
    for(const brief of data.change_briefs) {
      const id=brief.change_id??brief.change_brief_id;
      const matches=briefReviews.filter(x=>x.change_brief_id===id);
      if(matches.length!==1) throw new Error(`변화 안내 검토 집합 누락/중복: ${id}`);
      if(seenBriefIds.has(id)) throw new Error(`변화 안내 대상 중복: ${id}`);
      seenBriefIds.add(id);
      verifyBrief(matches[0],brief);
      brief.reviewed_at=now; brief.expires_at=new Date(Date.parse(sourceCheckedAt)+90*86400000).toISOString();
    }
    for(const assertion of data.assertions) for(const coordinate of assertion.source_coordinates) {
      const updated=sourceUpdates.get(coordinate.source_id+'|'+coordinate.source_snapshot_id);
      if(updated&&coordinate.version_scope!=='historical'&&updated.source_kind!=='official_document') {
        coordinate.source_id=updated.source_id; coordinate.source_snapshot_id=updated.source_snapshot_id;
        if(coordinate.source_hash&&/^snapshot:[a-f0-9]{64}$/u.test(updated.source_snapshot_id)) coordinate.source_hash='sha256:'+updated.source_snapshot_id.slice(9);
        coordinate.last_verified_at=sourceCheckedAt;
      }
    }
    loaded.push({file,data});
  }
  if(briefReviews.length!==seenBriefIds.size||briefReviews.some(x=>!seenBriefIds.has(x.change_brief_id))) throw new Error('변화 안내 검토/대상 집합이 일치하지 않습니다.');
  verifyCorrections(reports,loaded);
  const hashes={};
  for(const [key,file] of [['law_db',lawPath],['precedent_db',precedentPath]]) {
    const hash=createHash('sha256'); for await(const chunk of createReadStream(file)) hash.update(chunk);
    hashes[key]=hash.digest('hex');
    if(independent.active_hashes[key].matches_verified_candidate!==true||hashes[key]!==independent.active_hashes[key].sha256) throw new Error(`공식 갱신 이후 DB 변경: ${key}`);
  }
  const report={schema:'rulelink_public_source_check_v1',reviewed_at:now,official_source_checked_at:sourceCheckedAt,previous_snapshot_id:previous.snapshot_id,previous_bundle_sha256:sha256Canonical(previous),database_sha256:hashes,reviews:reports.map(({file,value})=>({file,sha256:sha256Canonical(value)})),scope_ko:'공개 글의 인용 근거 및 변경 영향 점검. 역사적 판본의 원문과 확인일은 보존한다. 10월20일 이후 신규 변경·모든 후속 판례 탐지까지 보증하지 않는다.',source_checks:evidence,updated_files:loaded.map(({file,data})=>({file:path.relative(root,file).replaceAll('\\','/'),sha256:sha256Canonical(data)}))};
  if(write) {
    for(const {file,data} of loaded) await writeFile(file,JSON.stringify(data,null,2)+'\n','utf8');
    await writeFile(path.join(root,'artifacts/publication/coverage/source-check-20261025.json'),JSON.stringify(report,null,2)+'\n','utf8');
  }
  console.log(JSON.stringify({write,reviewed_at:now,sources:evidence.length,methods:Object.fromEntries(Object.entries(Object.groupBy(evidence,x=>x.method)).map(([key,values])=>[key,values.length])),files:loaded.length},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
