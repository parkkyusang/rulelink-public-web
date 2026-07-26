import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicRelativePath = 'artifacts/publication/topics/commercial-lease.json';
const topicPath = path.join(repositoryRoot, topicRelativePath);
const currentPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);
const baselineCommit = 'f08c241f35e3499fd380b2e536d8452e98ef54e7';

const [topic, current] = await Promise.all([
  readJson(topicPath),
  readJson(currentPath),
]);
const baseline = JSON.parse(
  execFileSync(
    'git',
    [
      '-c',
      'safe.directory=*',
      'show',
      `${baselineCommit}:${topicRelativePath}`,
    ],
    { cwd: repositoryRoot, encoding: 'utf8' },
  ),
);

const searchFixture = {
  'content.commercial-lease-act-scope': [
    '환산보증금이 기준을 넘으면 상가임대차보호법을 전혀 못 받나요?',
    '보증금이 큰 상가도 대항력과 갱신요구권이 적용되나요?',
    '내 상가 보증금이 법의 보호 범위에 드는지 어떻게 확인하나요?',
  ],
  'content.commercial-lease-opposability-and-registration': [
    '상가를 인도받고 사업자등록을 신청하면 대항력은 언제 생기나요?',
    '건물주가 바뀌어도 상가 임대차를 주장하려면 무엇이 필요한가요?',
    '상가가 경매로 넘어가기 전에 사업자등록 외에 무엇을 확인해야 하나요?',
  ],
  'content.commercial-lease-priority-repayment': [
    '상가 확정일자를 받으면 경매 배당에서 무조건 먼저 받나요?',
    '상가 보증금 우선변제를 받으려면 어떤 요건이 필요한가요?',
    '사업자등록과 확정일자 중 무엇을 먼저 갖춰야 하나요?',
  ],
  'content.commercial-lease-move-before-deposit-refund': [
    '상가 보증금을 못 받았는데 점포를 먼저 비워도 되나요?',
    '상가 임차권등기명령을 신청한 뒤 바로 이전해도 되나요?',
    '폐업으로 상가를 옮기기 전에 보증금 순위를 어떻게 지키나요?',
  ],
  'content.commercial-lease-renewal-right': [
    '상가 계약이 끝나기 몇 달 전부터 갱신을 요구할 수 있나요?',
    '상가 계약갱신요구권은 처음 계약일부터 몇 년까지 보호되나요?',
    '임대인은 어떤 사유가 있어야 상가 갱신을 거절할 수 있나요?',
  ],
  'content.commercial-lease-rent-arrears': [
    '상가 월세를 일부씩 밀렸는데 3기 연체는 어떻게 계산하나요?',
    '월세 3개월분을 밀리면 임대인이 바로 계약을 해지할 수 있나요?',
    '밀린 월세를 나중에 갚으면 갱신 거절 사유도 없어지나요?',
  ],
  'content.commercial-lease-key-money-recovery': [
    '임대인이 제가 구한 새 임차인과 계약을 거절하면 권리금을 청구할 수 있나요?',
    '상가 권리금 회수기회 보호는 계약 종료 몇 달 전부터 적용되나요?',
    '신규 임차인 소개와 임대인의 거절을 어떤 자료로 남겨야 하나요?',
  ],
  'content.commercial-lease-rent-increase-and-conversion': [
    '상가 임대인이 월세를 5퍼센트 넘게 올릴 수 있나요?',
    '상가 월세를 올린 지 1년이 안 됐는데 또 올릴 수 있나요?',
    '상가 보증금을 월세로 바꿀 때 금액은 어떻게 계산하나요?',
  ],
  'content.commercial-lease-management-fee-breakdown': [
    '상가 관리비 총액만 받았는데 항목별 내역을 요구할 수 있나요?',
    '임대인은 상가 관리비의 부과기간과 금액을 공개해야 하나요?',
    '월세 인상과 관리비 인상을 어떻게 구별하나요?',
  ],
  'content.commercial-lease-dispute-conciliation': [
    '상가 보증금이나 권리금 분쟁을 조정위원회에 신청할 수 있나요?',
    '상가임대차 분쟁조정을 신청하려면 어떤 자료가 필요한가요?',
    '상가 분쟁조정과 민사소송 중 무엇을 먼저 검토해야 하나요?',
  ],
  'content.commercial-lease-closure-termination': [
    '집합금지로 폐업한 상가는 임대차를 중도 해지할 수 있나요?',
    '영업시간 제한이 몇 달 이어져야 상가 계약 해지를 검토할 수 있나요?',
    '폐업 후 해지 통보를 하면 언제 계약이 끝나나요?',
  ],
};

