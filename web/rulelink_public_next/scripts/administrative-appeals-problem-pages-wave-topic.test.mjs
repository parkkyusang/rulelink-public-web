import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {changeLifecycleLabel} from '../src/lib/change-lifecycle.ts';
import {buildKnowledgeSearchDocuments} from '../src/lib/knowledge-search.ts';
import {
  buildSiteSearchDocuments,
  normalizeSiteSearchText,
  rankSiteSearchDocuments,
} from '../src/lib/site-search-discovery.ts';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'topics',
  'administrative-appeals.json',
);
const currentPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);
const [topic, current] = await Promise.all([
  readJson(topicPath),
  readJson(currentPath),
]);

const newContentIds = [
  'content.admin-appeal.wrong-agency-filing-date',
  'content.admin-appeal.written-appeal-required-items',
  'content.admin-appeal.oral-hearing-request',
];
const newRuleIds = [
  'rule.admin-appeal.wrong-agency-filing',
  'rule.admin-appeal.written-appeal-required-items',
  'rule.admin-appeal.oral-hearing-request',
];
const newScenarioIds = [
  'scenario.admin-appeal.wrong-agency-filing',
  'scenario.admin-appeal.disposition-or-inaction',
  'scenario.admin-appeal.oral-hearing-need',
];
const newCoordinates = [
  'coord.admin-appeal.procedure-0023',
  'coord.admin-appeal.procedure-0028',
  'coord.admin-appeal.procedure-0040',
];
const approvedExistingProjectionSha256 =
  'a79f97509b900c04676d29aa76783b75c531077bb47a897a8f90705e0e44061e';

const searchFixture = {
  'content.admin-appeal.wrong-agency-filing-date': [
    '행정심판 청구서를 다른 기관에 잘못 냈는데 접수일이 인정되나요?',
    '행정처분 불복기관을 잘못 안내받아 제출기한이 지났으면 어떻게 하나요?',
    '행정심판 청구서 이송 전 최초 접수일을 무엇으로 증명하나요?',
  ],
  'content.admin-appeal.written-appeal-required-items': [
    '행정심판 청구서에 꼭 적어야 하는 내용은 무엇인가요?',
    '행정기관이 신청에 답하지 않을 때 심판청구서를 어떻게 쓰나요?',
    '행정심판 청구 취지와 이유를 어떤 자료와 함께 정리하나요?',
  ],
  'content.admin-appeal.oral-hearing-request': [
    '행정심판에서 직접 설명하려면 구술심리를 어떻게 신청하나요?',
    '서면만으로 사실관계 설명이 어려우면 위원회에 출석할 수 있나요?',
    '행정심판 구술심리 신청 뒤 무엇을 준비해야 하나요?',
  ],
};

const sourceFixture = {
  'coord.admin-appeal.procedure-0023': {
    source_id: 'administrative_appeals_ko_0023',
    article_no: '제23조',
    source_snapshot_id: 'snapshot:d12d85fdc6797be335c00089720526db',
  },
  'coord.admin-appeal.procedure-0028': {
    source_id: 'administrative_appeals_ko_0028',
    article_no: '제28조',
    source_snapshot_id: 'snapshot:696672e7d80de16c51b0ec17d610f8e',
  },
  'coord.admin-appeal.procedure-0040': {
    source_id: 'administrative_appeals_ko_0040',
    article_no: '제40조',
    source_snapshot_id: 'snapshot:d593f79682caabadc8c8463f0c4c15e5',
  },
};

const relationFixture = {
  'content.admin-appeal.wrong-agency-filing-date': [
    ['deadline', 'content.administrative-appeal-vs-revocation-suit-deadline'],
    ['procedure', 'content.admin-appeal.written-appeal-required-items'],
    ['comparison', 'content.administrative-appeal-vs-revocation-lawsuit'],
  ],
  'content.admin-appeal.written-appeal-required-items': [
    ['procedure', 'content.admin-appeal.wrong-agency-filing-date'],
    ['procedure', 'content.admin-appeal.oral-hearing-request'],
    ['deadline', 'content.administrative-appeal-vs-revocation-suit-deadline'],
  ],
  'content.admin-appeal.oral-hearing-request': [
    ['prerequisite', 'content.admin-appeal.written-appeal-required-items'],
    ['prerequisite', 'content.admin-appeal.wrong-agency-filing-date'],
    ['procedure', 'content.admin-appeal.application-preparation'],
  ],
};

