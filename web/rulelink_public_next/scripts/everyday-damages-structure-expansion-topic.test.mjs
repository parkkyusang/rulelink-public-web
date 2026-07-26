import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPublicationExpansionBacklog,
  entryGaps,
} from './build-publication-expansion-backlog.mjs';
import {
  applyKnowledgeComposition,
  loadComposition,
} from './compose-publication-knowledge.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicRelativePath = 'artifacts/publication/topics/everyday-damages.json';
const topicPath = path.join(repositoryRoot, topicRelativePath);
const manifestPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'topics',
  'manifest.json',
);
const currentPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);
const coverageManifestPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'coverage',
  'coverage-manifest.json',
);
const approvedStableProjectionSha256 =
  '1dd0f141c2cb6fb471284bd17e24c0ca8b74c2e4457294ec7a77507a9ea42e6f';
const approvedUntouchedExperienceSha256 =
  '78d98742bf86fadb1e335f185df1fc58d1aa5f9bb6f81bd1c136b09e52ecf156';

const topic = JSON.parse(await readFile(topicPath, 'utf8'));
const current = JSON.parse(await readFile(currentPath, 'utf8'));

const experienceFixture = {
  'content.accident-damages-responsibility-map': {
    audience_situation_ko:
      '매장·도로·주택 등에서 사고를 당했지만 사람, 시설 관리자, 동물 관리자 중 누구의 어떤 책임부터 확인해야 할지 모르는 경우',
    search_intents_ko: [
      '일상 사고 손해배상 책임자는 어떻게 찾나요',
      '시설과 사람 잘못이 함께 있는 사고 책임',
      '사고 원인별 배상책임 확인 순서',
    ],
  },
  'content.negligence-and-causation-in-accidents': {
    audience_situation_ko:
      '사고 상대방이 현장에 있었지만 구체적으로 어떤 주의의무를 어겼고 그 행동이 손해를 만들었는지 다투는 경우',
    search_intents_ko: [
      '사고 상대방 과실은 어떻게 입증하나요',
      '주의의무 위반과 사고 인과관계 증거',
      '사고 현장에 있던 사람의 배상책임 요건',
    ],
  },
  'content.what-accident-damages-can-be-claimed': {
    audience_situation_ko:
      '사고 뒤 치료비·휴업손해·향후비용 등이 생겼지만 실제 지출과 배상받을 수 있는 손해의 범위를 구분해야 하는 경우',
    search_intents_ko: [
      '사고 치료비와 휴업손해 청구 범위',
      '사고 때문에 쓴 비용은 어디까지 배상되나요',
      '특별손해와 통상손해를 구분하는 기준',
    ],
  },
  'content.emotional-distress-and-consolation-money': {
    audience_situation_ko:
      '사고나 침해행위로 정신적 고통을 겪어 위자료를 청구하려 하지만 단순한 불쾌감과 배상 대상 손해를 구분해야 하는 경우',
    search_intents_ko: [
      '사고 정신적 피해 위자료 인정 기준',
      '명예나 신체 침해 위자료는 어떻게 정하나요',
      '스트레스만으로 위자료를 청구할 수 있나요',
    ],
  },
  'content.employee-caused-accident-employer-liability': {
    audience_situation_ko:
      '배달기사·매장 직원 등 다른 회사 직원이 업무 중 낸 사고로 피해를 입어 행위자와 회사 중 누구에게 청구할지 확인하려는 경우',
    search_intents_ko: [
      '직원이 업무 중 낸 사고 회사 책임',
      '배달기사 사고를 회사에 청구할 수 있나요',
      '직원 개인행위와 회사 업무 관련성 판단',
    ],
  },
  'content.slip-fall-and-unsafe-facility-liability': {
    audience_situation_ko:
      '매장 바닥·계단·간판 등 시설 때문에 다쳤지만 실제 점유·관리자와 소유자 책임을 구분해야 하는 경우',
    search_intents_ko: [
      '매장 바닥에서 넘어진 사고 책임자',
      '계단 시설 하자 점유자와 소유자 책임',
      '시설 안전조치 부족 손해배상 청구',
    ],
  },
  'content.dog-bite-and-animal-keeper-liability': {
    audience_situation_ko:
      '개 등 반려동물에게 다쳤지만 등록 명의자와 사고 당시 실제 관리자가 달라 누구의 책임인지 확인해야 하는 경우',
    search_intents_ko: [
      '개 물림 사고 실제 관리자 책임',
      '반려동물 사고 등록 주인과 점유자 차이',
      '목줄을 한 개가 사람을 다치게 한 경우 배상',
    ],
  },
  'content.victim-fault-does-not-erase-all-compensation': {
    audience_situation_ko:
      '사고 피해자이지만 자신의 부주의도 있었다는 이유로 상대방이나 보험사가 배상 전부를 거절하거나 과실비율을 제시한 경우',
    search_intents_ko: [
      '피해자 과실이 있으면 배상을 못 받나요',
      '보험사가 제시한 사고 과실비율 확인',
      '상대방 책임과 피해자 부주의를 나누는 기준',
    ],
  },
  'content.accident-evidence-and-tort-limitation': {
    audience_situation_ko:
      '사고 직후 CCTV·진료기록 등 자료를 보존해야 하고 손해와 가해자를 안 날 및 사고일 기준의 청구기간도 함께 관리해야 하는 경우',
    search_intents_ko: [
      '사고 손해배상 증거는 무엇을 모아야 하나요',
      '불법행위 손해배상 3년 10년 기산점',
      '보험사와 협의 중일 때 손해배상 시효 관리',
    ],
  },
};

