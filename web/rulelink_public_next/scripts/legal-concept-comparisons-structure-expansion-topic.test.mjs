import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicRelativePath =
  'artifacts/publication/topics/legal-concept-comparisons.json';
const topicPath = path.join(repositoryRoot, topicRelativePath);
const currentPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);
const baselineCommit = 'f08c241f35e3499fd380b2e536d8452e98ef54e7';

const topic = JSON.parse(await readFile(topicPath, 'utf8'));
const current = JSON.parse(await readFile(currentPath, 'utf8'));
const baseline = JSON.parse(
  execFileSync('git', ['show', `${baselineCommit}:${topicRelativePath}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }),
);

const searchFixture = {
  'content.inheritance-renunciation-vs-limited-acceptance': [
    '부모님 빚이 재산보다 많을 때 상속을 어떻게 정리하나요',
    '상속재산과 채무 규모를 모르면 한정승인을 해야 하나요',
    '제가 상속을 포기하면 다음 순위 가족에게 빚이 넘어가나요',
  ],
  'content.earnest-money-cancellation-vs-default-rescission': [
    '부동산 계약을 취소하려면 계약금만 포기하면 되나요',
    '중도금을 낸 뒤에도 계약금 배액으로 계약을 끝낼 수 있나요',
    '상대방이 잔금일을 어겼을 때 언제 계약을 해제할 수 있나요',
  ],
  'content.online-withdrawal-vs-contract-rescission': [
    '인터넷으로 산 물건을 단순 변심으로 취소할 수 있나요',
    '광고와 다른 상품이 왔을 때 청약철회 기간은 어떻게 되나요',
    '온라인 주문 상품을 판매자가 보내지 않으면 어떻게 취소하나요',
  ],
  'content.loan-proof-vs-enforceable-title': [
    '차용증만 있으면 채무자 통장을 바로 압류할 수 있나요',
    '송금내역과 대화만으로 빌려준 돈을 강제집행할 수 있나요',
    '돈을 빌려준 증거가 있어도 판결이 따로 필요한가요',
  ],
  'content.payment-order-vs-civil-lawsuit': [
    '빌려준 돈을 받으려면 지급명령부터 신청하는 게 빠른가요',
    '채무자가 다툴 것 같으면 바로 민사소송을 해야 하나요',
    '상대방 주소를 모르면 지급명령을 신청할 수 있나요',
  ],
  'content.provisional-attachment-vs-claim-seizure': [
    '판결받기 전에 채무자 통장을 미리 묶을 수 있나요',
    '지급명령이 확정되면 예금 압류와 추심을 어떻게 하나요',
    '가압류한 통장에서 바로 돈을 받을 수 있는 건가요',
  ],
  'content.criminal-compensation-order-vs-civil-damages': [
    '범죄 피해금은 형사재판에서 함께 돌려받을 수 있나요',
    '배상명령으로 청구하지 못하는 손해는 민사소송을 해야 하나요',
    '형사재판이 진행 중일 때 손해배상은 언제 신청하나요',
  ],
  'content.criminal-settlement-vs-complaint-withdrawal': [
    '가해자와 합의하면 고소가 자동으로 취소되나요',
    '합의금을 받은 뒤에도 고소취소서를 따로 내야 하나요',
    '처벌을 원하지 않는다는 합의서를 쓰면 사건이 끝나나요',
  ],
  'content.parental-authority-vs-custody': [
    '이혼할 때 친권자와 아이를 키울 사람을 다르게 정할 수 있나요',
    '양육자가 아니어도 자녀의 학교와 병원 결정을 할 수 있나요',
    '친권과 양육비 면접교섭은 각각 어떻게 정해야 하나요',
  ],
  'content.property-division-vs-consolation-money': [
    '배우자의 잘못이 크면 재산분할도 더 많이 받을 수 있나요',
    '이혼 위자료와 재산분할을 각각 청구해야 하나요',
    '혼인 중 모은 재산과 정신적 피해 보상은 어떻게 나누어 계산하나요',
  ],
  'content.worker-status-vs-contract-label': [
    '프리랜서 계약서를 써도 출퇴근 지시를 받으면 근로자인가요',
    '사업자등록이 있어도 퇴직금과 연차를 받을 수 있나요',
    '회사 지시대로 일한 프리랜서가 근로자임을 입증하려면 무엇이 필요한가요',
  ],
  'content.dismissal-notice-vs-unfair-dismissal-remedy': [
    '말이나 문자로만 해고 통보를 받으면 해고가 유효한가요',
    '해고통지서가 없어도 노동위원회에 구제신청을 해야 하나요',
    '해고 사유가 적힌 서면을 받은 뒤 무엇부터 준비해야 하나요',
  ],
  'content.lease-registration-vs-opposability-priority': [
    '보증금을 못 받은 채 이사하면 대항력과 우선변제권이 사라지나요',
    '임차권등기명령을 신청한 날 바로 전출해도 되나요',
    '전입신고와 확정일자가 있으면 임차권등기를 따로 해야 하나요',
  ],
};

const relationTypeFixture = {
  'content.inheritance-renunciation-vs-limited-acceptance': [
    'procedure', 'comparison', 'deadline',
  ],
  'content.earnest-money-cancellation-vs-default-rescission': [
    'comparison', 'deadline', 'prerequisite', 'remedy',
  ],
  'content.online-withdrawal-vs-contract-rescission': [
    'comparison', 'deadline', 'deadline', 'remedy',
  ],
  'content.loan-proof-vs-enforceable-title': [
    'procedure', 'prerequisite', 'prerequisite',
  ],
  'content.payment-order-vs-civil-lawsuit': [
    'procedure', 'prerequisite', 'prerequisite', 'deadline',
  ],
  'content.provisional-attachment-vs-claim-seizure': [
    'prerequisite', 'procedure', 'procedure',
  ],
  'content.criminal-compensation-order-vs-civil-damages': [
    'remedy', 'prerequisite', 'deadline', 'remedy',
  ],
  'content.criminal-settlement-vs-complaint-withdrawal': [
    'prerequisite', 'comparison',
  ],
  'content.parental-authority-vs-custody': [
    'procedure', 'procedure',
  ],
  'content.property-division-vs-consolation-money': [
    'comparison', 'deadline',
  ],
  'content.worker-status-vs-contract-label': [
    'comparison', 'comparison', 'comparison', 'prerequisite',
  ],
  'content.dismissal-notice-vs-unfair-dismissal-remedy': [
    'prerequisite', 'prerequisite', 'prerequisite', 'deadline',
  ],
  'content.lease-registration-vs-opposability-priority': [
    'procedure', 'prerequisite', 'prerequisite',
  ],
};

const allowedRelationTypes = new Set([
  'prerequisite',
  'comparison',
  'deadline',
  'procedure',
  'remedy',
  'law_change',
  'concept',
  'concierge_boundary',
]);

function byContentId(value) {
  return new Map(value.content_entries.map((entry) => [entry.content_id, entry]));
}

function normalizeQuery(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-z가-힣]+/g, '');
}

function queryTokens(value) {
  return new Set(
    value
      .normalize('NFKC')
      .toLocaleLowerCase('ko-KR')
      .replace(/[^0-9a-z가-힣]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1),
  );
}

function jaccard(left, right) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeUnchangedEntry(entry) {
  const copy = structuredClone(entry);
  delete copy.search_intents_ko;
  delete copy.related_content_ids;
  delete copy.related_edges;
  return copy;
}

test('13개 비교 글의 검색질문은 자연어 3개씩이며 제목·slug 복사와 상호 충돌이 없다', () => {
  assert.equal(topic.topic_id, 'hub.legal-concept-comparisons');
  assert.deepEqual(
    new Set(topic.content_entries.map((entry) => entry.content_id)),
    new Set(Object.keys(searchFixture)),
  );

  const queries = [];
  for (const entry of topic.content_entries) {
    assert.deepEqual(entry.search_intents_ko, searchFixture[entry.content_id]);
    assert.equal(entry.search_intents_ko.length, 3);
    const forbidden = new Set([
      normalizeQuery(entry.title_ko),
      normalizeQuery(entry.slug),
    ]);
    for (const query of entry.search_intents_ko) {
      assert.match(query, /[가-힣]/, `${entry.content_id}: 자연어 한글 질문 필요`);
      assert.ok(query.length >= 18, `${entry.content_id}: 지나치게 짧은 검색질문`);
      assert.ok(!forbidden.has(normalizeQuery(query)), `${entry.content_id}: 제목·slug 복사`);
      queries.push({ contentId: entry.content_id, query });
    }
  }

  assert.equal(new Set(queries.map(({ query }) => normalizeQuery(query))).size, 39);
  const localContentIds = new Set(topic.content_entries.map((entry) => entry.content_id));
  const externalQueries = new Map();
  for (const entry of current.knowledge.content_entries) {
    if (localContentIds.has(entry.content_id)) continue;
    for (const query of [
      ...(entry.search_intents_ko ?? []),
      entry.title_ko,
      entry.slug,
    ]) {
      const normalized = normalizeQuery(query);
      const contentIds = externalQueries.get(normalized) ?? [];
      contentIds.push(entry.content_id);
      externalQueries.set(normalized, contentIds);
    }
  }
  for (const { contentId, query } of queries) {
    assert.ok(
      !externalQueries.has(normalizeQuery(query)),
      `${contentId}: 다른 공개 글과 검색질문 충돌 ${query}`,
    );
  }

  for (let left = 0; left < queries.length; left += 1) {
    for (let right = left + 1; right < queries.length; right += 1) {
      if (queries[left].contentId === queries[right].contentId) continue;
      const score = jaccard(
        queryTokens(queries[left].query),
        queryTokens(queries[right].query),
      );
      assert.ok(
        score < 0.35,
        `검색질문 충돌:${queries[left].query} <> ${queries[right].query}`,
      );
    }
  }
});

test('42개 직접 관련 대상은 순서 그대로 typed 관계로 완전 투영된다', () => {
  const localContentIds = new Set(
    topic.content_entries.map((entry) => entry.content_id),
  );
  const currentContentIds = new Set(
    current.knowledge.content_entries.map((entry) => entry.content_id),
  );
  const edgeKeys = new Set();
  const rows = [];

  for (const entry of topic.content_entries) {
    assert.deepEqual(
      entry.related_edges.map((edge) => edge.target_id),
      entry.related_content_ids,
      `${entry.content_id}: legacy target 순서 불일치`,
    );
    assert.deepEqual(
      entry.related_edges.map((edge) => edge.relation_type),
      relationTypeFixture[entry.content_id],
      `${entry.content_id}: 관계 의미분류 불일치`,
    );
    for (const edge of entry.related_edges) {
      assert.equal(edge.target_kind, 'content');
      assert.ok(allowedRelationTypes.has(edge.relation_type));
      assert.ok(edge.label_ko.length >= 8, `${entry.content_id}: 관계 설명 부족`);
      assert.notEqual(edge.target_id, entry.content_id);
      assert.ok(
        localContentIds.has(edge.target_id) || currentContentIds.has(edge.target_id),
        `${entry.content_id}: 존재하지 않는 target ${edge.target_id}`,
      );
      const edgeKey = `${entry.content_id}|${edge.target_kind}|${edge.target_id}|${edge.relation_type}`;
      assert.ok(!edgeKeys.has(edgeKey), `${entry.content_id}: 중복 typed edge`);
      edgeKeys.add(edgeKey);
      rows.push(
        [
          entry.content_id,
          edge.target_kind,
          edge.target_id,
          edge.relation_type,
          edge.label_ko,
        ].join('\u0000'),
      );
    }
  }

  assert.equal(rows.length, 42);
  assert.equal(
    createHash('sha256').update(rows.join('\n')).digest('hex'),
    '17b1c7a3d061bc4404f799115b85ab2acd80533aaa6d3a3021f342c2d140ca81',
  );
});

test('검색질문과 직접 관련 경로 외 법리·수치·기한·본문·대상상황은 baseline과 같다', () => {
  const baselineById = byContentId(baseline);
  const candidateById = byContentId(topic);

  assert.deepEqual(new Set(candidateById.keys()), new Set(baselineById.keys()));
  for (const [contentId, entry] of candidateById) {
    assert.deepEqual(
      normalizeUnchangedEntry(entry),
      normalizeUnchangedEntry(baselineById.get(contentId)),
      `${contentId}: 허용 범위 밖 변경`,
    );
  }

  const candidateEnvelope = structuredClone(topic);
  const baselineEnvelope = structuredClone(baseline);
  delete candidateEnvelope.content_entries;
  delete baselineEnvelope.content_entries;
  assert.deepEqual(candidateEnvelope, baselineEnvelope);
});

test('구조 확장 래칫은 제목·slug 검색복사와 legacy-only 관계를 13건씩 줄인다', () => {
  const baselineById = byContentId(baseline);
  const candidateById = byContentId(topic);
  const contentIds = [...candidateById.keys()];

  const searchCopyGap = (entry) => {
    const normalized = new Set(entry.search_intents_ko.map(normalizeQuery));
    return normalized.has(normalizeQuery(entry.title_ko))
      || normalized.has(normalizeQuery(entry.slug));
  };
  const legacyOnlyGap = (entry) =>
    entry.related_content_ids.length > 0 && !(entry.related_edges?.length > 0);

  assert.equal(
    contentIds.filter((contentId) => searchCopyGap(baselineById.get(contentId))).length,
    13,
  );
  assert.equal(
    contentIds.filter((contentId) => searchCopyGap(candidateById.get(contentId))).length,
    0,
  );
  assert.equal(
    contentIds.filter((contentId) => legacyOnlyGap(baselineById.get(contentId))).length,
    13,
  );
  assert.equal(
    contentIds.filter((contentId) => legacyOnlyGap(candidateById.get(contentId))).length,
    0,
  );
});
