import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicDirectory = path.join(repositoryRoot, 'artifacts', 'publication', 'topics');
const topicFile = 'information-network-rights-2026.json';
const topicPath = path.join(topicDirectory, topicFile);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function existingIds() {
  const files = (await readdir(topicDirectory))
    .filter((file) => file.endsWith('.json'))
    .filter((file) => file !== 'manifest.json' && file !== topicFile);
  const result = {
    sources: new Set(),
    hubs: new Set(),
    rules: new Set(),
    scenarios: new Set(),
    contents: new Set(),
  };
  for (const file of files) {
    const value = await readJson(path.join(topicDirectory, file));
    for (const item of value.sources ?? []) result.sources.add(item.coordinate_id);
    for (const item of value.topic_hubs ?? []) result.hubs.add(item.hub_id);
    for (const item of value.rule_cards ?? []) result.rules.add(item.rule_id);
    for (const item of value.scenario_branches ?? []) result.scenarios.add(item.scenario_id);
    for (const item of value.content_entries ?? []) result.contents.add(item.content_id);
  }
  return result;
}

test('정보통신망법 2026 주제는 생활질문 10개의 근거·법리·사실분기를 닫는다', async () => {
  const topic = await readJson(topicPath);
  assert.equal(topic.schema, 'rulelink_public_topic_handoff_v1');
  assert.equal(topic.topic_id, 'topic.information-network-rights-2026');
  assert.equal(topic.topic_hubs.length, 1);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
  assert.ok(topic.sources.length >= 20);

  const sourceIds = new Set(topic.sources.map((item) => item.coordinate_id));
  const hubIds = new Set(topic.topic_hubs.map((item) => item.hub_id));
  const ruleIds = new Set(topic.rule_cards.map((item) => item.rule_id));
  const scenarioIds = new Set(topic.scenario_branches.map((item) => item.scenario_id));
  const contentIds = new Set(topic.content_entries.map((item) => item.content_id));
  assert.equal(sourceIds.size, topic.sources.length);
  assert.equal(ruleIds.size, topic.rule_cards.length);
  assert.equal(scenarioIds.size, topic.scenario_branches.length);
  assert.equal(contentIds.size, topic.content_entries.length);
  assert.deepEqual(new Set(topic.topic_hubs[0].content_ids), contentIds);

  for (const source of topic.sources) {
    assert.match(source.official_url, /^https:\/\/(www\.)?law\.go\.kr\//);
    assert.match(source.source_snapshot_id, /^snapshot:[a-f0-9]{32}$/);
    assert.match(source.source_hash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(source.validation_status, 'verified');
    assert.equal(source.effective_from, '2026-07-07');
    assert.ok(source.last_verified_at);
    if (source.source_id === 'information_network_amendment_21305') {
      assert.equal(source.source_cluster_id, 'change-cluster:7180a6620cd57b8a528a');
    } else {
      assert.match(source.source_event_id, /^event:[a-f0-9]{32}$/);
    }
  }
  for (const rule of topic.rule_cards) {
    assert.ok(rule.source_coordinate_ids.length > 0);
    for (const sourceId of rule.source_coordinate_ids) assert.ok(sourceIds.has(sourceId));
  }
  for (const scenario of topic.scenario_branches) {
    assert.ok(scenario.decision_fact_ko);
    for (const ruleId of scenario.rule_ids) assert.ok(ruleIds.has(ruleId));
    for (const sourceId of scenario.source_coordinate_ids) assert.ok(sourceIds.has(sourceId));
  }
  for (const entry of topic.content_entries) {
    assert.equal(entry.content_type, 'law_change');
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(entry.audience_situation_ko);
    assert.ok(entry.facts_to_check_ko.length >= 4);
    assert.ok(entry.action_steps_ko.length >= 3);
    assert.ok(entry.caution_ko);
    for (const hubId of entry.hub_ids) assert.ok(hubIds.has(hubId));
    for (const ruleId of entry.rule_ids) assert.ok(ruleIds.has(ruleId));
    for (const scenarioId of entry.scenario_ids) assert.ok(scenarioIds.has(scenarioId));
    for (const sourceId of entry.source_coordinate_ids) assert.ok(sourceIds.has(sourceId));
  }
});

test('시행일·적용례·금액·기간의 핵심 법률효과를 회귀검사로 고정한다', async () => {
  const topic = await readJson(topicPath);
  const byId = new Map(topic.content_entries.map((item) => [item.content_id, item]));
  const definitions = byId.get('content.information-network-false-manipulated-information-2026');
  const damages = byId.get('content.information-network-damages-five-times-2026');
  const report = byId.get('content.information-network-report-objection-2026');
  const mediation = byId.get('content.information-network-dispute-mediation-2026');
  const penalty = byId.get('content.information-network-repeat-distribution-penalty-2026');
  const crime = byId.get('content.information-network-false-defamation-penalty-2026');

  assert.match(definitions.one_line_answer_ko, /풍자와 패러디는 제외/);
  assert.match(damages.one_line_answer_ko, /5천만원 범위/);
  assert.match(damages.one_line_answer_ko, /최대 5배/);
  assert.match(damages.caution_ko, /2026년 7월 7일 이후/);
  assert.match(report.one_line_answer_ko, /6개월 이내/);
  assert.match(mediation.one_line_answer_ko, /60일/);
  assert.match(mediation.one_line_answer_ko, /15일/);
  assert.match(mediation.caution_ko, /집행권원/);
  assert.match(penalty.one_line_answer_ko, /두 번 이상/);
  assert.match(penalty.one_line_answer_ko, /10억원 이하/);
  assert.match(penalty.caution_ko, /판결이 확정된 정보를 유통/);
  assert.match(crime.one_line_answer_ko, /5천만원에서 7천만원/);
  assert.match(crime.caution_ko, /7월 7일 전 위반행위에는 종전 벌칙/);
});

test('새 식별자는 기존 공개 지식과 충돌하지 않고 독립 인계 경계를 지킨다', async () => {
  const topic = await readJson(topicPath);
  const existing = await existingIds();
  for (const item of topic.sources) assert.ok(!existing.sources.has(item.coordinate_id));
  for (const item of topic.topic_hubs) assert.ok(!existing.hubs.has(item.hub_id));
  for (const item of topic.rule_cards) assert.ok(!existing.rules.has(item.rule_id));
  for (const item of topic.scenario_branches) assert.ok(!existing.scenarios.has(item.scenario_id));
  for (const item of topic.content_entries) assert.ok(!existing.contents.has(item.content_id));

  for (const entry of topic.content_entries) {
    for (const relatedId of entry.related_content_ids) {
      assert.ok(existing.contents.has(relatedId), `${entry.content_id}: ${relatedId}가 기존 공개 원본에 없습니다.`);
    }
  }

  const manifest = await readJson(path.join(topicDirectory, 'manifest.json'));
  assert.ok(!manifest.topics.some((item) => item.file === topicFile));
  const forbiddenKeys = new Set(['author', 'author_name', 'reviewer', 'reviewer_name', '감수자', '작성자']);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbiddenKeys.has(key), `공개하지 않는 인적 표기 필드가 포함됐습니다: ${key}`);
      visit(child);
    }
  };
  visit(topic);
});
