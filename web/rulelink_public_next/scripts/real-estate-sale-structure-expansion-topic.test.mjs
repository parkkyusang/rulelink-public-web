import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  entryGaps,
} from './build-publication-expansion-backlog.mjs';
import {
  loadComposition,
} from './compose-publication-knowledge.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicRelativePath = 'artifacts/publication/topics/real-estate-sale.json';
const topicPath = path.join(repositoryRoot, topicRelativePath);
const manifestPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'topics',
  'manifest.json',
);
const baselineCommit = 'f08c241f35e3499fd380b2e536d8452e98ef54e7';
const restoredContentId = 'content.rescission-restitution-and-damages';
const restoredScenarioId = 'scenario.real-estate-sale.real-estate-12';

const topic = JSON.parse(await readFile(topicPath, 'utf8'));
const baseline = JSON.parse(
  execFileSync(
    'git',
    [
      '-c',
      `safe.directory=${repositoryRoot.replaceAll('\\', '/')}`,
      'show',
      `${baselineCommit}:${topicRelativePath}`,
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  ),
);

const searchFixture = {
  'content.real-estate-sale-contract-before-signing': [
    '계약서 서명 전 구두로 합의한 부동산 매매도 효력이 있나요',
    '문자와 송금내역만 있는 부동산 계약 성립 여부',
    '가계약 뒤 정식 계약서를 안 쓴 경우 거래를 중단할 수 있나요',
  ],
  'content.real-estate-reservation-deposit-meaning': [
    '부동산 가계약금만 송금한 뒤 돌려받을 수 있나요',
    '가계약금 반환 약정이 없으면 매수인이 포기해야 하나요',
    '정식 계약 전 보낸 돈이 해약금인지 확인하는 방법',
  ],
  'content.earnest-money-rescission-cutoff': [
    '중도금 지급 전 부동산 계약금을 포기하고 해제할 수 있나요',
    '매도인이 이행을 시작한 뒤 계약금 배액으로 해제할 수 있나요',
    '부동산 해약금 해제에서 이행착수 시점은 언제인가요',
  ],
  'content.interim-payment-and-concurrent-closing': [
    '부동산 잔금 지급과 소유권이전등기는 동시에 해야 하나요',
    '잔금일에 매도인이 준비해야 할 등기서류와 말소 절차',
    '매수인이 잔금을 준비했음을 입증하는 방법',
  ],
  'content.seller-misses-title-transfer-date': [
    '잔금일에 매도인이 등기이전을 거절하면 계약을 해제할 수 있나요',
    '소유권이전 지연 시 최고 기간과 해제 통보 방법',
    '매도인 불이행 전에 매수인이 잔금을 준비했다는 증거',
  ],
  'content.rescission-restitution-and-damages': [
    '부동산 계약 해제 후 계약금과 중도금에 이자도 받을 수 있나요',
    '계약 해제 원상회복과 손해배상을 함께 청구할 수 있나요',
    '해약금 해제와 채무불이행 해제의 정산 차이',
  ],
  'content.seller-does-not-own-property': [
    '소유자가 아닌 사람과 체결한 부동산 매매계약도 유효한가요',
    '매도인이 등기명의를 취득하지 못하면 계약을 해제할 수 있나요',
    '타인 소유 부동산을 산 매수인이 확인할 권리관계',
  ],
  'content.hidden-defect-after-purchase': [
    '집을 산 뒤 누수를 발견하면 매도인에게 언제까지 청구하나요',
    '매수인이 몰랐던 구조상 하자로 계약을 해제할 수 있나요',
    '부동산 하자를 안 날부터 6개월 안에 해야 할 조치',
  ],
  'content.ownership-changes-only-after-registration': [
    '부동산 잔금을 지급했는데 등기 전에도 소유자가 되나요',
    '소유권이전등기 접수 전 매도인이 다시 처분하면 어떻게 되나요',
    '잔금 지급 뒤 등기 완료 여부를 확인하는 방법',
  ],
  'content.mistake-fraud-in-real-estate-contract': [
    '부동산 면적이나 용도를 잘못 알고 계약하면 취소할 수 있나요',
    '개발계획 거짓 설명을 믿고 산 경우 계약 취소 요건',
    '공인중개사 설명과 실제 부동산 상태가 다른 경우 증거',
  ],
  'content.broker-confirmation-explanation-checklist': [
    '부동산 계약 전 공인중개사에게 받아야 할 확인설명 자료',
    '등기사항증명서 외에 신탁원부와 건축물대장도 봐야 하나요',
    '중개대상물 확인설명서와 실제 상태가 다를 때 확인할 사항',
  ],
};

const relationTypeFixture = {
  'content.real-estate-sale-contract-before-signing': [
    'comparison',
    'procedure',
    'remedy',
  ],
  'content.real-estate-reservation-deposit-meaning': [
    'prerequisite',
    'comparison',
    'remedy',
  ],
  'content.earnest-money-rescission-cutoff': [
    'prerequisite',
    'deadline',
    'comparison',
  ],
  'content.interim-payment-and-concurrent-closing': [
    'prerequisite',
    'procedure',
    'procedure',
  ],
  'content.seller-misses-title-transfer-date': [
    'prerequisite',
    'remedy',
    'procedure',
  ],
  'content.rescission-restitution-and-damages': [
    'comparison',
    'prerequisite',
    'prerequisite',
  ],
  'content.seller-does-not-own-property': [
    'procedure',
    'comparison',
    'procedure',
  ],
  'content.hidden-defect-after-purchase': [
    'remedy',
    'comparison',
    'prerequisite',
  ],
  'content.ownership-changes-only-after-registration': [
    'procedure',
    'prerequisite',
    'comparison',
  ],
  'content.mistake-fraud-in-real-estate-contract': [
    'prerequisite',
    'comparison',
    'prerequisite',
  ],
  'content.real-estate-transaction-reporting-30-days': [
    'prerequisite',
    'procedure',
    'comparison',
  ],
  'content.broker-confirmation-explanation-checklist': [
    'prerequisite',
    'prerequisite',
    'prerequisite',
  ],
};

function byContentId(value) {
  return new Map(value.content_entries.map(entry => [entry.content_id, entry]));
}

function normalizeSearch(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-z가-힣+/]/gu, '');
}

