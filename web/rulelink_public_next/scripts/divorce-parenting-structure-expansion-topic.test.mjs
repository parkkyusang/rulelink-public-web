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
const topicRelativePath =
  'artifacts/publication/topics/divorce-parenting.json';
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
  '074eb30ccdb8919431cebb6d4e3fd3f48b999f52a2f73f2366e90eba0964ef4e';

const topic = JSON.parse(await readFile(topicPath, 'utf8'));
const current = JSON.parse(await readFile(currentPath, 'utf8'));

const experienceFixture = {
  'content.consensual-divorce-needs-court-confirmation-and-report': {
    audience_situation_ko:
      '이혼합의서에는 서명했지만 가정법원 확인과 신고 중 무엇을 더 해야 법률상 혼인관계가 끝나는지 확인하려는 경우',
    search_intents_ko: [
      '협의이혼 합의서만 쓰면 이혼이 되나요',
      '가정법원 이혼의사 확인 뒤 신고 절차',
      '협의이혼 신고 뒤 가족관계등록부 확인',
    ],
  },
  'content.consensual-divorce-cooling-period': {
    audience_situation_ko:
      '협의이혼을 신청했지만 자녀 유무에 따른 대기기간과 기산일, 확인기일까지 무엇을 준비해야 하는지 알고 싶은 경우',
    search_intents_ko: [
      '협의이혼 숙려기간은 언제부터 계산하나요',
      '자녀가 있으면 협의이혼 몇 달 기다리나요',
      '협의이혼 숙려기간 중 준비할 서류',
    ],
  },
  'content.divorce-cooling-period-shortening-for-violence': {
    audience_situation_ko:
      '가정폭력이나 위협 때문에 통상 숙려기간을 기다리는 동안 안전과 고통이 우려되어 단축·면제 요건과 자료를 확인하려는 경우',
    search_intents_ko: [
      '가정폭력 협의이혼 숙려기간 면제 신청',
      '협의이혼 숙려기간 단축에 필요한 자료',
      '폭력 위험 중 이혼과 신변보호 절차',
    ],
  },
  'content.divorce-child-custody-support-parental-authority-agreement': {
    audience_situation_ko:
      '미성년 자녀가 있는 협의이혼에서 양육자·친권자·양육비·면접교섭을 어떤 항목과 자료로 정해야 하는지 확인하려는 경우',
    search_intents_ko: [
      '협의이혼 미성년 자녀 양육비 합의 항목',
      '친권자와 양육자를 따로 정할 수 있나요',
      '면접교섭 일정과 양육비 협의서 작성',
    ],
  },
  'content.child-support-record-is-not-private-memo': {
    audience_situation_ko:
      '협의이혼 과정에서 정한 양육비의 금액·지급일·기간을 법원 조서에 어떻게 남기고 미지급에 대비해야 하는지 확인하려는 경우',
    search_intents_ko: [
      '양육비부담조서에 금액과 지급일 쓰는 법',
      '협의이혼 양육비 합의서와 법원 조서 차이',
      '양육비부담조서 미지급 시 무엇을 확인하나요',
    ],
  },
  'content.noncustodial-parent-child-visitation': {
    audience_situation_ko:
      '이혼 뒤 자녀 면접교섭의 일정·장소·인도방법을 정하거나 안전 우려와 반복 갈등 때문에 제한·변경 기준을 확인하려는 경우',
    search_intents_ko: [
      '비양육 부모 면접교섭 일정 정하는 기준',
      '자녀가 면접교섭을 원하지 않을 때 기준',
      '폭력 우려가 있는 면접교섭 제한',
    ],
  },
  'content.divorce-property-division-two-year-period': {
    audience_situation_ko:
      '협의 또는 재판상 이혼 뒤 재산분할을 준비하면서 법률상 이혼일과 2년 만료일, 재산·채무·기여 자료를 확인하려는 경우',
    search_intents_ko: [
      '이혼 재산분할 2년은 언제부터 계산하나요',
      '협의 중 재산분할 청구기간이 지나면 어떻게 되나요',
      '이혼 뒤 재산분할 청구 준비자료',
    ],
  },
  'content.asset-transfer-harming-property-division': {
    audience_situation_ko:
      '이혼 협의나 소송 전후 배우자가 부동산·예금 등을 다른 사람에게 넘겨 재산분할을 피하려는지와 법정 대응을 확인하려는 경우',
    search_intents_ko: [
      '배우자가 이혼 전 재산을 가족에게 넘긴 경우',
      '재산분할 피하려는 부동산 처분 취소',
      '이혼 중 숨긴 재산 보전 방법',
    ],
  },
  'content.six-grounds-for-judicial-divorce': {
    audience_situation_ko:
      '배우자가 협의이혼을 거부하거나 혼인 파탄 사실을 다투어 재판상 이혼사유와 그 사유별 증거를 확인하려는 경우',
    search_intents_ko: [
      '협의이혼을 거부하면 재판상 이혼이 되나요',
      '민법 840조 재판상 이혼 사유와 증거',
      '별거만으로 재판상 이혼 청구 가능한가요',
    ],
  },
  'content.divorce-consolation-money-vs-property-division': {
    audience_situation_ko:
      '이혼 합의나 소송에서 위자료·재산분할·양육비를 한 금액으로 다루려 해 각 권리의 판단기준과 자료를 나눠 확인하려는 경우',
    search_intents_ko: [
      '이혼 위자료와 재산분할은 따로 청구하나요',
      '재산분할과 위자료 판단 기준 차이',
      '이혼 합의서 위자료 재산분할 항목 나누기',
    ],
  },
};

