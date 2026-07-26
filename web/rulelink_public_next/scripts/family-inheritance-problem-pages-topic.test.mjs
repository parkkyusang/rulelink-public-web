import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  compareQuestionSignatures,
  deriveQuestionSignature,
} from './audit-publication-semantic-overlap.mjs';
import {
  buildSiteSearchDocuments,
  rankSiteSearchDocuments,
} from '../src/lib/site-search-discovery.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const topicPath = path.join(
  repoRoot,
  'artifacts',
  'publication',
  'topics',
  'family-inheritance.json',
);
const currentBundlePath = path.join(
  repoRoot,
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);
const sourceTextLibraryPath = path.join(
  repoRoot,
  'artifacts',
  'publication',
  'derived',
  'source-text-library.json',
);

const NEW_CONTENT_IDS = [
  'content.one-coheir-renounces-share',
  'content.limited-acceptance-payment-before-deadline',
  'content.limited-acceptance-late-unreported-creditor',
];
const NEW_RULE_IDS = [
  'rule.family-inheritance.rule-renounced-share-reallocation',
  'rule.family-inheritance.rule-limited-payment-timing',
  'rule.family-inheritance.rule-late-unreported-creditor',
];
const NEW_SCENARIO_IDS = [
  'scenario.family-inheritance.sc-one-coheir-renounces',
  'scenario.family-inheritance.sc-payment-demand-before-deadline',
  'scenario.family-inheritance.sc-unreported-creditor-after-deadline',
];

const EXPECTED_AXES = {
  'content.one-coheir-renounces-share': {
    ruleId: 'rule.family-inheritance.rule-renounced-share-reallocation',
    scenarioId: 'scenario.family-inheritance.sc-one-coheir-renounces',
    sources: [
      'coord.family-inheritance.civil-act-ko-1019',
      'coord.family-inheritance.civil-act-ko-1041',
      'coord.family-inheritance.civil-act-ko-1042',
      'coord.family-inheritance.civil-act-ko-1043',
      'coord.family-inheritance.src-supreme-2020geu42',
    ],
    decisionFragment: '일부 공동상속인의 포기를 수리',
    answerFragment: '기존 상속분 비율',
  },
  'content.limited-acceptance-payment-before-deadline': {
    ruleId: 'rule.family-inheritance.rule-limited-payment-timing',
    scenarioId:
      'scenario.family-inheritance.sc-payment-demand-before-deadline',
    sources: [
      'coord.family-inheritance.civil-act-ko-1028',
      'coord.family-inheritance.civil-act-ko-1032',
      'coord.family-inheritance.civil-act-ko-1033',
      'coord.family-inheritance.civil-act-ko-1034',
      'coord.family-inheritance.civil-act-ko-1038',
    ],
    decisionFragment: '신고기간이 이미 끝났는지',
    answerFragment: '기간이 끝나기 전에는 변제를 거절',
  },
  'content.limited-acceptance-late-unreported-creditor': {
    ruleId: 'rule.family-inheritance.rule-late-unreported-creditor',
    scenarioId:
      'scenario.family-inheritance.sc-unreported-creditor-after-deadline',
    sources: [
      'coord.family-inheritance.civil-act-ko-1028',
      'coord.family-inheritance.civil-act-ko-1032',
      'coord.family-inheritance.civil-act-ko-1039',
    ],
    decisionFragment: '상속재산 잔여와 특별담보권',
    answerFragment: '남은 상속재산이 있을 때만',
  },
};

function clone(value) {
  return structuredClone(value);
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function indexBy(items, key) {
  return new Map(items.map(item => [item[key], item]));
}

function stripDerivedWorkspaceFacts(entry) {
  const copy = clone(entry);
  if (copy.lawyer_workspace_entry) {
    delete copy.lawyer_workspace_entry.decision_facts_ko;
  }
  return copy;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-z가-힣]+/gu, '');
}