const newScenarioFixture = [
  {
    scenario_id: 'scenario.everyday-damages.emotional-harm',
    question_ko:
      '신체·자유·명예 침해가 있거나 그 밖에 정신상 고통을 가한 사실이 구체적으로 확인되나요?',
    decision_fact_ko:
      '신체·자유·명예 침해 또는 그 밖의 정신상 고통을 가한 행위의 내용·기간과 자료',
    when_true_ko:
      '해당 침해 또는 정신상 고통에 관한 재산 외 손해의 성립과 위자료 범위를 검토합니다.',
    when_false_ko:
      '단순한 불쾌감만으로 단정하지 않고 보호되는 법익 침해나 그 밖의 정신상 고통을 가한 사실을 먼저 확인합니다.',
    rule_ids: ['rule.everyday-damages.emotional-damage'],
    source_coordinate_ids: ['coord.everyday-damages.civil-act-ko-0751'],
  },
];

const edgeDigests = {
  'content.accident-damages-responsibility-map':
    '3a197bc5292a4eec50dabbb5b9178145fc2ed78fc8d3fe8f8107d91b2421771e',
  'content.negligence-and-causation-in-accidents':
    '4a041abaa92059bd1ead9f979b883f5ca7dc0a43eb1b5e1e7fef7ffb2a7bfcab',
  'content.what-accident-damages-can-be-claimed':
    '02e68955a7acfba4a85575e016ff2eb4a25f4ae18ac8820260b1525caa32bc25',
  'content.emotional-distress-and-consolation-money':
    'ec73289c56cd4c4df773f07d2fc28a12f000beb1bede022d48704d726d830469',
  'content.employee-caused-accident-employer-liability':
    '52fa74d2fd2f2900ddcb3a9bac75fe77dd4785f1bdc774229bb0b63d8494663a',
  'content.slip-fall-and-unsafe-facility-liability':
    'f19cb744b0f20089739972fe276c46a0700fbe0a4d9503f560bc7b7a273f3a10',
  'content.dog-bite-and-animal-keeper-liability':
    '80426712cfd8ddcff6fab1723b1c9b21ec594ba2a9a3de4d44c0221840998a37',
  'content.multiple-people-caused-one-damage':
    '5b60c5fc8d2e316b3b2e3504cf2af912a7382ac0e03a0bef429f697128cd153a',
  'content.victim-fault-does-not-erase-all-compensation':
    'd46996c62faf70e4a9bb30a03f9e827fd9cffe484717658e5a0a11b43a8c0977',
  'content.accident-evidence-and-tort-limitation':
    'd21a337ebe68b2ea96b0180e779ee40bf4ae7aeaded0fecdeb58c2b972f6691c',
};

const edgeTypeFixture = {
  'content.accident-damages-responsibility-map': [
    'comparison',
    'comparison',
    'comparison',
    'comparison',
    'comparison',
    'deadline',
  ],
  'content.negligence-and-causation-in-accidents': [
    'prerequisite',
    'comparison',
    'comparison',
  ],
  'content.what-accident-damages-can-be-claimed': [
    'prerequisite',
    'comparison',
    'comparison',
    'deadline',
  ],
  'content.emotional-distress-and-consolation-money': [
    'comparison',
    'deadline',
  ],
  'content.multiple-people-caused-one-damage': [
    'prerequisite',
    'prerequisite',
    'comparison',
  ],
  'content.victim-fault-does-not-erase-all-compensation': [
    'prerequisite',
    'prerequisite',
    'comparison',
    'comparison',
    'comparison',
  ],
  'content.accident-evidence-and-tort-limitation': [
    'prerequisite',
    'prerequisite',
    'prerequisite',
    'prerequisite',
    'prerequisite',
    'prerequisite',
    'prerequisite',
    'prerequisite',
    'prerequisite',
  ],
};

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function byContentId(value) {
  return new Map(value.content_entries.map((entry) => [entry.content_id, entry]));
}