const edgeFixture = {
  'content.commercial-lease-act-scope': [
    ['procedure', 'content.commercial-lease-opposability-and-registration', '적용범위 확인 뒤 대항력 요건 갖추기'],
    ['comparison', 'content.commercial-lease-renewal-right', '보증금 기준을 넘을 때 갱신권 적용 비교'],
  ],
  'content.commercial-lease-opposability-and-registration': [
    ['procedure', 'content.commercial-lease-priority-repayment', '대항요건 뒤 확정일자·우선변제 갖추기'],
    ['procedure', 'content.commercial-lease-move-before-deposit-refund', '이전 전 임차권등기로 권리 보전하기'],
    ['comparison', 'content.housing-lease-opposability-basics', '상가와 주택의 대항력 요건 비교'],
  ],
  'content.commercial-lease-priority-repayment': [
    ['prerequisite', 'content.commercial-lease-opposability-and-registration', '우선변제 전 인도·사업자등록 확인'],
    ['procedure', 'content.commercial-lease-move-before-deposit-refund', '이전해야 하면 임차권등기로 순위 보전'],
    ['comparison', 'content.housing-lease-priority-repayment-basics', '상가와 주택의 우선변제 요건 비교'],
  ],
  'content.commercial-lease-move-before-deposit-refund': [
    ['prerequisite', 'content.commercial-lease-priority-repayment', '이전 전 우선변제 요건과 순위 확인'],
    ['remedy', 'content.commercial-lease-dispute-conciliation', '보증금 미반환 분쟁조정 검토'],
    ['comparison', 'content.move-before-deposit-refund', '주택 보증금 미반환 이사 경로와 비교'],
    ['procedure', 'content.lease-registration-application-is-not-completion', '신청 뒤 임차권등기 완료까지 확인'],
  ],
  'content.commercial-lease-renewal-right': [
    ['comparison', 'content.commercial-lease-rent-arrears', '3기 차임연체의 갱신거절 효과 비교'],
    ['comparison', 'content.commercial-lease-rent-increase-and-conversion', '갱신과 차임·보증금 조정 기준 비교'],
  ],
  'content.commercial-lease-rent-arrears': [
    ['comparison', 'content.commercial-lease-renewal-right', '연체의 해지·갱신거절 효과 함께 비교'],
    ['remedy', 'content.commercial-lease-dispute-conciliation', '연체액·해지 다툼의 분쟁조정 검토'],
  ],
  'content.commercial-lease-key-money-recovery': [
    ['prerequisite', 'content.commercial-lease-renewal-right', '계약 종료·갱신 시점 먼저 확인'],
    ['remedy', 'content.commercial-lease-dispute-conciliation', '권리금 회수 방해의 분쟁조정 검토'],
  ],
  'content.commercial-lease-rent-increase-and-conversion': [
    ['comparison', 'content.commercial-lease-renewal-right', '계약 갱신과 차임 조정 기준 비교'],
    ['comparison', 'content.commercial-lease-management-fee-breakdown', '차임 증액과 관리비 인상 구별'],
  ],
  'content.commercial-lease-management-fee-breakdown': [
    ['comparison', 'content.commercial-lease-rent-increase-and-conversion', '관리비와 차임·월세 증액 구별'],
    ['remedy', 'content.commercial-lease-dispute-conciliation', '관리비 내역·부담 다툼의 조정 검토'],
  ],
  'content.commercial-lease-dispute-conciliation': [
    ['prerequisite', 'content.commercial-lease-rent-arrears', '차임 연체액과 해지 쟁점 먼저 정리'],
    ['prerequisite', 'content.commercial-lease-key-money-recovery', '권리금 주선·거절 증거 먼저 정리'],
    ['prerequisite', 'content.commercial-lease-management-fee-breakdown', '관리비 항목·금액 자료 먼저 정리'],
    ['comparison', 'content.civil-mediation-vs-civil-lawsuit', '상가 조정과 민사소송 경로 비교'],
  ],
  'content.commercial-lease-closure-termination': [
    ['comparison', 'content.commercial-lease-rent-arrears', '특별 해지와 차임연체 해지 구별'],
    ['remedy', 'content.commercial-lease-dispute-conciliation', '폐업 해지·정산 다툼의 조정 검토'],
    ['comparison', 'content.civil-mediation-vs-civil-lawsuit', '조정과 민사소송의 해결 경로 비교'],
  ],
};

test('검색과 유형 관계 외 법리·수치·기한·분기·근거를 기준 커밋과 동일하게 보존한다', () => {
  assertStructure(topic);
});

test('11개 글에 실제 사용자가 입력할 고유 질문 33개를 고정한다', () => {
  assertSearchContract(topic);
});

test('기존 관련 대상과 순서를 29개 유형 관계로 정확히 투영한다', () => {
  assertRelationContract(topic);
});

test('검색 충돌·관계 교체·법률내용 변조를 음성 회귀가 차단한다', () => {
  const duplicateQuery = structuredClone(topic);
  duplicateQuery.content_entries[1].search_intents_ko[0] =
    duplicateQuery.content_entries[0].search_intents_ko[0];
  assert.throws(() => assertSearchContract(duplicateQuery));

  const titleCopy = structuredClone(topic);
  titleCopy.content_entries[0].search_intents_ko[0] =
    titleCopy.content_entries[0].title_ko;
  assert.throws(() => assertSearchContract(titleCopy));

  const changedTarget = structuredClone(topic);
  changedTarget.content_entries[0].related_edges[0].target_id =
    'content.commercial-lease-renewal-right';
  assert.throws(() => assertRelationContract(changedTarget));

  const changedTaxonomy = structuredClone(topic);
  changedTaxonomy.content_entries[4].related_edges[1].relation_type =
    'procedure';
  assert.throws(() => assertRelationContract(changedTaxonomy));

  const changedLegalEffect = structuredClone(topic);
  changedLegalEffect.rule_cards[0].norm.legal_effect_ko += ' 임의 문장';
  assert.throws(() => assertStructure(changedLegalEffect));

  const removedScenario = structuredClone(topic);
  removedScenario.content_entries[2].scenario_ids = [];
  assert.throws(() => assertStructure(removedScenario));
});

