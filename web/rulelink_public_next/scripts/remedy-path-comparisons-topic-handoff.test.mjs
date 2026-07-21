import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicDirectory = path.join(repositoryRoot, 'artifacts', 'publication', 'topics');
const handoffFile = 'remedy-path-comparisons.json';
const handoffPath = path.join(topicDirectory, handoffFile);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function stableStatuteUrl(source) {
  return new URL(`https://www.law.go.kr/${['법령', source.law_name_ko, source.article_no].map(encodeURIComponent).join('/')}`).href;
}

test('구제절차 선택 비교 인계본은 10개 콘텐츠의 근거·규칙·분기 참조를 닫는다', async () => {
  const topic = await readJson(handoffPath);
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.remedy-path-comparisons');
  assert.equal(topic.sources.length, 23);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);

  const sources = new Set(topic.sources.map((item) => item.coordinate_id));
  const rules = new Set(topic.rule_cards.map((item) => item.rule_id));
  const scenarios = new Set(topic.scenario_branches.map((item) => item.scenario_id));
  const contents = new Set(topic.content_entries.map((item) => item.content_id));
  assert.equal(sources.size, topic.sources.length);
  assert.equal(rules.size, topic.rule_cards.length);
  assert.equal(scenarios.size, topic.scenario_branches.length);
  assert.equal(contents.size, topic.content_entries.length);
  assert.deepEqual(topic.topic_hubs[0].content_ids, topic.content_entries.map((item) => item.content_id));

  for (const source of topic.sources) {
    assert.match(source.source_snapshot_id, /^snapshot:[a-f0-9]{32}$/);
    assert.equal(new URL(source.official_url).href, stableStatuteUrl(source));
  }
  for (const rule of topic.rule_cards) {
    assert.ok(rule.source_coordinate_ids.every((id) => sources.has(id)));
    assert.ok(rule.norm.actor_ko && rule.norm.conditions_ko && rule.norm.legal_effect_ko);
  }
  for (const scenario of topic.scenario_branches) {
    assert.ok(scenario.rule_ids.every((id) => rules.has(id)));
    assert.ok(scenario.source_coordinate_ids.every((id) => sources.has(id)));
  }
  for (const entry of topic.content_entries) {
    assert.equal(entry.content_type, 'similar_case_comparison');
    assert.equal(entry.editorial_status, 'approved');
    assert.deepEqual(entry.hub_ids, [topic.topic_id]);
    assert.ok(entry.rule_ids.every((id) => rules.has(id)));
    assert.ok(entry.scenario_ids.every((id) => scenarios.has(id)));
    assert.ok(entry.source_coordinate_ids.every((id) => sources.has(id)));
    assert.ok(entry.related_content_ids.every((id) => contents.has(id)));
    assert.ok(entry.key_points_ko.length >= 3 && entry.action_steps_ko.length >= 3 && entry.facts_to_check_ko.length >= 3);
  }
});

test('제소·정지·불복·중복보상의 핵심 선택 기준을 회귀검사로 고정한다', async () => {
  const topic = await readJson(handoffPath);
  const byId = new Map(topic.content_entries.map((item) => [item.content_id, item]));
  assert.match(byId.get('content.administrative-appeal-vs-revocation-lawsuit').one_line_answer_ko, /심판전치/);
  assert.match(byId.get('content.administrative-appeal-suspension-vs-court-suspension').one_line_answer_ko, /자동 정지되지는/);
  assert.match(byId.get('content.revocation-lawsuit-vs-state-compensation').caution_ko, /자동/);
  assert.match(byId.get('content.payment-order-vs-civil-mediation').key_points_ko.join(' '), /이의.*소송/);
  assert.match(byId.get('content.industrial-accident-benefits-vs-civil-damages').one_line_answer_ko, /조정 규정/);
  assert.match(byId.get('content.summary-order-vs-formal-trial').one_line_answer_ko, /7일/);
  assert.match(byId.get('content.civil-appeal-vs-supreme-appeal').one_line_answer_ko, /법정 상고이유/);
});

test('기존 주제 원본과 식별자가 충돌하지 않는다', async () => {
  const handoff = await readJson(handoffPath);
  const files = (await readdir(topicDirectory)).filter((file) => file.endsWith('.json') && file !== handoffFile && file !== 'manifest.json');
  const occupied = {coordinate_id: new Set(), hub_id: new Set(), rule_id: new Set(), scenario_id: new Set(), content_id: new Set()};
  for (const file of files) {
    const topic = await readJson(path.join(topicDirectory, file));
    for (const item of topic.sources ?? []) occupied.coordinate_id.add(item.coordinate_id);
    for (const item of topic.topic_hubs ?? []) occupied.hub_id.add(item.hub_id);
    for (const item of topic.rule_cards ?? []) occupied.rule_id.add(item.rule_id);
    for (const item of topic.scenario_branches ?? []) occupied.scenario_id.add(item.scenario_id);
    for (const item of topic.content_entries ?? []) occupied.content_id.add(item.content_id);
  }
  for (const item of handoff.sources) assert.ok(!occupied.coordinate_id.has(item.coordinate_id));
  for (const item of handoff.topic_hubs) assert.ok(!occupied.hub_id.has(item.hub_id));
  for (const item of handoff.rule_cards) assert.ok(!occupied.rule_id.has(item.rule_id));
  for (const item of handoff.scenario_branches) assert.ok(!occupied.scenario_id.has(item.scenario_id));
  for (const item of handoff.content_entries) assert.ok(!occupied.content_id.has(item.content_id));
});

test('독립 인계본은 공유 manifest와 인적 표기를 요구하지 않는다', async () => {
  const [topic, manifest] = await Promise.all([readJson(handoffPath), readJson(path.join(topicDirectory, 'manifest.json'))]);
  assert.ok(!manifest.topics.some((item) => item.file === handoffFile));
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
