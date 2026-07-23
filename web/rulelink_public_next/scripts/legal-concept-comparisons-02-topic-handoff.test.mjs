import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {assembleKnowledge} from './compose-publication-knowledge.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicDirectory = path.join(repositoryRoot, 'artifacts', 'publication', 'topics');
const currentBundlePath = path.join(repositoryRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const handoffFile = 'legal-concept-comparisons-02.json';
const handoffPath = path.join(topicDirectory, handoffFile);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function allTopicContentIds() {
  const ids = new Set();
  for (const file of (await readdir(topicDirectory)).filter((item) => item.endsWith('.json') && item !== 'manifest.json')) {
    const topic = await readJson(path.join(topicDirectory, file));
    for (const entry of topic.content_entries ?? []) ids.add(entry.content_id);
  }
  return ids;
}

function stableStatuteUrl(source) {
  return new URL(`https://www.law.go.kr/${['법령', source.law_name_ko, source.article_no].map(encodeURIComponent).join('/')}`).href;
}

test('두 번째 법률개념 비교 인계본은 출처·규칙·사실분기 참조를 닫는다', async () => {
  const topic = await readJson(handoffPath);
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.legal-concept-comparisons-02');
  assert.equal(topic.topic_hubs.length, 1);
  assert.equal(topic.sources.length, 26);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);

  const sourceIds = new Set(topic.sources.map((item) => item.coordinate_id));
  const ruleIds = new Set(topic.rule_cards.map((item) => item.rule_id));
  const scenarioIds = new Set(topic.scenario_branches.map((item) => item.scenario_id));
  const contentIds = new Set(topic.content_entries.map((item) => item.content_id));
  const allContentIds = await allTopicContentIds();
  assert.equal(sourceIds.size, topic.sources.length);
  assert.equal(ruleIds.size, topic.rule_cards.length);
  assert.equal(scenarioIds.size, topic.scenario_branches.length);
  assert.equal(contentIds.size, topic.content_entries.length);
  assert.deepEqual(new Set(topic.topic_hubs[0].content_ids), contentIds);

  for (const source of topic.sources) {
    assert.match(source.source_snapshot_id, /^snapshot:[a-f0-9]{32}$/);
    assert.equal(new URL(source.official_url).href, stableStatuteUrl(source));
    assert.ok(source.last_verified_at);
  }
  for (const rule of topic.rule_cards) {
    assert.ok(rule.proposition_ko.length > 20);
    assert.ok(rule.norm.actor_ko && rule.norm.conditions_ko && rule.norm.legal_effect_ko);
    assert.ok(rule.source_coordinate_ids.every((id) => sourceIds.has(id)));
  }
  for (const scenario of topic.scenario_branches) {
    assert.ok(scenario.rule_ids.every((id) => ruleIds.has(id)));
    assert.ok(scenario.source_coordinate_ids.every((id) => sourceIds.has(id)));
    assert.ok(scenario.decision_fact_ko && scenario.when_true_ko && scenario.when_false_ko);
  }
  for (const entry of topic.content_entries) {
    assert.equal(entry.content_type, 'similar_case_comparison');
    assert.equal(entry.editorial_status, 'approved');
    assert.deepEqual(entry.hub_ids, [topic.topic_id]);
    assert.ok(entry.rule_ids.every((id) => ruleIds.has(id)));
    assert.ok(entry.scenario_ids.every((id) => scenarioIds.has(id)));
    assert.ok(entry.source_coordinate_ids.every((id) => sourceIds.has(id)));
    assert.ok(entry.related_content_ids.every((id) => allContentIds.has(id)));
    assert.ok(entry.key_points_ko.length >= 3);
    assert.ok(entry.action_steps_ko.length >= 3);
    assert.ok(entry.facts_to_check_ko.length >= 3);
    assert.ok(entry.body_sections.length >= 2);
  }
});

test('비교 요약 10건이 기존 상세 정본으로 이어진다', async () => {
  const topic = await readJson(handoffPath);
  const local = new Set(topic.content_entries.map((item) => item.content_id));
  for (const entry of topic.content_entries) {
    assert.ok(entry.related_content_ids.some((id) => !local.has(id)), `${entry.content_id}: 외부 상세 정본 링크가 없습니다.`);
  }
});

test('신청·성립·시효·금전효과의 혼동 방지 문구를 회귀검사로 고정한다', async () => {
  const topic = await readJson(handoffPath);
  const byId = new Map(topic.content_entries.map((item) => [item.content_id, item]));
  assert.match(byId.get('content.certified-demand-vs-judicial-claim').one_line_answer_ko, /6개월/);
  assert.match(byId.get('content.lease-registration-application-vs-completion').one_line_answer_ko, /등기.*완료/);
  assert.match(byId.get('content.divorce-agreement-vs-effective-divorce').one_line_answer_ko, /가정법원.*신고/);
  assert.match(byId.get('content.loan-obligation-vs-guarantee-obligation').one_line_answer_ko, /주채무.*보증채무/);
  assert.match(byId.get('content.contractual-interest-vs-default-damages').one_line_answer_ko, /시작일.*적용 이율/);
  assert.match(byId.get('content.crime-victim-relief-fund-vs-civil-damages').key_points_ko.join(' '), /3년.*10년/);
});

test('두 번째 비교 인계본은 인적 표기와 운영 통합을 요구하지 않는다', async () => {
  const topic = await readJson(handoffPath);
  const manifest = await readJson(path.join(topicDirectory, 'manifest.json'));
  const descriptor = manifest.topics.find((item) => item.file === handoffFile);
  if (descriptor) {
    assert.equal(descriptor.topic_id, topic.topic_id);
    const current = await readJson(currentBundlePath);
    const published = new Set(current.knowledge.content_entries.map((item) => item.content_id));
    for (const entry of topic.content_entries) assert.ok(published.has(entry.content_id));
  }

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

test('현재 공개 주제들과 합성해도 식별자 충돌 없이 10건이 추가된다', async () => {
  const manifest = await readJson(path.join(topicDirectory, 'manifest.json'));
  const topics = [];
  for (const descriptor of manifest.topics) {
    topics.push(await readJson(path.join(topicDirectory, descriptor.file)));
  }
  const nextManifest = structuredClone(manifest);
  const descriptor = nextManifest.topics.find((item) => item.file === handoffFile);
  if (!descriptor) {
    nextManifest.topics.push({topic_id: 'hub.legal-concept-comparisons-02', file: handoffFile});
    nextManifest.content_entry_topic_order.push('hub.legal-concept-comparisons-02');
  }
  const beforeCount = topics.reduce((sum, topic) => sum + topic.content_entries.length, 0);
  const nextTopics = descriptor ? topics : [...topics, await readJson(handoffPath)];
  const conceptDirectory = path.resolve(topicDirectory, '..', 'concepts');
  const conceptGroups = [];
  for (const conceptDescriptor of nextManifest.concepts ?? []) {
    conceptGroups.push(await readJson(path.join(conceptDirectory, conceptDescriptor.file)));
  }
  const current = await readJson(currentBundlePath);
  const knowledge = assembleKnowledge(
    nextManifest,
    nextTopics,
    conceptGroups,
    {snapshotId: current.snapshot_id},
  );
  assert.equal(knowledge.content_entries.length, beforeCount + (descriptor ? 0 : 10));
});
