import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const topicsDir = new URL("../../../artifacts/publication/topics/", import.meta.url);
const topicFileName = "personal-insolvency-recovery.json";
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

test("개인회생·개인파산 축은 10개 문답의 근거·규칙·판단분기를 닫는다", () => {
  assert.equal(topic.topic_id, "hub.personal-insolvency-recovery");
  assert.equal(topic.sources.length, 17);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);

  const coordinates = new Set(topic.sources.map((source) => source.coordinate_id));
  const rules = new Set(topic.rule_cards.map((rule) => rule.rule_id));
  const scenarios = new Set(topic.scenario_branches.map((scenario) => scenario.scenario_id));
  const entries = new Set(topic.content_entries.map((entry) => entry.content_id));
  assert.equal(coordinates.size, 17);
  assert.equal(rules.size, 10);
  assert.equal(scenarios.size, 10);
  assert.equal(entries.size, 10);

  for (const item of [...topic.rule_cards, ...topic.scenario_branches, ...topic.content_entries]) {
    assert.ok(item.source_coordinate_ids.length > 0);
    for (const coordinateId of item.source_coordinate_ids) assert.ok(coordinates.has(coordinateId));
  }
  const usedCoordinates = new Set(
    [...topic.rule_cards, ...topic.scenario_branches, ...topic.content_entries]
      .flatMap((item) => item.source_coordinate_ids),
  );
  assert.deepEqual(usedCoordinates, coordinates);
  for (const entry of topic.content_entries) {
    assert.ok(entry.rule_ids.every((id) => rules.has(id)));
    assert.ok(entry.scenario_ids.every((id) => scenarios.has(id)));
    assert.deepEqual(entry.hub_ids, [topic.topic_hubs[0].hub_id]);
    assert.ok(entry.audience_situation_ko.length >= 25);
    assert.ok(entry.action_steps_ko.length >= 4);
    assert.ok(entry.facts_to_check_ko.length >= 5);
  }
  assert.deepEqual(new Set(topic.topic_hubs[0].content_ids), entries);
});

test("자격·절차·면책의 위험한 오해를 법정 숫자와 단계로 고정한다", () => {
  const byId = new Map(topic.content_entries.map((entry) => [entry.content_id, entry]));
  assert.match(byId.get("content.personal-insolvency-personal-rehabilitation-eligibility").one_line_answer_ko, /15억원.*10억원/);
  assert.match(byId.get("content.personal-insolvency-filing-does-not-automatically-stop-collection").one_line_answer_ko, /자동 중단되는 것은 아닙니다.*개시 전.*개시결정 뒤/);
  assert.match(byId.get("content.personal-insolvency-repayment-period-and-plan-approval").one_line_answer_ko, /3년.*5년/);
  assert.match(byId.get("content.personal-insolvency-approval-is-not-discharge").one_line_answer_ko, /인가결정.*면책결정 확정/);
  assert.match(byId.get("content.personal-insolvency-omitted-creditor-bankruptcy-vs-rehabilitation").one_line_answer_ko, /악의.*파산선고를 알았다.*목록에 기재되지 않은/);
  assert.match(byId.get("content.personal-insolvency-guarantor-collateral-after-discharge").one_line_answer_ko, /보증인.*공동채무자.*담보/);
  const denial = byId.get("content.personal-insolvency-discharge-denial-and-cancellation");
  assert.match(denial.one_line_answer_ko, /재량면책.*1년/);
  assert.ok(denial.key_points_ko.some((point) => /7년.*5년/.test(point)));
});

test("활성 법령 DB에서 계산한 17개 source snapshot을 고정한다", () => {
  const expected = new Map([
    ["law_009930_ko_0564","snapshot:6b278e67917cdd49f61fdc11e4f319ec"],
    ["law_009930_ko_0566","snapshot:37003f8043ff6e9a27648bea52a172a1"],
    ["law_009930_ko_0567","snapshot:0167de420ad9b321386fb8a1154852d8"],
    ["law_009930_ko_0579","snapshot:64d963b2c6c267c4c1c3f15e27f338a5"],
    ["law_009930_ko_0580","snapshot:77fb76a4f1973e5c32d61a9dbd88d109"],
    ["law_009930_ko_0581","snapshot:79a24a38b38171db14602a5913376729"],
    ["law_009930_ko_0588","snapshot:98091dff1624488f7097650659b0dab8"],
    ["law_009930_ko_0589","snapshot:5776b9d39be5f65603375fce5ad4b8fa"],
    ["law_009930_ko_0592","snapshot:c0c3baf9e105b49f9aee18fba44fb61c"],
    ["law_009930_ko_0593","snapshot:2318932b9b844a44723d7ca4d4c4a115"],
    ["law_009930_ko_0595","snapshot:9136dd1ad2b8aab97e991915c5dfde65"],
    ["law_009930_ko_0600","snapshot:09b18d4e7e5ea0dc33c796e3bec7ca1f"],
    ["law_009930_ko_0611","snapshot:e38007c1f054e71f55a45b180d8b6eb9"],
    ["law_009930_ko_0614","snapshot:16522ca61e99493d521b81d283dab4a6"],
    ["law_009930_ko_0615","snapshot:920560d52b44eb296a6a854760368a83"],
    ["law_009930_ko_0625","snapshot:a0efce1eaccc9a3bc60309eab7216c7f"],
    ["law_009930_ko_0626","snapshot:49d8e04ab2b88a9635bec7cf5ede9ae2"],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id));
    assert.match(source.official_url, /^https:\/\/www\.law\.go\.kr\/%EB%B2%95%EB%A0%B9\//);
    assert.doesNotMatch(source.official_url, /\/LSW\/lawView\.do|[?&]lawId=/);
    assert.ok(source.official_url.endsWith(encodeURIComponent(source.article_no)));
  }
});

test("새 식별자는 기존 주제와 충돌하지 않고 채권·보증 콘텐츠로 이어진다", async () => {
  const otherIds = await loadOtherContentIds();
  for (const entry of topic.content_entries) {
    assert.equal(otherIds.has(entry.content_id), false, `${entry.content_id} 중복`);
    assert.ok(entry.related_content_ids.length > 0);
    for (const relatedId of entry.related_content_ids) {
      assert.ok(otherIds.has(relatedId), `${entry.content_id}의 연결 대상 ${relatedId}가 없습니다.`);
    }
  }
});

test("독립 인계본은 공유 출판 상태와 인적 표기를 변경하지 않는다", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", topicsDir), "utf8"));
  const integrated = JSON.stringify(manifest).includes(topicFileName);
  const current = JSON.parse(await readFile(new URL("../current/bundle.json", topicsDir), "utf8"));
  assert.equal(current.knowledge.topic_hubs.some((hub) => hub.hub_id === topic.topic_id), integrated);
  assert.equal(JSON.stringify(topic).includes("author"), false);
  assert.equal(JSON.stringify(topic).includes("reviewer"), false);
});
