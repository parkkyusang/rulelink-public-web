import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const topicsDir = new URL("../../../artifacts/publication/topics/", import.meta.url);
const topicFileName = "deadline-and-timing-comparisons.json";
const topic = JSON.parse(await readFile(new URL(topicFileName, topicsDir), "utf8"));

async function loadOtherContentIds() {
  const ids = new Set();
  for (const fileName of await readdir(topicsDir)) {
    if (!fileName.endsWith(".json") || fileName === topicFileName) continue;
    const value = JSON.parse(await readFile(new URL(fileName, topicsDir), "utf8"));
    for (const entry of value.content_entries ?? []) ids.add(entry.content_id);
  }
  return ids;
}

test("기한·시점 비교축은 10개 콘텐츠의 근거·규칙·사실분기를 닫는다", () => {
  assert.equal(topic.topic_id, "hub.deadline-and-timing-comparisons");
  assert.equal(topic.sources.length, 19);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);

  const coordinates = new Set(topic.sources.map((source) => source.coordinate_id));
  const rules = new Set(topic.rule_cards.map((rule) => rule.rule_id));
  const scenarios = new Set(topic.scenario_branches.map((scenario) => scenario.scenario_id));
  const entries = new Set(topic.content_entries.map((entry) => entry.content_id));
  assert.equal(coordinates.size, 19);
  assert.equal(rules.size, 10);
  assert.equal(scenarios.size, 10);
  assert.equal(entries.size, 10);

  for (const item of [...topic.rule_cards, ...topic.scenario_branches, ...topic.content_entries]) {
    assert.ok(item.source_coordinate_ids.length > 0);
    for (const coordinateId of item.source_coordinate_ids) assert.ok(coordinates.has(coordinateId));
  }
  for (const entry of topic.content_entries) {
    assert.ok(entry.rule_ids.every((id) => rules.has(id)));
    assert.ok(entry.scenario_ids.every((id) => scenarios.has(id)));
    assert.deepEqual(entry.hub_ids, [topic.topic_hubs[0].hub_id]);
  }
  assert.deepEqual(new Set(topic.topic_hubs[0].content_ids), entries);
});

test("기한 숫자뿐 아니라 기산점·대상·효과 차이를 회귀검사로 고정한다", () => {
  const byId = new Map(topic.content_entries.map((entry) => [entry.content_id, entry]));
  assert.match(byId.get("content.administrative-appeal-vs-revocation-suit-deadline").one_line_answer_ko, /180일.*1년/);
  assert.match(byId.get("content.online-withdrawal-seven-days-vs-defect-deadline").one_line_answer_ko, /7일.*3개월.*30일/);
  assert.match(byId.get("content.unfair-dismissal-vs-wage-claim-deadline").one_line_answer_ko, /3개월.*3년/);
  assert.match(byId.get("content.property-division-vs-consolation-deadline").one_line_answer_ko, /2년.*3년.*10년/);
  assert.match(byId.get("content.inheritance-choice-vs-recovery-claim-deadline").one_line_answer_ko, /3개월.*3년.*10년/);
  assert.match(byId.get("content.payment-order-objection-vs-civil-appeal-deadline").one_line_answer_ko, /송달일부터 2주/);
  assert.match(byId.get("content.summary-order-formal-trial-vs-criminal-appeal-deadline").one_line_answer_ko, /7일/);
  assert.match(byId.get("content.industrial-accident-review-vs-rereview-deadline").one_line_answer_ko, /원결정.*90일.*심사 결정.*90일/);
  assert.match(byId.get("content.labor-commission-rereview-vs-lawsuit-deadline").one_line_answer_ko, /10일.*15일/);
  assert.match(byId.get("content.compensation-order-vs-crime-victim-relief-deadline").one_line_answer_ko, /변론종결 전.*3년.*10년/);
  for (const entry of topic.content_entries) {
    assert.ok(entry.facts_to_check_ko.some((fact) => /일|시점|단계|기간|날짜|형식|기관/.test(fact)));
    assert.ok(entry.caution_ko.length >= 30);
  }
});

test("활성 DB에서 검증한 19개 source 좌표와 해시 접두부를 고정한다", () => {
  const expected = new Map([
    ["administrative_appeals_ko_0027", "snapshot:a2b31dd4fe9025236fb7a0d2297346ee"],
    ["administrative_litigation_ko_0020", "snapshot:fc3e80a546aa9e9f1e5a6d45997553f4"],
    ["e_commerce_consumer_protection_ko_0017", "snapshot:e566cfb40a43e97489618ab48d9a3066"],
    ["labor_standards_act_ko_0028", "snapshot:e3491ec8fab3e49d17c23f5d386805b7"],
    ["labor_standards_act_ko_0049", "snapshot:710a3c8dfa05a8ae835022c72c3ecefc"],
    ["civil_act_ko_0839_02", "snapshot:dcde2d129fdfd2ef0b1871f0c12b6833"],
    ["civil_act_ko_0766", "snapshot:66f88088c9e1d40b1ab8400442293622"],
    ["civil_act_ko_1019", "snapshot:b9f244982ab300cd344069c882d8e66f"],
    ["civil_act_ko_0999", "snapshot:050d4fb01e84b6e3dcc56bcc792b2991"],
    ["civil_procedure_ko_0470", "snapshot:f1302afc598dd5f1f10223f419a5754e"],
    ["civil_procedure_ko_0396", "snapshot:e94632c5b41d6a854849fb5a3374e74d"],
    ["criminal_procedure_ko_0453", "snapshot:a6db3bbee73e53a77e7e6dd39c097f88"],
    ["criminal_procedure_ko_0358", "snapshot:9c8f30a941fbd7e10e8d11f0a69132d1"],
    ["industrial_accident_compensation_insurance_act_ko_0103", "snapshot:f7f1701ba4118baceb87468959101f5e"],
    ["industrial_accident_compensation_insurance_act_ko_0106", "snapshot:4c856ddfe343db699567b08f220844d4"],
    ["labor_relations_commission_act_ko_0026", "snapshot:61d0bbdeb1265683f858a6719dfddcfc"],
    ["labor_relations_commission_act_ko_0027", "snapshot:35eab1f8bc236ed445a53639bd5108b3"],
    ["litigation_promotion_special_ko_0026", "snapshot:245f94740c301d905d7738c6635e3f88"],
    ["crime_victim_protection_ko_0025", "snapshot:423456cf58f3b33153ec5d3bad8dbbe2"],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id));
    assert.match(source.official_url, /^https:\/\/www\.law\.go\.kr\//);
  }
});

test("새 식별자는 기존 주제와 충돌하지 않고 상세 정본 연결도 유효하다", async () => {
  const otherIds = await loadOtherContentIds();
  for (const entry of topic.content_entries) {
    assert.equal(otherIds.has(entry.content_id), false, `${entry.content_id} 중복`);
    assert.ok(entry.related_content_ids.length > 0);
    for (const relatedId of entry.related_content_ids) {
      assert.ok(otherIds.has(relatedId), `${entry.content_id}의 연결 대상 ${relatedId}가 없습니다.`);
    }
  }
});

test("독립 인계본은 공유 출판 상태와 인적 표기를 요구하지 않는다", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", topicsDir), "utf8"));
  assert.equal(JSON.stringify(manifest).includes(topicFileName), false);
  assert.equal(JSON.stringify(topic).includes("author"), false);
  assert.equal(JSON.stringify(topic).includes("reviewer"), false);
});