const edgeFixture = {
  'content.consensual-divorce-needs-court-confirmation-and-report': [
    [
      'procedure',
      'content.consensual-divorce-cooling-period',
      '법원 확인 전 숙려기간부터 확인',
    ],
    [
      'procedure',
      'content.divorce-child-custody-support-parental-authority-agreement',
      '자녀 양육·친권 협의서 준비',
    ],
    [
      'deadline',
      'content.divorce-property-division-two-year-period',
      '신고로 정해지는 이혼일과 2년 확인',
    ],
  ],
  'content.consensual-divorce-cooling-period': [
    [
      'procedure',
      'content.consensual-divorce-needs-court-confirmation-and-report',
      '숙려 뒤 법원 확인과 신고 절차',
    ],
    [
      'comparison',
      'content.divorce-cooling-period-shortening-for-violence',
      '급박한 사정의 단축·면제와 비교',
    ],
    [
      'procedure',
      'content.divorce-child-custody-support-parental-authority-agreement',
      '자녀 양육·친권 협의 준비',
    ],
    [
      'concierge_boundary',
      'content.why-attorney-workspace-is-gated',
      '변호사 전용 작업공간의 자격 경계 확인',
    ],
  ],
  'content.divorce-cooling-period-shortening-for-violence': [
    [
      'comparison',
      'content.consensual-divorce-cooling-period',
      '원칙 숙려기간과 단축·면제 비교',
    ],
    [
      'procedure',
      'content.divorce-child-custody-support-parental-authority-agreement',
      '자녀 안전과 양육 협의 준비',
    ],
    [
      'comparison',
      'content.six-grounds-for-judicial-divorce',
      '협의이혼과 재판상 이혼 경로 비교',
    ],
    [
      'concierge_boundary',
      'content.why-attorney-workspace-is-gated',
      '변호사 전용 작업공간의 자격 경계 확인',
    ],
  ],
  'content.divorce-child-custody-support-parental-authority-agreement': [
    [
      'prerequisite',
      'content.consensual-divorce-cooling-period',
      '자녀 유무에 따른 숙려기간 확인',
    ],
    [
      'procedure',
      'content.child-support-record-is-not-private-memo',
      '양육비부담조서의 집행력 확인',
    ],
    [
      'procedure',
      'content.noncustodial-parent-child-visitation',
      '면접교섭 일정과 방식 구체화',
    ],
    [
      'concierge_boundary',
      'content.why-attorney-workspace-is-gated',
      '변호사 전용 작업공간의 자격 경계 확인',
    ],
  ],
  'content.child-support-record-is-not-private-memo': [
    [
      'prerequisite',
      'content.divorce-child-custody-support-parental-authority-agreement',
      '양육비를 포함한 자녀 협의 항목 확인',
    ],
    [
      'comparison',
      'content.noncustodial-parent-child-visitation',
      '양육비 지급과 면접교섭 권리 구별',
    ],
  ],
  'content.noncustodial-parent-child-visitation': [
    [
      'prerequisite',
      'content.divorce-child-custody-support-parental-authority-agreement',
      '양육·친권 협의 내용 확인',
    ],
    [
      'comparison',
      'content.child-support-record-is-not-private-memo',
      '양육비 문서와 면접교섭 구별',
    ],
    [
      'concierge_boundary',
      'content.why-attorney-workspace-is-gated',
      '변호사 전용 작업공간의 자격 경계 확인',
    ],
  ],
  'content.divorce-property-division-two-year-period': [
    [
      'prerequisite',
      'content.consensual-divorce-needs-court-confirmation-and-report',
      '법률상 이혼 성립일 먼저 확인',
    ],
    [
      'remedy',
      'content.asset-transfer-harming-property-division',
      '분할을 해치는 재산처분 대응 검토',
    ],
    [
      'comparison',
      'content.divorce-consolation-money-vs-property-division',
      '재산분할과 위자료 기준 구별',
    ],
  ],
  'content.asset-transfer-harming-property-division': [
    [
      'prerequisite',
      'content.divorce-property-division-two-year-period',
      '재산분할 권리와 2년 기간 확인',
    ],
    [
      'comparison',
      'content.divorce-consolation-money-vs-property-division',
      '재산 청산과 파탄 손해 구별',
    ],
  ],
  'content.six-grounds-for-judicial-divorce': [
    [
      'comparison',
      'content.divorce-cooling-period-shortening-for-violence',
      '협의이혼 단축과 재판상 이혼 구별',
    ],
    [
      'deadline',
      'content.divorce-property-division-two-year-period',
      '이혼 뒤 재산분할 2년 함께 관리',
    ],
    [
      'comparison',
      'content.divorce-consolation-money-vs-property-division',
      '이혼사유와 위자료·재산분할 구별',
    ],
  ],
  'content.divorce-consolation-money-vs-property-division': [
    [
      'comparison',
      'content.divorce-property-division-two-year-period',
      '재산분할의 대상과 2년 기간 확인',
    ],
    [
      'remedy',
      'content.asset-transfer-harming-property-division',
      '재산분할을 해치는 처분 대응 검토',
    ],
    [
      'prerequisite',
      'content.six-grounds-for-judicial-divorce',
      '혼인 파탄 원인과 책임 사실 확인',
    ],
  ],
};

