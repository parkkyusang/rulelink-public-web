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

async function allTopicContentIds() {
  return new Set((await allTopicEntries()).map((entry) => entry.content_id));
}

async function allTopicEntries() {
  const entries = [];
  for (const file of (await readdir(topicDirectory)).filter((item) => item.endsWith('.json') && item !== 'manifest.json')) {
    const topic = await readJson(path.join(topicDirectory, file));
    entries.push(...(topic.content_entries ?? []));
  }
  return entries;
}

function stableStatuteUrl(source) {
  return new URL(`https://www.law.go.kr/${['법령', source.law_name_ko, source.article_no].map(encodeURIComponent).join('/')}`).href;
}

test('구제절차 선택 비교 인계본은 10개 콘텐츠의 근거·규칙·분기 참조를 닫는다', async () => {
  const topic = await readJson(handoffPath);
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.remedy-path-comparisons');
  assert.equal(topic.sources.length, 22);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);

  const sources = new Set(topic.sources.map((item) => item.coordinate_id));
  const rules = new Set(topic.rule_cards.map((item) => item.rule_id));
  const scenarios = new Set(topic.scenario_branches.map((item) => item.scenario_id));
  const contents = new Set(topic.content_entries.map((item) => item.content_id));
  const allContentIds = await allTopicContentIds();
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
    assert.ok(entry.related_content_ids.every((id) => allContentIds.has(id)));
    assert.ok(entry.key_points_ko.length >= 3 && entry.action_steps_ko.length >= 3 && entry.facts_to_check_ko.length >= 3);
  }
});

test('구제절차 비교축은 관련 기존 상세 정본을 충분히 연결한다', async () => {
  const topic = await readJson(handoffPath);
  const local = new Set(topic.content_entries.map((item) => item.content_id));
  const externalLinks = topic.content_entries.flatMap((entry) => entry.related_content_ids).filter((id) => !local.has(id));
  assert.ok(new Set(externalLinks).size >= 8);
});

test('빈 관계였던 약식명령·민사불복 두 글은 이유와 다음 행동이 있는 국소 타입 경로를 가진다', async () => {
  const topic = await readJson(handoffPath);
  const allEntries = await allTopicEntries();
  const allEntryById = new Map(allEntries.map((entry) => [entry.content_id, entry]));
  const byId = new Map(topic.content_entries.map((entry) => [entry.content_id, entry]));
  const allowedRelations = new Set(['deadline', 'procedure', 'remedy', 'comparison']);
  const expectedEdges = new Map([
    ['content.summary-order-vs-formal-trial', [
      {
        target_kind: 'content',
        target_id: 'content.summary-order-formal-trial-vs-criminal-appeal-deadline',
        relation_type: 'deadline',
        label_ko: '법원 고지일부터 7일 안에 어떤 불복서류를 낼지 확인합니다.',
      },
    ]],
    ['content.civil-appeal-vs-supreme-appeal', [
      {
        target_kind: 'content',
        target_id: 'content.civil-small-claims-costs-appeal',
        relation_type: 'deadline',
        label_ko: '판결문 송달일부터 2주인 항소기간과 비용·가집행 위험을 먼저 확인합니다.',
      },
      {
        target_kind: 'content',
        target_id: 'content.payment-order-objection-vs-civil-appeal-deadline',
        relation_type: 'comparison',
        label_ko: '받은 문서가 지급명령인지 제1심 판결인지 구분해 2주 불복 방식을 선택합니다.',
      },
    ]],
  ]);

  for (const [contentId, expected] of expectedEdges) {
    const entry = byId.get(contentId);
    assert.deepEqual(entry.related_edges, expected);
    assert.deepEqual(
      entry.related_content_ids,
      expected.filter((edge) => edge.target_kind === 'content').map((edge) => edge.target_id),
    );
    const edgeKeys = new Set();
    for (const edge of entry.related_edges) {
      assert.ok(allowedRelations.has(edge.relation_type));
      const target = allEntryById.get(edge.target_id);
      assert.ok(target, `존재하지 않는 관련 콘텐츠입니다: ${edge.target_id}`);
      assert.notEqual(edge.target_id, contentId);
      assert.match(edge.label_ko, /(확인|선택)합니다\.$/u);
      const edgeKey = `${edge.target_kind}:${edge.target_id}:${edge.relation_type}`;
      assert.ok(!edgeKeys.has(edgeKey), `중복 관계입니다: ${edgeKey}`);
      edgeKeys.add(edgeKey);
      const sameRelationReverse = (target.related_edges ?? []).some((reverse) => (
        reverse.target_kind === 'content'
        && reverse.target_id === contentId
        && reverse.relation_type === edge.relation_type
      ));
      assert.ok(!sameRelationReverse, `같은 관계 유형의 즉시 역참조입니다: ${edge.target_id} → ${contentId}`);
    }
  }
});

test('관계 백필은 대상 두 글의 법리·분기·근거·대상 상황·검토시점과 CTA 경계를 바꾸지 않는다', async () => {
  const topic = await readJson(handoffPath);
  const byId = new Map(topic.content_entries.map((entry) => [entry.content_id, entry]));
  const summaryOrder = byId.get('content.summary-order-vs-formal-trial');
  assert.equal(summaryOrder.reviewed_at, '2026-07-21T14:20:00+00:00');
  assert.equal(summaryOrder.audience_situation_ko, '법원에서 벌금 약식명령을 받고 사실이나 양형을 다투려는 경우');
  assert.deepEqual(summaryOrder.rule_ids, ['rule.remedy-path-comparisons.08']);
  assert.deepEqual(summaryOrder.scenario_ids, ['scenario.remedy-path-comparisons.08']);
  assert.deepEqual(summaryOrder.source_coordinate_ids, [
    'coord.remedy-path-comparisons.criminal-procedure-ko-0448',
    'coord.remedy-path-comparisons.criminal-procedure-ko-0453',
  ]);

  const civilAppeal = byId.get('content.civil-appeal-vs-supreme-appeal');
  assert.equal(civilAppeal.reviewed_at, '2026-07-21T14:20:00+00:00');
  assert.equal(civilAppeal.audience_situation_ko, '민사판결 결과에 불복해 다음 심급을 검토하는 경우');
  assert.deepEqual(civilAppeal.rule_ids, ['rule.remedy-path-comparisons.09']);
  assert.deepEqual(civilAppeal.scenario_ids, ['scenario.remedy-path-comparisons.09']);
  assert.deepEqual(civilAppeal.source_coordinate_ids, [
    'coord.remedy-path-comparisons.civil-procedure-ko-0390',
    'coord.remedy-path-comparisons.civil-procedure-ko-0423',
  ]);

  for (const entry of [summaryOrder, civilAppeal]) {
    assert.ok(!Object.hasOwn(entry, 'product_roles'));
    assert.ok(!Object.hasOwn(entry, 'lawyer_workspace_entry'));
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
  const descriptor = manifest.topics.find((item) => item.file === handoffFile);
  if (descriptor) {
    assert.equal(descriptor.topic_id, topic.topic_id);
    const current = await readJson(path.join(repositoryRoot, 'artifacts', 'publication', 'current', 'bundle.json'));
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
