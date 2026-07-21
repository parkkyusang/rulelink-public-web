import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const topicPath = new URL(
  "../../../artifacts/publication/topics/legal-concept-comparisons.json",
  import.meta.url,
);
const currentBundlePath = new URL(
  "../../../artifacts/publication/current/bundle.json",
  import.meta.url,
);

const topic = JSON.parse(await readFile(topicPath, "utf8"));
const currentBundle = JSON.parse(await readFile(currentBundlePath, "utf8"));
const localContentIds = new Set(topic.content_entries.map((entry) => entry.content_id));
const currentContentIds = new Set(
  currentBundle.knowledge.content_entries.map((entry) => entry.content_id),
);

test("첫 비교축 13건은 기존 상세 가이드로 이어진다", () => {
  assert.equal(topic.topic_id, "hub.legal-concept-comparisons");
  assert.equal(topic.content_entries.length, 13);

  for (const entry of topic.content_entries) {
    const externalLinks = entry.related_content_ids.filter(
      (contentId) => !localContentIds.has(contentId),
    );
    assert.ok(
      externalLinks.length >= 2,
      `${entry.content_id}에 외부 상세 가이드가 2건 이상 필요합니다.`,
    );
    for (const contentId of externalLinks) {
      assert.ok(
        currentContentIds.has(contentId),
        `${entry.content_id}의 연결 대상 ${contentId}가 현재 공개 원본에 없습니다.`,
      );
    }
  }
});

test("주제 원본은 독립 인계 계약을 유지한다", () => {
  assert.equal(topic.schema, "rulelink_public_knowledge_topic_v1");
  assert.equal(topic.rule_cards.length, 13);
  assert.equal(topic.scenario_branches.length, 13);
  assert.ok(topic.sources.length > 0);

  const coordinateIds = new Set(topic.sources.map((source) => source.coordinate_id));
  for (const entry of topic.content_entries) {
    assert.ok(entry.source_coordinate_ids.length > 0);
    for (const coordinateId of entry.source_coordinate_ids) {
      assert.ok(
        coordinateIds.has(coordinateId),
        `${entry.content_id}의 근거 좌표 ${coordinateId}가 없습니다.`,
      );
    }
  }
});
