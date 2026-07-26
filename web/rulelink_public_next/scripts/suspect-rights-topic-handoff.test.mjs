import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import test from "node:test";
const topicsDir=new URL("../../../artifacts/publication/topics/",import.meta.url);
const topicFileName="suspect-rights.json";
const topic=JSON.parse(await readFile(new URL(topicFileName,topicsDir),"utf8"));
async function otherContentIds(){const ids=new Set();for(const f of await readdir(topicsDir)){if(!f.endsWith(".json")||f===topicFileName)continue;const v=JSON.parse(await readFile(new URL(f,topicsDir),"utf8"));for(const e of v.content_entries??[])ids.add(e.content_id)}return ids}

test("피의자 권리축은 10개 문답의 근거·규칙·판단분기를 닫는다",()=>{
 assert.equal(topic.topic_id,"hub.suspect-rights");assert.equal(topic.sources.length,17);assert.equal(topic.rule_cards.length,10);assert.equal(topic.scenario_branches.length,10);assert.equal(topic.content_entries.length,10);
 const C=new Set(topic.sources.map(x=>x.coordinate_id)),R=new Set(topic.rule_cards.map(x=>x.rule_id)),S=new Set(topic.scenario_branches.map(x=>x.scenario_id)),E=new Set(topic.content_entries.map(x=>x.content_id));
 assert.equal(C.size,17);assert.equal(R.size,10);assert.equal(S.size,10);assert.equal(E.size,10);
 const used=new Set();for(const x of [...topic.rule_cards,...topic.scenario_branches,...topic.content_entries]){assert.ok(x.source_coordinate_ids.length);for(const c of x.source_coordinate_ids){assert.ok(C.has(c));used.add(c)}}assert.deepEqual(used,C);
 for(const e of topic.content_entries){assert.ok(e.rule_ids.every(x=>R.has(x)));assert.ok(e.scenario_ids.every(x=>S.has(x)));assert.deepEqual(e.hub_ids,[topic.topic_id]);assert.ok(e.audience_situation_ko.length>=25);assert.ok(e.action_steps_ko.length>=4);assert.ok(e.facts_to_check_ko.length>=5)}
 assert.deepEqual(new Set(topic.topic_hubs[0].content_ids),E);
});

test("진술·체포·구속·압수수색의 핵심 권리와 시간을 고정한다",()=>{
 const m=new Map(topic.content_entries.map(x=>[x.content_id,x]));
 assert.match(m.get("content.suspect-rights-attendance-request-vs-arrest").one_line_answer_ko,/출석요구와 체포는 다릅니다/);
 assert.match(m.get("content.suspect-rights-right-to-silence").one_line_answer_ko,/개별 질문.*불이익.*유죄의 증거/);
 assert.match(m.get("content.suspect-rights-counsel-during-questioning").one_line_answer_ko,/정당한 사유가 없는 한.*변호인/);
 assert.match(m.get("content.suspect-rights-warrant-arrest-and-48-hours").one_line_answer_ko,/48시간.*즉시 석방/);
 assert.match(m.get("content.suspect-rights-emergency-arrest").one_line_answer_ko,/중한 범죄.*증거인멸 또는 도주.*긴급성.*48시간/);
 assert.match(m.get("content.suspect-rights-arrest-detention-review").one_line_answer_ko,/적부심사.*48시간/);
 assert.match(m.get("content.suspect-rights-search-warrant-vs-emergency").one_line_answer_ko,/원칙적으로.*영장.*법정 예외/);
 assert.match(m.get("content.suspect-rights-statement-record-and-illegal-evidence").one_line_answer_ko,/증감·변경.*적법한 절차/);
});