function numbersIn(value) {
  return new Set(String(value).match(/\d+(?:\.\d+)?/gu) ?? []);
}

function normalizePermittedContentChanges(entry) {
  const copy = structuredClone(entry);
  delete copy.search_intents_ko;
  delete copy.related_edges;
  if (entry.content_id === restoredContentId) {
    delete copy.audience_situation_ko;
    delete copy.scenario_ids;
  }
  return copy;
}

function structuralCounts(entries) {
  const gaps = entries.map(entry => entryGaps(entry, []));
  return {
    structure_incomplete: gaps.filter(value =>
      value.some(gap =>
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
    audience_situation_missing: gaps.filter(value =>
      value.includes('audience_situation_missing'),
    ).length,
    scenario_missing: gaps.filter(value =>
      value.includes('scenario_missing'),
    ).length,
  };
}

test('11개 글의 검색의도는 실제 부동산 거래 질문으로 교정되고 기존 신고기한 글은 보존된다', () => {
  const entries = byContentId(topic);
  const normalized = [];
  assert.equal(Object.keys(searchFixture).length, 11);
  for (const [contentId, expected] of Object.entries(searchFixture)) {
    const entry = entries.get(contentId);
    assert.deepEqual(entry.search_intents_ko, expected, contentId);
    const title = normalizeSearch(entry.title_ko);
    const slug = normalizeSearch(entry.slug);
    for (const intent of entry.search_intents_ko) {
      const value = normalizeSearch(intent);
      assert.ok(value.length >= 10, `${contentId}: 검색문구가 너무 짧습니다.`);
      assert.notEqual(value, title, `${contentId}: 제목 복사`);
      assert.notEqual(value, slug, `${contentId}: slug 복사`);
      normalized.push(value);
    }
  }
  assert.equal(new Set(normalized).size, normalized.length);
  assert.deepEqual(
    entries.get('content.real-estate-transaction-reporting-30-days')
      .search_intents_ko,
    byContentId(baseline)
      .get('content.real-estate-transaction-reporting-30-days')
      .search_intents_ko,
  );
});

test('새 검색의도는 다른 주제의 선언 검색어와 exact 충돌하지 않는다', async () => {
  const {knowledge} = await loadComposition(manifestPath, {
    snapshotId: 'kr-knowledge-core-20260723-023',
  });
  const topicIds = new Set(topic.content_entries.map(entry => entry.content_id));
  const outsideQueries = new Map();
  for (const entry of knowledge.content_entries) {
    if (topicIds.has(entry.content_id)) continue;
    for (const query of entry.search_intents_ko ?? []) {
      const normalized = normalizeSearch(query);
      if (!normalized) continue;
      const ids = outsideQueries.get(normalized) ?? [];
      ids.push(entry.content_id);
      outsideQueries.set(normalized, ids);
    }
  }
  for (const [contentId, queries] of Object.entries(searchFixture)) {
    for (const query of queries) {
      assert.deepEqual(
        outsideQueries.get(normalizeSearch(query)) ?? [],
        [],
        `${contentId}: ${query}`,
      );
    }
  }
});

test('해제 후 정산 글은 기존 제548조·제551조 범위에서 양쪽 분기를 닫는다', () => {
  const entry = byContentId(topic).get(restoredContentId);
  assert.equal(
    entry.audience_situation_ko,
    '부동산 계약을 해제한 뒤 계약금·중도금과 이자를 돌려받고 추가 손해도 청구하려 하며, 해제 성립과 지급내역·귀책사유를 확인하려는 경우',
  );
  assert.deepEqual(entry.scenario_ids, [restoredScenarioId]);

  const scenario = topic.scenario_branches.find(
    value => value.scenario_id === restoredScenarioId,
  );
  assert.deepEqual(scenario, {
    scenario_id: restoredScenarioId,
    question_ko:
      '계약을 해제했다고 통보했는데 지급한 돈과 추가 손해를 함께 청구할 수 있는지 궁금합니다.',
    decision_fact_ko: '유효한 해제 성립 여부',
    when_true_ko:
      '유효한 해제가 성립했다면 각 당사자는 받은 급부를 반환하는 원상회복을 해야 하고, 금전에는 받은 날부터 이자가 문제되며 별도의 손해배상청구가 배제되지는 않습니다.',
    when_false_ko:
      '유효한 해제가 성립하지 않았다면 민법 제548조의 원상회복을 전제로 정산할 수 없으므로, 해제 사유·의사표시 도달·해약금 해제인지 여부를 먼저 확인해야 합니다.',
    rule_ids: ['rule.real-estate-sale.real-estate-06'],
    source_coordinate_ids: [
      'coord.real-estate-sale.civil-act-ko-0548',
      'coord.real-estate-sale.civil-act-ko-0551',
    ],
  });
});

test('기존 법리·수치·기한·본문과 승인된 3d06649·61c16e5 변경은 그대로 보존된다', () => {
  assert.equal(topic.content_entries.length, 12);
  assert.equal(topic.rule_cards.length, 12);
  assert.equal(topic.sources.length, 18);
  assert.equal(topic.scenario_branches.length, 12);

  const baselineTop = structuredClone(baseline);
  const topicTop = structuredClone(topic);
  delete baselineTop.content_entries;
  delete baselineTop.scenario_branches;
  delete topicTop.content_entries;
  delete topicTop.scenario_branches;
  assert.deepEqual(topicTop, baselineTop);

  assert.deepEqual(
    topic.scenario_branches.filter(
      value => value.scenario_id !== restoredScenarioId,
    ),
    baseline.scenario_branches,
  );

  const baselineEntries = byContentId(baseline);
  for (const entry of topic.content_entries) {
    assert.deepEqual(
      normalizePermittedContentChanges(entry),
      normalizePermittedContentChanges(baselineEntries.get(entry.content_id)),
      entry.content_id,
    );
    const supportedText = [
      entry.title_ko,
      entry.one_line_answer_ko,
      entry.caution_ko,
      ...entry.key_points_ko,
      ...entry.facts_to_check_ko,
      ...entry.action_steps_ko,
      ...entry.body_sections.flatMap(section => [
        section.heading_ko,
        ...section.paragraphs_ko,
      ]),
    ].join(' ');
    const supportedNumbers = numbersIn(supportedText);
    for (const number of numbersIn([
      entry.audience_situation_ko,
      ...entry.search_intents_ko,
    ].join(' '))) {
      assert.ok(
        supportedNumbers.has(number),
        `${entry.content_id}: 근거 필드에 없는 숫자 ${number}`,
      );
    }
  }
});

test('기존 related 대상 순서가 36개 typed 관계로 정확히 투영되고 runtime taxonomy를 지킨다', () => {
  const allContentIds = new Set(topic.content_entries.map(entry => entry.content_id));
  const allowedTypes = new Set([
    'prerequisite',
    'comparison',
    'deadline',
    'procedure',
    'remedy',
  ]);
  let edgeCount = 0;
  for (const entry of topic.content_entries) {
    const edges = entry.related_edges ?? [];
    assert.deepEqual(
      edges.map(edge => edge.target_id),
      entry.related_content_ids,
      entry.content_id,
    );
    assert.deepEqual(
      edges.map(edge => edge.relation_type),
      relationTypeFixture[entry.content_id],
      entry.content_id,
    );
    assert.equal(
      new Set(
        edges.map(
          edge =>
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
      assert.ok(edge.label_ko.trim().length >= 8, edge.label_ko);
    }
    edgeCount += edges.length;
  }
  assert.equal(edgeCount, 36);
});

test('Rule·Scenario·Source·관계 target은 모두 실제 객체로 닫힌다', () => {
  const ruleIds = new Set(topic.rule_cards.map(rule => rule.rule_id));
  const scenarioIds = new Set(
    topic.scenario_branches.map(scenario => scenario.scenario_id),
  );
  const sourceIds = new Set(topic.sources.map(source => source.coordinate_id));
  const contentIds = new Set(
    topic.content_entries.map(entry => entry.content_id),
  );
  for (const entry of topic.content_entries) {
    for (const ruleId of entry.rule_ids) assert.ok(ruleIds.has(ruleId), ruleId);
    for (const scenarioId of entry.scenario_ids) {
      assert.ok(scenarioIds.has(scenarioId), scenarioId);
    }
    for (const sourceId of entry.source_coordinate_ids) {
      assert.ok(sourceIds.has(sourceId), sourceId);
    }
    for (const targetId of entry.related_content_ids) {
      assert.ok(contentIds.has(targetId), targetId);
    }
  }
});

test('구조 래칫은 이 주제의 audience 1건과 scenario 1건만 정확히 닫는다', async () => {
  assert.deepEqual(structuralCounts(baseline.content_entries), {
    structure_incomplete: 1,
    audience_situation_missing: 1,
    scenario_missing: 1,
  });
  assert.deepEqual(structuralCounts(topic.content_entries), {
    structure_incomplete: 0,
    audience_situation_missing: 0,
    scenario_missing: 0,
  });

  const {knowledge} = await loadComposition(manifestPath, {
    snapshotId: 'kr-knowledge-core-20260723-023',
  });
  const topicIds = new Set(topic.content_entries.map(entry => entry.content_id));
  const baselineEntries = byContentId(baseline);
  const before = knowledge.content_entries.map(entry =>
    topicIds.has(entry.content_id)
      ? structuredClone(baselineEntries.get(entry.content_id))
      : entry,
  );
  const afterCounts = structuralCounts(knowledge.content_entries);
  const beforeCounts = structuralCounts(before);
  assert.equal(
    beforeCounts.structure_incomplete - afterCounts.structure_incomplete,
    1,
  );
  assert.equal(
    beforeCounts.audience_situation_missing
      - afterCounts.audience_situation_missing,
    1,
  );
  assert.equal(
    beforeCounts.scenario_missing - afterCounts.scenario_missing,
    1,
  );
});