function assertStructure(candidate) {
  assert.equal(candidate.topic_id, baseline.topic_id);
  for (const field of [
    'schema',
    'sources',
    'topic_hubs',
    'rule_cards',
    'scenario_branches',
    'concept_cards',
  ]) {
    assert.deepEqual(candidate[field], baseline[field], field);
  }

  assert.deepEqual(
    candidate.content_entries.map((entry) => entry.content_id),
    baseline.content_entries.map((entry) => entry.content_id),
    'content ID 집합·순서',
  );

  for (const entry of candidate.content_entries) {
    const before = baseline.content_entries.find(
      (item) => item.content_id === entry.content_id,
    );
    assert.ok(before, entry.content_id);
    assert.deepEqual(stableEntry(entry), stableEntry(before), entry.content_id);
    assert.ok(entry.audience_situation_ko.trim(), `${entry.content_id}: audience`);
    assert.ok(entry.scenario_ids.length > 0, `${entry.content_id}: scenario`);
  }
}

function assertSearchContract(candidate) {
  const candidateIds = new Set(
    candidate.content_entries.map((entry) => entry.content_id),
  );
  const otherQueries = new Set(
    current.knowledge.content_entries
      .filter((entry) => !candidateIds.has(entry.content_id))
      .flatMap((entry) => entry.search_intents_ko ?? [])
      .map(normalizeSearch)
      .filter(Boolean),
  );
  const seen = new Set();

  for (const entry of candidate.content_entries) {
    assert.deepEqual(
      entry.search_intents_ko,
      searchFixture[entry.content_id],
      entry.content_id,
    );
    assert.equal(entry.search_intents_ko.length, 3, entry.content_id);
    const title = normalizeSearch(entry.title_ko);
    for (const query of entry.search_intents_ko) {
      const normalized = normalizeSearch(query);
      assert.match(query, /[?？]$/, `${entry.content_id}: 질문형 문장`);
      assert.match(query, /[가-힣]/, `${entry.content_id}: 한국어`);
      assert.notEqual(normalized, title, `${entry.content_id}: 제목 복사`);
      assert.ok(
        !query.toLowerCase().includes(entry.slug.toLowerCase()),
        `${entry.content_id}: slug 복사`,
      );
      assert.ok(!seen.has(normalized), `${entry.content_id}: 내부 검색 충돌`);
      assert.ok(
        !otherQueries.has(normalized),
        `${entry.content_id}: 다른 주제 검색 충돌`,
      );
      seen.add(normalized);
    }
  }
  assert.equal(seen.size, 33);
}

function assertRelationContract(candidate) {
  const universe = new Set([
    ...candidate.content_entries.map((entry) => entry.content_id),
    ...current.knowledge.content_entries.map((entry) => entry.content_id),
  ]);
  const allowedTypes = new Set([
    'prerequisite',
    'comparison',
    'deadline',
    'procedure',
    'remedy',
    'law_change',
    'concept',
    'concierge_boundary',
  ]);
  let count = 0;

  for (const entry of candidate.content_entries) {
    const expected = edgeFixture[entry.content_id];
    assert.ok(expected, entry.content_id);
    const actual = entry.related_edges.map((edge) => [
      edge.relation_type,
      edge.target_id,
      edge.label_ko,
    ]);
    assert.deepEqual(actual, expected, entry.content_id);
    assert.deepEqual(
      entry.related_content_ids,
      expected.map(([, targetId]) => targetId),
      `${entry.content_id}: legacy 순서`,
    );

    const seenTargets = new Set();
    for (const edge of entry.related_edges) {
      assert.equal(edge.target_kind, 'content', entry.content_id);
      assert.ok(allowedTypes.has(edge.relation_type), entry.content_id);
      assert.ok(universe.has(edge.target_id), `${entry.content_id}: target`);
      assert.notEqual(edge.target_id, entry.content_id, entry.content_id);
      assert.ok(!seenTargets.has(edge.target_id), `${entry.content_id}: 중복`);
      assert.ok(edge.label_ko.trim().length >= 8, `${entry.content_id}: label`);
      seenTargets.add(edge.target_id);
      count += 1;
    }
  }
  assert.equal(count, 29);
}

function stableEntry(entry) {
  const {
    search_intents_ko: _searchIntents,
    related_edges: _relatedEdges,
    ...stable
  } = entry;
  return stable;
}

function normalizeSearch(value) {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·ㆍ\-_/()[\]{}'",.:;!?？]+/g, '');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