function normalizeContent(entry) {
  const copy = structuredClone(entry);
  delete copy.audience_situation_ko;
  delete copy.search_intents_ko;
  delete copy.related_edges;
  return copy;
}

function stableProjectionHash(candidate) {
  const envelope = structuredClone(candidate);
  delete envelope.scenario_branches;
  delete envelope.content_entries;
  const existingScenarios = candidate.scenario_branches.filter(
    (scenario) =>
      !newScenarioFixture.some(
        (fixture) => fixture.scenario_id === scenario.scenario_id,
      ),
  );
  const entries = candidate.content_entries.map((entry) => {
    const copy = normalizeContent(entry);
    if (
      copy.content_id ===
      'content.emotional-distress-and-consolation-money'
    ) {
      copy.scenario_ids = [];
    }
    return copy;
  });
  return sha256({
    envelope,
    scenario_branches: existingScenarios,
    content_entries: entries,
  });
}

function reconstructPreExpansionTopic(candidate) {
  const before = structuredClone(candidate);
  before.scenario_branches = before.scenario_branches.filter(
    (scenario) =>
      !newScenarioFixture.some(
        (fixture) => fixture.scenario_id === scenario.scenario_id,
      ),
  );
  for (const entry of before.content_entries) {
    if (Object.hasOwn(experienceFixture, entry.content_id)) {
      entry.audience_situation_ko = '';
    }
    if (
      entry.content_id ===
      'content.emotional-distress-and-consolation-money'
    ) {
      entry.scenario_ids = [];
    }
  }
  return before;
}

function normalizeSearch(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-z가-힣]+/g, '');
}

function structuralCounts(entries) {
  const gaps = entries.map((entry) => entryGaps(entry, []));
  return {
    structure_incomplete: gaps.filter((value) =>
      value.some((gap) =>
        [
          'rule_missing',
          'scenario_missing',
          'source_missing',
          'audience_situation_missing',
          'one_line_answer_missing',
          'facts_to_check_missing',
          'action_steps_missing',
        ].includes(gap),
      ),
    ).length,
    audience_situation_missing: gaps.filter((value) =>
      value.includes('audience_situation_missing'),
    ).length,
    scenario_missing: gaps.filter((value) => value.includes('scenario_missing'))
      .length,
  };
}

function assertEverydayStructuralDelta(before, after, topicIds) {
  assert.deepEqual(
    after.map((entry) => entry.content_id).sort(),
    before.map((entry) => entry.content_id).sort(),
    '전후 content ID 집합',
  );
  const beforeById = new Map(before.map((entry) => [entry.content_id, entry]));
  for (const entry of after) {
    if (topicIds.has(entry.content_id)) continue;
    assert.deepEqual(
      entryGaps(entry, []),
      entryGaps(beforeById.get(entry.content_id), []),
      entry.content_id,
    );
  }
  for (const contentId of topicIds) {
    const beforeGaps = entryGaps(beforeById.get(contentId), []);
    const afterEntry = after.find((entry) => entry.content_id === contentId);
    const afterGaps = entryGaps(afterEntry, []);
    assert.ok(
      afterGaps.every((gap) => beforeGaps.includes(gap)),
      `${contentId}: 새 결손 ${afterGaps.filter((gap) => !beforeGaps.includes(gap)).join(', ')}`,
    );
  }

  const beforeCounts = structuralCounts(before);
  const afterCounts = structuralCounts(after);
  assert.equal(
    beforeCounts.structure_incomplete - afterCounts.structure_incomplete,
    8,
  );
  assert.equal(
    beforeCounts.audience_situation_missing -
      afterCounts.audience_situation_missing,
    9,
  );
  assert.equal(beforeCounts.scenario_missing - afterCounts.scenario_missing, 1);
}