function problemPageIssues(topic) {
  const issues = [];
  const contentById = indexBy(topic.content_entries, 'content_id');
  const ruleById = indexBy(topic.rule_cards, 'rule_id');
  const scenarioById = indexBy(topic.scenario_branches, 'scenario_id');
  const sourceById = indexBy(topic.sources, 'coordinate_id');

  for (const contentId of NEW_CONTENT_IDS) {
    const entry = contentById.get(contentId);
    const expected = EXPECTED_AXES[contentId];
    if (!entry) {
      issues.push(`missing_content:${contentId}`);
      continue;
    }
    if (!entry.rule_ids.includes(expected.ruleId)) {
      issues.push(`missing_rule_binding:${contentId}:${expected.ruleId}`);
    }
    if (
      entry.scenario_ids.length !== 1 ||
      entry.scenario_ids[0] !== expected.scenarioId
    ) {
      issues.push(`scenario_axis_mismatch:${contentId}`);
    }
    if (JSON.stringify(entry.source_coordinate_ids) !== JSON.stringify(expected.sources)) {
      issues.push(`source_contract_mismatch:${contentId}`);
    }
    if (!entry.one_line_answer_ko.includes(expected.answerFragment)) {
      issues.push(`answer_axis_missing:${contentId}`);
    }
    if (
      !Array.isArray(entry.facts_to_check_ko) ||
      entry.facts_to_check_ko.length < 8
    ) {
      issues.push(`evidence_too_thin:${contentId}`);
    }
    if (
      !Array.isArray(entry.action_steps_ko) ||
      entry.action_steps_ko.length < 5
    ) {
      issues.push(`actions_too_thin:${contentId}`);
    }
    if (
      !Array.isArray(entry.body_sections) ||
      entry.body_sections.length < 2 ||
      entry.body_sections.some(section => section.paragraphs_ko.length < 2)
    ) {
      issues.push(`body_too_thin:${contentId}`);
    }
    if (entry.search_intents_ko.length !== 3) {
      issues.push(`search_intent_count:${contentId}`);
    }
    const titleSearch = normalizeSearchText(entry.title_ko);
    const slugSearch = normalizeSearchText(entry.slug);
    for (const intent of entry.search_intents_ko) {
      const normalized = normalizeSearchText(intent);
      if (!normalized || normalized === titleSearch || normalized === slugSearch) {
        issues.push(`search_intent_copy:${contentId}:${intent}`);
      }
    }
    const contentTargets = entry.related_edges
      .filter(edge => edge.target_kind === 'content')
      .map(edge => edge.target_id);
    if (
      JSON.stringify(contentTargets) !==
      JSON.stringify(entry.related_content_ids)
    ) {
      issues.push(`related_projection_mismatch:${contentId}`);
    }
    if (new Set(contentTargets).size !== contentTargets.length) {
      issues.push(`duplicate_related_target:${contentId}`);
    }
    for (const targetId of contentTargets) {
      if (!contentById.has(targetId) || targetId === contentId) {
        issues.push(`invalid_related_target:${contentId}:${targetId}`);
      }
    }
    for (const sourceId of entry.source_coordinate_ids) {
      if (!sourceById.has(sourceId)) {
        issues.push(`unknown_source:${contentId}:${sourceId}`);
      }
    }

    const scenario = scenarioById.get(expected.scenarioId);
    if (!scenario?.decision_fact_ko.includes(expected.decisionFragment)) {
      issues.push(`decision_fact_mismatch:${contentId}`);
    }
    if (
      !scenario?.when_true_ko?.trim() ||
      !scenario?.when_false_ko?.trim()
    ) {
      issues.push(`branch_incomplete:${contentId}`);
    }
    if (
      !scenario?.rule_ids.includes(expected.ruleId) ||
      !ruleById.has(expected.ruleId)
    ) {
      issues.push(`scenario_rule_closure:${contentId}`);
    }
  }
  return issues;
}

const [topic, currentBundle, sourceTextLibrary] = await Promise.all([
  readFile(topicPath, 'utf8').then(JSON.parse),
  readFile(currentBundlePath, 'utf8').then(JSON.parse),
  readFile(sourceTextLibraryPath, 'utf8').then(JSON.parse),
]);