test('기존 행정심판 6개 글과 그 법리·분기·근거의 topic 승인 투영을 보존한다', () => {
  const existingProjection = {
    sources: topic.sources.filter(
      item => !newCoordinates.includes(item.coordinate_id),
    ),
    rules: topic.rule_cards.filter(item => !newRuleIds.includes(item.rule_id)),
    scenarios: topic.scenario_branches.filter(
      item => !newScenarioIds.includes(item.scenario_id),
    ),
    content: topic.content_entries.filter(
      item => !newContentIds.includes(item.content_id),
    ),
  };
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(existingProjection))
      .digest('hex'),
    approvedExistingProjectionSha256,
  );
});

test('신규 3개 문제해결 페이지가 Rule·Scenario·공식근거·행동·증거를 닫는다', () => {
  assert.equal(topic.content_entries.length, 9);
  assert.equal(topic.rule_cards.length, 7);
  assert.equal(topic.scenario_branches.length, 6);
  assert.equal(topic.sources.length, 5);

  const entryById = byId(topic.content_entries, 'content_id');
  const ruleById = byId(topic.rule_cards, 'rule_id');
  const scenarioById = byId(topic.scenario_branches, 'scenario_id');
  const sourceById = byId(topic.sources, 'coordinate_id');

  for (const contentId of newContentIds) {
    const entry = entryById.get(contentId);
    assert.ok(entry, contentId);
    assert.equal(entry.rule_ids.length, 1, `${contentId}: rule`);
    assert.equal(entry.scenario_ids.length, 1, `${contentId}: scenario`);
    assert.equal(entry.source_coordinate_ids.length, 1, `${contentId}: source`);
    assert.ok(entry.facts_to_check_ko.length >= 5, `${contentId}: evidence`);
    assert.ok(entry.action_steps_ko.length >= 5, `${contentId}: action`);
    assert.ok(entry.caution_ko.trim(), `${contentId}: caution`);
    assert.ok(ruleById.has(entry.rule_ids[0]), `${contentId}: rule closure`);
    assert.ok(
      scenarioById.has(entry.scenario_ids[0]),
      `${contentId}: scenario closure`,
    );
    assert.ok(
      sourceById.has(entry.source_coordinate_ids[0]),
      `${contentId}: source closure`,
    );
  }

  assert.match(
    ruleById.get(newRuleIds[0]).proposition_ko,
    /고지하지 않거나 잘못 고지.*지체 없이.*제출된 때/u,
  );
  assert.match(
    ruleById.get(newRuleIds[1]).proposition_ko,
    /처분을 안 날.*부작위를 다투는 청구서에도 청구인, 피청구인과 위원회, 청구 취지와 이유.*선행 신청의 내용과 날짜.*법인·비법인 사단 또는 재단.*대표자·대리인.*이름과 주소/u,
  );
  assert.match(
    ruleById.get(newRuleIds[2]).proposition_ko,
    /서면심리만으로 결정할 수 있다고 인정되는 경우 외에는 구술심리/u,
  );

  for (const [coordinateId, expected] of Object.entries(sourceFixture)) {
    const source = sourceById.get(coordinateId);
    assert.equal(source.source_id, expected.source_id, coordinateId);
    assert.equal(source.article_no, expected.article_no, coordinateId);
    assert.equal(
      source.source_snapshot_id,
      expected.source_snapshot_id,
      coordinateId,
    );
    assert.match(source.official_url, /^https:\/\/www\.law\.go\.kr\//u);
  }

  assertArticle28Coverage(topic);
});

test('신규 9개 자연어 질의가 실제 사이트 ranker에서 해당 페이지 1위와 근거를 만든다', () => {
  const documents = currentSiteSearchDocuments();
  const entryById = byId(topic.content_entries, 'content_id');
  for (const contentId of newContentIds) {
    documents.push(siteDocument(entryById.get(contentId)));
  }

  const currentQueries = new Set(
    current.knowledge.content_entries
      .flatMap(entry => entry.search_intents_ko ?? [])
      .map(normalizeSiteSearchText)
      .filter(Boolean),
  );
  const seen = new Set();
  for (const [contentId, queries] of Object.entries(searchFixture)) {
    assert.deepEqual(entryById.get(contentId).search_intents_ko, queries);
    for (const query of queries) {
      const normalized = normalizeSiteSearchText(query);
      assert.ok(!seen.has(normalized), `${contentId}: 신규 질의 중복`);
      assert.ok(!currentQueries.has(normalized), `${contentId}: 기존 질의 충돌`);
      seen.add(normalized);
      const ranked = rankSiteSearchDocuments(documents, {
        now: new Date('2026-07-26T12:00:00+09:00'),
        query,
      });
      assert.equal(ranked[0]?.id, contentId, `${query}: 1위`);
      assert.ok(ranked[0].matchReasons.length > 0, `${query}: match reason`);
      assert.ok(
        ranked[0].matchReasons.some(
          reason =>
            reason.field === 'search_intent' &&
            reason.text_ko === query,
        ),
        `${query}: exact search intent reason`,
      );
    }
  }
  assert.equal(seen.size, 9);
});

test('신규 typed 관계 9개가 실제 대상과 의미 분류를 정확히 보존한다', () => {
  const universe = new Set([
    ...current.knowledge.content_entries.map(entry => entry.content_id),
    ...newContentIds,
  ]);
  const entryById = byId(topic.content_entries, 'content_id');
  let count = 0;
  for (const [contentId, expected] of Object.entries(relationFixture)) {
    const entry = entryById.get(contentId);
    assert.deepEqual(
      entry.related_edges.map(edge => [edge.relation_type, edge.target_id]),
      expected,
      contentId,
    );
    assert.deepEqual(
      entry.related_content_ids,
      expected.map(([, targetId]) => targetId),
      `${contentId}: legacy projection`,
    );
    for (const edge of entry.related_edges) {
      assert.equal(edge.target_kind, 'content');
      assert.ok(universe.has(edge.target_id), `${contentId}: ${edge.target_id}`);
      assert.notEqual(edge.target_id, contentId);
      assert.ok(edge.label_ko.trim());
      count += 1;
    }
  }
  assert.equal(count, 9);
});

test('근거 극성·검색 1위·관계 분류·비대상 보존 회귀를 음성 변조로 차단한다', () => {
  const changedPolarity = structuredClone(topic);
  changedPolarity.rule_cards.find(
    rule => rule.rule_id === newRuleIds[2],
  ).proposition_ko = '신청해도 구술심리를 해서는 안 됩니다.';
  assert.throws(() => assertLegalWording(changedPolarity));

  const omittedArticle28CommonItems = structuredClone(topic);
  omittedArticle28CommonItems.rule_cards.find(
    rule => rule.rule_id === newRuleIds[1],
  ).proposition_ko =
    '부작위를 다투는 청구서에는 선행 신청의 내용과 날짜만 적습니다.';
  assert.throws(() => assertArticle28Coverage(omittedArticle28CommonItems));

  const ambiguousArticle28Branch = structuredClone(topic);
  ambiguousArticle28Branch.scenario_branches.find(
    scenario => scenario.scenario_id === newScenarioIds[1],
  ).question_ko =
    '이미 내려진 처분을 다투나요, 신청에 응답하지 않은 부작위를 다투나요?';
  assert.throws(() => assertArticle28Coverage(ambiguousArticle28Branch));

  const omittedArticle28Representative = structuredClone(topic);
  omittedArticle28Representative.content_entries.find(
    entry => entry.content_id === newContentIds[1],
  ).facts_to_check_ko = omittedArticle28Representative.content_entries
    .find(entry => entry.content_id === newContentIds[1])
    .facts_to_check_ko.filter(item => !item.includes('대표자'));
  assert.throws(() => assertArticle28Coverage(omittedArticle28Representative));

  const changedRelation = structuredClone(topic);
  changedRelation.content_entries.find(
    entry => entry.content_id === newContentIds[2],
  ).related_edges[1].relation_type = 'procedure';
  assert.throws(() => assertRelations(changedRelation));

  const removedExisting = structuredClone(topic);
  removedExisting.content_entries = removedExisting.content_entries.filter(
    entry => entry.content_id !== 'content.admin-appeal.documents-law-change',
  );
  assert.throws(() => assertExistingIds(removedExisting));
});

function assertLegalWording(candidate) {
  const rules = byId(candidate.rule_cards, 'rule_id');
  assert.match(
    rules.get(newRuleIds[2]).proposition_ko,
    /경우 외에는 구술심리를 해야/u,
  );
}

function assertArticle28Coverage(candidate) {
  const rule = candidate.rule_cards.find(rule => rule.rule_id === newRuleIds[1]);
  const scenario = candidate.scenario_branches.find(
    scenario => scenario.scenario_id === newScenarioIds[1],
  );
  const entry = candidate.content_entries.find(
    entry => entry.content_id === newContentIds[1],
  );

  assert.match(
    rule.proposition_ko,
    /부작위를 다투는 청구서에도 청구인, 피청구인과 위원회, 청구 취지와 이유.*선행 신청의 내용과 날짜/u,
  );
  assert.match(
    rule.proposition_ko,
    /법인·비법인 사단 또는 재단.*대표자·대리인.*이름과 주소/u,
  );
  assert.equal(
    scenario.question_ko,
    '이미 내려진 처분을 다투는 행정심판인가요?',
  );
  assert.match(scenario.when_true_ko, /^처분을 다투므로/u);
  assert.match(
    scenario.when_false_ko,
    /^처분이 아니라 신청에 대한 부작위를 다투므로.*청구인, 피청구인과 위원회, 청구 취지와 이유.*선행 신청의 내용과 날짜/u,
  );
  assert.match(
    entry.one_line_answer_ko,
    /부작위를 다투더라도 청구인, 피청구인과 위원회, 청구 취지·이유.*선행 신청의 내용과 날짜.*법인·비법인 단체.*대표자·대리인/u,
  );
  assert.ok(
    entry.facts_to_check_ko.includes('법인·비법인 사단·재단의 명칭·주소'),
  );
  assert.ok(
    entry.facts_to_check_ko.includes('대표자·관리인·대리인의 이름·주소'),
  );
  assert.match(
    entry.action_steps_ko.join(' '),
    /부작위 청구.*선행 신청의 내용과 날짜.*법인·비법인 사단 또는 재단.*대표자나 대리인.*명칭·이름과 주소/u,
  );
  assert.match(
    entry.caution_ko,
    /부작위 청구라고 해서 청구인, 피청구인과 위원회, 청구 취지와 이유를 생략할 수 없습니다.*법인·비법인 단체와 대표자·대리인/u,
  );
  assert.match(
    entry.body_sections.map(section => section.paragraphs_ko.join(' ')).join(' '),
    /부작위를 다투더라도 청구인, 피청구인과 위원회, 청구 취지와 이유.*법인이 아닌 사단 또는 재단.*대표자·관리인 또는 대리인/u,
  );
}

function assertRelations(candidate) {
  const entries = byId(candidate.content_entries, 'content_id');
  for (const [contentId, expected] of Object.entries(relationFixture)) {
    assert.deepEqual(
      entries
        .get(contentId)
        .related_edges.map(edge => [edge.relation_type, edge.target_id]),
      expected,
    );
  }
}

function assertExistingIds(candidate) {
  const expected = new Set([
    ...current.knowledge.content_entries
      .filter(entry => entry.hub_ids.includes('hub.administrative-appeals'))
      .map(entry => entry.content_id),
    ...newContentIds,
  ]);
  assert.deepEqual(
    new Set(candidate.content_entries.map(entry => entry.content_id)),
    expected,
  );
}

function currentSiteSearchDocuments() {
  const knowledgeDocuments = buildKnowledgeSearchDocuments(current.knowledge);
  const scenarioById = byId(current.knowledge.scenario_branches, 'scenario_id');
  const decisionQuestions = new Map(
    current.knowledge.content_entries.flatMap(entry => {
      const questions = entry.scenario_ids.flatMap(scenarioId => {
        const question = scenarioById.get(scenarioId)?.question_ko?.trim();
        return question ? [{question, scenarioId}] : [];
      });
      return questions.length ? [[entry.content_id, questions]] : [];
    }),
  );
  return buildSiteSearchDocuments(
    current.cards,
    current.change_briefs,
    knowledgeDocuments,
    current.catalog?.topics ?? [],
    {
      changeLifecycle: changeLifecycleLabel,
      knowledgeContentType: value => value || '법률정보',
    },
    decisionQuestions,
  );
}

function siteDocument(entry) {
  return {
    id: entry.content_id,
    kind: 'knowledge',
    href: `/ko/knowledge/${entry.slug}`,
    title: entry.title_ko,
    summary: entry.one_line_answer_ko,
    context: `절차·증거 · ${entry.audience_situation_ko}`,
    reviewedAt: entry.reviewed_at,
    expiresAt: entry.expires_at,
    evidenceLabels: entry.source_coordinate_ids,
    decisionIds: entry.scenario_ids,
    fields: {
      searchIntent: entry.search_intents_ko,
      audience: [entry.audience_situation_ko],
      decision: entry.scenario_ids,
      detail: [
        ...entry.key_points_ko,
        ...entry.facts_to_check_ko,
        ...entry.action_steps_ko,
      ],
    },
  };
}

function byId(values, key) {
  return new Map(values.map(value => [value[key], value]));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