async function buildBacklogForKnowledge(knowledge, changeComposition) {
  const currentScenarios = new Map(
    current.knowledge.scenario_branches.map((scenario) => [
      scenario.scenario_id,
      scenario,
    ]),
  );
  const receiptSafeKnowledge = structuredClone(knowledge);
  receiptSafeKnowledge.scenario_branches =
    receiptSafeKnowledge.scenario_branches.map((scenario) =>
      scenario.scenario_id.startsWith('scenario.crime-victim-response.') &&
      currentScenarios.has(scenario.scenario_id)
        ? structuredClone(currentScenarios.get(scenario.scenario_id))
        : scenario,
    );
  const candidate = applyKnowledgeComposition(
    current,
    receiptSafeKnowledge,
    changeComposition,
  );
  const bundleText = `${JSON.stringify(candidate, null, 2)}\n`;
  const manifest = JSON.parse(await readFile(coverageManifestPath, 'utf8'));
  manifest.base_bundle_sha256 = createHash('sha256')
    .update(bundleText)
    .digest('hex');
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-everyday-expansion-'),
  );
  try {
    const bundlePath = path.join(temporaryDirectory, 'bundle.json');
    const scratchManifestPath = path.join(temporaryDirectory, 'manifest.json');
    await writeFile(bundlePath, bundleText, 'utf8');
    await writeFile(
      scratchManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    return await buildPublicationExpansionBacklog({
      bundlePath,
      manifestPath: scratchManifestPath,
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

test('대상상황과 검색의도는 실제 사고 질문으로 정확히 보강된다', () => {
  const entries = byContentId(topic);
  for (const [contentId, expected] of Object.entries(experienceFixture)) {
    const entry = entries.get(contentId);
    assert.equal(entry.audience_situation_ko, expected.audience_situation_ko);
    assert.deepEqual(entry.search_intents_ko, expected.search_intents_ko);
  }

  const untouchedId = 'content.multiple-people-caused-one-damage';
  assert.equal(
    sha256({
      audience_situation_ko: entries.get(untouchedId).audience_situation_ko,
      search_intents_ko: entries.get(untouchedId).search_intents_ko,
    }),
    approvedUntouchedExperienceSha256,
  );

  const normalized = [];
  for (const entry of topic.content_entries) {
    assert.ok(entry.audience_situation_ko.trim().length > 0);
    assert.equal(entry.search_intents_ko.length, 3);
    const title = normalizeSearch(entry.title_ko);
    const slug = normalizeSearch(entry.slug);
    for (const intent of entry.search_intents_ko) {
      const value = normalizeSearch(intent);
      assert.ok(value.length > 0);
      assert.notEqual(value, title);
      assert.notEqual(value, slug);
      normalized.push(value);
    }
  }
  assert.equal(new Set(normalized).size, normalized.length);
});

test('위자료 분기만 기존 Rule과 근거 안에서 닫고 CTA 대기 시효 글은 분기 공백을 보존한다', () => {
  assert.deepEqual(
    topic.scenario_branches.filter((scenario) =>
      newScenarioFixture.some(
        (fixture) => fixture.scenario_id === scenario.scenario_id,
      ),
    ),
    newScenarioFixture,
  );
  const emotionalScenario = newScenarioFixture[0];
  assert.match(emotionalScenario.question_ko, /있거나/u);
  assert.match(emotionalScenario.decision_fact_ko, /또는/u);
  assert.match(emotionalScenario.when_true_ko, /또는/u);
  assert.doesNotMatch(
    `${emotionalScenario.question_ko} ${emotionalScenario.decision_fact_ko}`,
    /침해와 정신상 고통/u,
  );

  const entries = byContentId(topic);
  assert.deepEqual(
    entries.get('content.emotional-distress-and-consolation-money').scenario_ids,
    ['scenario.everyday-damages.emotional-harm'],
  );
  assert.deepEqual(
    entries.get('content.accident-evidence-and-tort-limitation').scenario_ids,
    [],
  );
  assert.equal(
    topic.content_entries.filter((entry) => entry.scenario_ids.length === 0).length,
    1,
  );

  const ruleIds = new Set(topic.rule_cards.map((rule) => rule.rule_id));
  const sourceIds = new Set(topic.sources.map((source) => source.coordinate_id));
  for (const scenario of newScenarioFixture) {
    for (const ruleId of scenario.rule_ids) assert.ok(ruleIds.has(ruleId));
    for (const sourceId of scenario.source_coordinate_ids) {
      assert.ok(sourceIds.has(sourceId));
    }
  }
});

test('기존 읽기 대상의 순서를 보존한 typed 경로가 정확히 투영된다', () => {
  const allContentIds = new Set([
    ...current.knowledge.content_entries.map((entry) => entry.content_id),
    ...topic.content_entries.map((entry) => entry.content_id),
  ]);
  const allowedTypes = new Set([
    'prerequisite',
    'procedure',
    'comparison',
    'deadline',
    'concierge_boundary',
  ]);

  for (const entry of topic.content_entries) {
    const edges = entry.related_edges ?? [];
    assert.equal(sha256(edges), edgeDigests[entry.content_id]);
    if (edgeTypeFixture[entry.content_id]) {
      assert.deepEqual(
        edges.map((edge) => edge.relation_type),
        edgeTypeFixture[entry.content_id],
      );
    }
    assert.deepEqual(
      edges.map((edge) => edge.target_id),
      entry.related_content_ids,
    );
    assert.equal(
      new Set(
        edges.map(
          (edge) =>
            `${edge.target_kind}|${edge.target_id}|${edge.relation_type}|${edge.label_ko}`,
        ),
      ).size,
      edges.length,
    );
    for (const edge of edges) {
      assert.equal(edge.target_kind, 'content');
      assert.ok(allContentIds.has(edge.target_id), edge.target_id);
      assert.notEqual(edge.target_id, entry.content_id);
      assert.ok(allowedTypes.has(edge.relation_type), edge.relation_type);
      assert.ok(edge.label_ko.trim().length >= 8);
    }
  }
});

test('비대상 법리·근거·본문·CTA와 기존 분기는 승인 투영과 동일하다', () => {
  assert.equal(
    stableProjectionHash(topic),
    approvedStableProjectionSha256,
  );
  const changedBody = structuredClone(topic);
  changedBody.content_entries[0].body_sections[0].paragraphs_ko[0] +=
    ' 임의 변경';
  assert.notEqual(
    stableProjectionHash(changedBody),
    approvedStableProjectionSha256,
  );
});

test('증분 래칫은 후속 주제 개선은 허용하고 비대상 회귀와 대상 새 결손은 차단한다', () => {
  const topicIds = new Set(topic.content_entries.map((entry) => entry.content_id));
  const unrelated = {
    content_id: 'content.fixture-unrelated',
    audience_situation_ko: '별도 주제의 완성된 대상상황',
    one_line_answer_ko: '별도 주제의 빠른 답입니다.',
    facts_to_check_ko: ['확인 사실'],
    action_steps_ko: ['다음 행동'],
    rule_ids: ['rule.fixture'],
    scenario_ids: ['scenario.fixture'],
    source_coordinate_ids: ['coord.fixture'],
  };
  const beforeTopic = reconstructPreExpansionTopic(topic);
  const before = [...beforeTopic.content_entries, unrelated];
  const after = [
    ...structuredClone(topic.content_entries),
    structuredClone(unrelated),
  ];
  assertEverydayStructuralDelta(before, after, topicIds);

  const unrelatedRegression = structuredClone(after);
  unrelatedRegression.at(-1).audience_situation_ko = '';
  assert.throws(
    () =>
      assertEverydayStructuralDelta(before, unrelatedRegression, topicIds),
    /content\.fixture-unrelated/u,
  );

  const missingUnrelated = structuredClone(after).slice(0, -1);
  assert.throws(
    () => assertEverydayStructuralDelta(before, missingUnrelated, topicIds),
    /전후 content ID 집합/u,
  );

  const targetRegression = structuredClone(after);
  targetRegression.find(
    (entry) =>
      entry.content_id ===
      'content.negligence-and-causation-in-accidents',
  ).one_line_answer_ko = '';
  assert.throws(
    () => assertEverydayStructuralDelta(before, targetRegression, topicIds),
  );
});

test('후속 직렬 개선과 무관하게 이 주제의 구조 8건·대상상황 9건·분기 1건 감소를 고정한다', async () => {
  const { knowledge, changeComposition } = await loadComposition(manifestPath, {
    snapshotId: current.snapshot_id,
  });
  const topicIds = new Set(topic.content_entries.map((entry) => entry.content_id));
  const beforeTopic = reconstructPreExpansionTopic(topic);
  const baselineEntries = byContentId(beforeTopic);
  const before = knowledge.content_entries.map((entry) =>
    topicIds.has(entry.content_id)
      ? structuredClone(baselineEntries.get(entry.content_id))
      : entry,
  );

  assertEverydayStructuralDelta(
    before,
    knowledge.content_entries,
    topicIds,
  );

  const beforeKnowledge = structuredClone(knowledge);
  beforeKnowledge.content_entries = before;
  const [beforeBacklog, afterBacklog] = await Promise.all([
    buildBacklogForKnowledge(beforeKnowledge, changeComposition),
    buildBacklogForKnowledge(knowledge, changeComposition),
  ]);
  assert.equal(
    beforeBacklog.summary.structure_incomplete -
      afterBacklog.summary.structure_incomplete,
    8,
  );
  assert.equal(beforeBacklog.summary.verified_release, 0);
  assert.equal(afterBacklog.summary.verified_release, 0);
});