test('가족·상속 3개 문제해결 페이지 추가 외 기존 정본은 바뀌지 않는다', () => {
  const currentHub = currentBundle.knowledge.topic_hubs.find(
    hub => hub.hub_id === 'hub.family-inheritance',
  );
  const candidateHub = topic.topic_hubs[0];
  assert.deepEqual(
    candidateHub.content_ids,
    [...currentHub.content_ids, ...NEW_CONTENT_IDS],
  );

  const currentContentById = indexBy(
    currentBundle.knowledge.content_entries,
    'content_id',
  );
  const currentRuleById = indexBy(
    currentBundle.knowledge.rule_cards,
    'rule_id',
  );
  const currentScenarioById = indexBy(
    currentBundle.knowledge.scenario_branches,
    'scenario_id',
  );
  const currentSourceById = indexBy(
    currentBundle.knowledge.sources,
    'coordinate_id',
  );

  for (const entry of topic.content_entries) {
    if (NEW_CONTENT_IDS.includes(entry.content_id)) continue;
    assert.equal(
      digest(entry),
      digest(stripDerivedWorkspaceFacts(currentContentById.get(entry.content_id))),
      `기존 content 변경: ${entry.content_id}`,
    );
  }
  for (const rule of topic.rule_cards) {
    if (NEW_RULE_IDS.includes(rule.rule_id)) continue;
    assert.equal(
      digest(rule),
      digest(currentRuleById.get(rule.rule_id)),
      `기존 rule 변경: ${rule.rule_id}`,
    );
  }
  for (const scenario of topic.scenario_branches) {
    if (NEW_SCENARIO_IDS.includes(scenario.scenario_id)) continue;
    assert.equal(
      digest(scenario),
      digest(currentScenarioById.get(scenario.scenario_id)),
      `기존 scenario 변경: ${scenario.scenario_id}`,
    );
  }
  for (const source of topic.sources) {
    assert.equal(
      digest(source),
      digest(currentSourceById.get(source.coordinate_id)),
      `기존 source 변경: ${source.coordinate_id}`,
    );
  }
});

test('각 페이지는 서로 다른 결론변경 사실과 근거·증거·행동·검색·읽기 경로를 닫는다', () => {
  assert.deepEqual(problemPageIssues(topic), []);

  const decisionFacts = NEW_SCENARIO_IDS.map(
    id => topic.scenario_branches.find(item => item.scenario_id === id)
      .decision_fact_ko,
  );
  assert.equal(new Set(decisionFacts).size, NEW_SCENARIO_IDS.length);
  const answers = NEW_CONTENT_IDS.map(
    id => topic.content_entries.find(item => item.content_id === id)
      .one_line_answer_ko,
  );
  assert.equal(new Set(answers).size, NEW_CONTENT_IDS.length);
});

test('명시한 질문축은 기존 일반 안내와 신규 세부 문제를 중복이 아닌 별도 판단으로 분리한다', () => {
  const newEntries = topic.content_entries.filter(entry =>
    NEW_CONTENT_IDS.includes(entry.content_id));
  const priorEntries = topic.content_entries.filter(entry =>
    !NEW_CONTENT_IDS.includes(entry.content_id));
  for (const entry of newEntries) {
    assert.deepEqual(
      Object.keys(entry.question_signature).sort(),
      [
        'actor',
        'decision_facts',
        'legal_effect',
        'life_event',
        'normative_sources',
        'procedure_or_forum',
        'time_scope',
        'user_goal',
      ],
    );
    for (const prior of priorEntries) {
      const comparison = compareQuestionSignatures(
        deriveQuestionSignature(entry, topic),
        deriveQuestionSignature(prior, topic),
        {leftEntry: entry, rightEntry: prior},
      );
      assert.notEqual(
        comparison.classification,
        'duplicate_blocked',
        `${entry.content_id} ↔ ${prior.content_id}`,
      );
    }
  }
});