const newRelationIds = new Set([
  'content.consensual-divorce-needs-court-confirmation-and-report',
  'content.child-support-record-is-not-private-memo',
  'content.divorce-property-division-two-year-period',
  'content.asset-transfer-harming-property-division',
  'content.six-grounds-for-judicial-divorce',
  'content.divorce-consolation-money-vs-property-division',
]);

function byContentId(value) {
  return new Map(value.content_entries.map((entry) => [entry.content_id, entry]));
}

function normalizeSearch(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-z가-힣]+/g, '');
}

function normalizeNonTarget(entry) {
  const copy = structuredClone(entry);
  delete copy.audience_situation_ko;
  delete copy.search_intents_ko;
  if (newRelationIds.has(entry.content_id)) delete copy.related_edges;
  return copy;
}

function stableProjectionHash(candidate) {
  const envelope = structuredClone(candidate);
  delete envelope.content_entries;
  return createHash('sha256')
    .update(
      JSON.stringify({
        envelope,
        content_entries: candidate.content_entries.map(normalizeNonTarget),
      }),
    )
    .digest('hex');
}

function reconstructPreExpansionEntry(entry) {
  const before = structuredClone(entry);
  if (Object.hasOwn(experienceFixture, before.content_id)) {
    before.audience_situation_ko = '';
  }
  return before;
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
    path.join(os.tmpdir(), 'rulelink-divorce-expansion-'),
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

test('대상상황과 검색의도는 이혼 단계별 실제 질문으로 보강된다', () => {
  const entries = byContentId(topic);
  const normalized = [];
  assert.equal(topic.content_entries.length, 10);
  for (const [contentId, expected] of Object.entries(experienceFixture)) {
    const entry = entries.get(contentId);
    assert.equal(entry.audience_situation_ko, expected.audience_situation_ko);
    assert.deepEqual(entry.search_intents_ko, expected.search_intents_ko);
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

test('기존 읽기 대상 순서를 보존한 typed 경로가 정확히 투영된다', () => {
  const allContentIds = new Set([
    ...current.knowledge.content_entries.map((entry) => entry.content_id),
    ...topic.content_entries.map((entry) => entry.content_id),
  ]);
  const allowedTypes = new Set([
    'prerequisite',
    'procedure',
    'comparison',
    'deadline',
    'remedy',
    'concierge_boundary',
  ]);
  let edgeCount = 0;
  for (const entry of topic.content_entries) {
    const expected = edgeFixture[entry.content_id];
    const edges = entry.related_edges ?? [];
    assert.deepEqual(
      edges.map((edge) => [
        edge.relation_type,
        edge.target_id,
        edge.label_ko,
      ]),
      expected,
      entry.content_id,
    );
    assert.deepEqual(
      edges.map((edge) => edge.target_id),
      entry.related_content_ids,
      entry.content_id,
    );
    assert.equal(
      new Set(
        edges.map(
          (edge) =>
            `${edge.target_kind}|${edge.target_id}|${edge.relation_type}|${edge.label_ko}`,
        ),
      ).size,
      edges.length,
      entry.content_id,
    );
    for (const edge of edges) {
      assert.equal(edge.target_kind, 'content');
      assert.ok(allContentIds.has(edge.target_id), edge.target_id);
      assert.notEqual(edge.target_id, entry.content_id);
      assert.ok(allowedTypes.has(edge.relation_type), edge.relation_type);
      assert.ok(edge.label_ko.trim().length >= 8);
    }
    edgeCount += edges.length;
  }
  assert.equal(edgeCount, 31);
});

test('법리·근거·본문·CTA·분기 배열과 기존 typed 관계는 승인 투영과 동일하다', () => {
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 7);
  assert.equal(topic.sources.length, 11);
  assert.equal(
    stableProjectionHash(topic),
    approvedStableProjectionSha256,
  );

  const changedRule = structuredClone(topic);
  changedRule.rule_cards[0].norm.proposition_ko += ' 임의 변경';
  assert.notEqual(
    stableProjectionHash(changedRule),
    approvedStableProjectionSha256,
  );
});

test('분기·근거·법리 참조는 모두 실제 객체로 닫힌다', () => {
  const ruleIds = new Set(topic.rule_cards.map((rule) => rule.rule_id));
  const scenarioIds = new Set(
    topic.scenario_branches.map((scenario) => scenario.scenario_id),
  );
  const sourceIds = new Set(
    topic.sources.map((source) => source.coordinate_id),
  );
  for (const entry of topic.content_entries) {
    assert.ok(entry.scenario_ids.length > 0, entry.content_id);
    for (const ruleId of entry.rule_ids) assert.ok(ruleIds.has(ruleId), ruleId);
    for (const scenarioId of entry.scenario_ids) {
      assert.ok(scenarioIds.has(scenarioId), scenarioId);
    }
    for (const sourceId of entry.source_coordinate_ids) {
      assert.ok(sourceIds.has(sourceId), sourceId);
    }
  }
  for (const sourceId of sourceIds) {
    assert.ok(
      topic.rule_cards.some((rule) =>
        rule.source_coordinate_ids.includes(sourceId),
      ) ||
        topic.scenario_branches.some((scenario) =>
          scenario.source_coordinate_ids.includes(sourceId),
        ) ||
        topic.content_entries.some((entry) =>
          entry.source_coordinate_ids.includes(sourceId),
        ),
      sourceId,
    );
  }
});

test('후속 주제 개선과 무관하게 이혼 주제의 구조·대상상황 10건 감소와 분기 불변을 고정한다', async () => {
  const { knowledge, changeComposition } = await loadComposition(manifestPath, {
    snapshotId: current.snapshot_id,
  });
  const topicIds = new Set(topic.content_entries.map((entry) => entry.content_id));
  const topicEntries = byContentId(topic);
  const before = knowledge.content_entries.map((entry) =>
    topicIds.has(entry.content_id)
      ? reconstructPreExpansionEntry(topicEntries.get(entry.content_id))
      : entry,
  );

  const beforeCounts = structuralCounts(before);
  const afterCounts = structuralCounts(knowledge.content_entries);
  assert.equal(
    beforeCounts.structure_incomplete - afterCounts.structure_incomplete,
    10,
  );
  assert.equal(
    beforeCounts.audience_situation_missing
      - afterCounts.audience_situation_missing,
    10,
  );
  assert.equal(beforeCounts.scenario_missing, afterCounts.scenario_missing);

  const beforeKnowledge = structuredClone(knowledge);
  beforeKnowledge.content_entries = before;
  const [beforeBacklog, afterBacklog] = await Promise.all([
    buildBacklogForKnowledge(beforeKnowledge, changeComposition),
    buildBacklogForKnowledge(knowledge, changeComposition),
  ]);
  assert.equal(
    beforeBacklog.summary.structure_incomplete
      - afterBacklog.summary.structure_incomplete,
    10,
  );
  assert.equal(beforeBacklog.summary.verified_release, 0);
  assert.equal(afterBacklog.summary.verified_release, 0);
});