test("2026-07-22 기준일에는 2025-09-19 현행 스냅샷만 사용하고 2027 미래 시행본을 배제한다",()=>{
 const expected=new Map([
 ["criminal_procedure_ko_0034","snapshot:7bd3f21029ab85cf67dce87c74efa1c7"],["criminal_procedure_ko_0070","snapshot:97e85c346c9388f97467d6c5147352c2"],["criminal_procedure_ko_0199","snapshot:3b467c2cf5b37d13b665de0e9e8d2157"],["criminal_procedure_ko_0200","snapshot:91113c71ffd1ce3cc6ef1efea3cf658f"],
 ["criminal_procedure_ko_0200_02","snapshot:e3f53a21e377c54baa4d30224eabd938"],["criminal_procedure_ko_0200_03","snapshot:d9c7d0c467a9e181566ad8225d3e4c40"],["criminal_procedure_ko_0200_04","snapshot:875969a38f79c165b0b546a41bd218f9"],["criminal_procedure_ko_0200_05","snapshot:923fdb2be7e70bd8c81231ab3e24fd4b"],
 ["criminal_procedure_ko_0201","snapshot:119f79971d1f558ec7a72d739572301d"],["criminal_procedure_ko_0214_02","snapshot:a67544b430b30980257589323ae1b45b"],["criminal_procedure_ko_0215","snapshot:df0eafb4102129c696b65ca35b0a9362"],["criminal_procedure_ko_0216","snapshot:a3245b064a4dc7a3961ee032050625ca"],
 ["criminal_procedure_ko_0243_02","snapshot:48ade96b39dd5171e4e25a332e55a3b7"],["criminal_procedure_ko_0244","snapshot:16c59f840bca8fd12b2545d13ee421ed"],["criminal_procedure_ko_0244_03","snapshot:8f0ea5a956de3551fe11339bfa2c0c87"],["criminal_procedure_ko_0244_04","snapshot:4fd1d27cec4e8c462a97b6b01d66d38b"],["criminal_procedure_ko_0308_02","snapshot:579b984dde7b2e45d86bf37bb30e6d36"]]);
 const future=new Set(["snapshot:7e6dad83ba5dc92626817cf0c7332d53","snapshot:23a0441a0d1e4b17c9b65825cc4290c8","snapshot:baef3b95a6e6c0637e354bfd6e72857d","snapshot:093fd2785a2f98a90b8747802b0a9829","snapshot:7316f6c8f19d2b5b9932bd3000cca68a","snapshot:e1b64289777371caf64a1651aef20dce","snapshot:d2889f8d7f11f452c4b7f3bf5c20904f","snapshot:d9dbd9af86e8ea34704d0c56d71845e4","snapshot:12151767bc35dc0912762de2699a8e23","snapshot:adff773e658143759b1196ca3b17e194","snapshot:e9b23a3cf73cef4044dd1fb69354e4d2","snapshot:ab5dc797214007031a641636084bac13","snapshot:39ba8de66ca3644ec69fcc73314800e2","snapshot:12f4ec37b4a254bbbca0172750e37d6d"]);
 assert.equal(expected.size,topic.sources.length);for(const s of topic.sources){assert.equal(s.source_snapshot_id,expected.get(s.source_id));assert.equal(future.has(s.source_snapshot_id),false);assert.match(s.official_url,/^https:\/\/www\.law\.go\.kr\/%EB%B2%95%EB%A0%B9\//);assert.ok(s.official_url.endsWith(encodeURIComponent(s.article_no)))}
});

test("기존 범죄피해·증거 콘텐츠로 연결되고 식별자가 충돌하지 않는다",async()=>{const ids=await otherContentIds();for(const e of topic.content_entries){assert.equal(ids.has(e.content_id),false);assert.ok(e.related_content_ids.length);for(const r of e.related_content_ids)assert.ok(ids.has(r),`${r} 없음`)}});
test("독립 인계본은 공유 출판 상태와 인적 표기를 변경하지 않는다",async()=>{const manifest=JSON.parse(await readFile(new URL("manifest.json",topicsDir),"utf8"));const integrated=JSON.stringify(manifest).includes(topicFileName);const current=JSON.parse(await readFile(new URL("../current/bundle.json",topicsDir),"utf8"));assert.equal(current.knowledge.topic_hubs.some(h=>h.hub_id===topic.topic_id),integrated);assert.equal(JSON.stringify(topic).includes("author"),false);assert.equal(JSON.stringify(topic).includes("reviewer"),false)});