test('평소말 검색은 실제 검색 랭커에서 각 문제해결 페이지를 1순위로 찾는다', () => {
  const contentById = indexBy(topic.content_entries, 'content_id');
  const scenarioById = indexBy(topic.scenario_branches, 'scenario_id');
  const documents = buildSiteSearchDocuments(
    [],
    [],
    NEW_CONTENT_IDS.map(contentId => {
      const entry = contentById.get(contentId);
      return {
        entry,
        evidence_labels_ko: entry.source_coordinate_ids,
        search_terms_ko: [
          ...entry.key_points_ko,
          ...entry.facts_to_check_ko,
          ...entry.action_steps_ko,
        ],
      };
    }),
    [],
    {
      knowledgeContentType: () => '문제해결 가이드',
      changeLifecycle: value => String(value),
    },
    new Map(NEW_CONTENT_IDS.map(contentId => {
      const entry = contentById.get(contentId);
      return [
        contentId,
        entry.scenario_ids.map(scenarioId => ({
          scenarioId,
          question: scenarioById.get(scenarioId).question_ko,
        })),
      ];
    })),
  );
  const cases = [
    [
      '형제 중 한 명만 상속포기하면',
      'content.one-coheir-renounces-share',
    ],
    [
      '한정승인 공고 중 채권자 돈 달라고',
      'content.limited-acceptance-payment-before-deadline',
    ],
    [
      '한정승인 끝난 뒤 채권자 나타남',
      'content.limited-acceptance-late-unreported-creditor',
    ],
  ];
  for (const [query, expectedId] of cases) {
    const results = rankSiteSearchDocuments(documents, {
      filter: 'knowledge',
      now: new Date('2026-07-27T00:00:00+09:00'),
      query,
    });
    assert.equal(results[0]?.id, expectedId, query);
    assert.ok(results[0]?.matchReasons?.length > 0, query);
  }
});

test('신규 법률효과는 저장된 공식 조문 문언의 정확한 축에서만 나온다', () => {
  const textById = indexBy(sourceTextLibrary.texts, 'text_id');
  const textByCoordinate = new Map(
    sourceTextLibrary.bindings.map(binding => [
      binding.coordinate_id,
      textById.get(binding.text_id)?.official_text_ko,
    ]),
  );

  assert.match(
    textByCoordinate.get('coord.family-inheritance.civil-act-ko-1043'),
    /상속분은 다른 상속인의 상속분의 비율로/u,
  );
  assert.match(
    textByCoordinate.get('coord.family-inheritance.civil-act-ko-1033'),
    /기간만료전에는 상속채권의 변제를 거절할 수 있다/u,
  );
  assert.match(
    textByCoordinate.get('coord.family-inheritance.civil-act-ko-1034'),
    /각 채권액의 비율로 변제하여야 한다/u,
  );
  assert.match(
    textByCoordinate.get('coord.family-inheritance.civil-act-ko-1038'),
    /그 손해를 배상하여야 한다/u,
  );
  assert.match(
    textByCoordinate.get('coord.family-inheritance.civil-act-ko-1039'),
    /상속재산의 잔여가 있는 경우에 한하여/u,
  );
  assert.match(
    textByCoordinate.get('coord.family-inheritance.civil-act-ko-1039'),
    /특별담보권/u,
  );
});

test('근거·분기·관계 축을 줄이거나 바꾸는 회귀를 실제로 차단한다', () => {
  const sourceRemoved = clone(topic);
  sourceRemoved.content_entries
    .find(item =>
      item.content_id ===
      'content.limited-acceptance-payment-before-deadline')
    .source_coordinate_ids.pop();
  assert.ok(
    problemPageIssues(sourceRemoved).some(issue =>
      issue.startsWith('source_contract_mismatch:')),
  );

  const branchChanged = clone(topic);
  branchChanged.scenario_branches
    .find(item =>
      item.scenario_id ===
      'scenario.family-inheritance.sc-unreported-creditor-after-deadline')
    .decision_fact_ko = '채권자가 나타났는지';
  assert.ok(
    problemPageIssues(branchChanged).includes(
      'decision_fact_mismatch:content.limited-acceptance-late-unreported-creditor',
    ),
  );

  const relationDuplicated = clone(topic);
  const relationEntry = relationDuplicated.content_entries.find(
    item =>
      item.content_id === 'content.one-coheir-renounces-share',
  );
  relationEntry.related_edges.push(clone(relationEntry.related_edges[0]));
  assert.ok(
    problemPageIssues(relationDuplicated).includes(
      'related_projection_mismatch:content.one-coheir-renounces-share',
    ),
  );

  const searchCopied = clone(topic);
  const searchEntry = searchCopied.content_entries.find(
    item =>
      item.content_id ===
      'content.limited-acceptance-payment-before-deadline',
  );
  searchEntry.search_intents_ko[0] = searchEntry.title_ko;
  assert.ok(
    problemPageIssues(searchCopied).some(issue =>
      issue.startsWith(
        'search_intent_copy:content.limited-acceptance-payment-before-deadline:',
      )),
  );
});
