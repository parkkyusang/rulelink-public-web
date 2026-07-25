import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {changeLifecycleLabel} from '../src/lib/change-lifecycle.ts';
import {buildKnowledgeSearchDocuments} from '../src/lib/knowledge-search.ts';
import {
  buildSiteSearchDocuments,
  rankSiteSearchDocuments,
  tokenizeSiteSearchQuery,
} from '../src/lib/site-search-discovery.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(await readFile(
  path.resolve(appRoot, '..', '..', 'artifacts/publication/current/bundle.json'),
  'utf8',
));
const knowledgeDocuments = buildKnowledgeSearchDocuments(bundle.knowledge);
const scenarioById = new Map(
  bundle.knowledge.scenario_branches.map(scenario => [scenario.scenario_id, scenario]),
);
const decisionQuestions = new Map(
  bundle.knowledge.content_entries.flatMap(entry => {
    const questions = [...new Set(entry.scenario_ids
      .map(scenarioId => scenarioById.get(scenarioId)?.question_ko)
      .filter(Boolean)
      .map(question => question.trim()))];
    return questions.length ? [[entry.content_id, questions]] : [];
  }),
);
const documents = buildSiteSearchDocuments(
  bundle.cards,
  bundle.change_briefs,
  knowledgeDocuments,
  bundle.catalog?.topics ?? [],
  {
    changeLifecycle: changeLifecycleLabel,
    knowledgeContentType: value => value || '법률정보',
  },
  decisionQuestions,
);
const now = new Date('2026-07-24T00:00:00+09:00');

test('운영 정본의 모든 검색 대상을 종류 편향 없이 한 투영으로 유지한다', () => {
  const expectedCounts = {
    issue: bundle.cards.length,
    knowledge: bundle.knowledge.content_entries.length,
    change: bundle.change_briefs.length,
  };
  assert.equal(
    documents.length,
    Object.values(expectedCounts).reduce((sum, count) => sum + count, 0),
  );
  assert.deepEqual(
    Object.fromEntries(['issue', 'knowledge', 'change'].map(kind => [
      kind,
      documents.filter(document => document.kind === kind).length,
    ])),
    expectedCounts,
  );
  const ranked = rankSiteSearchDocuments(documents, {now, query: ''});
  assert.equal(ranked.length, documents.length);
  assert.ok(ranked.every(result => result.matchReasons.length === 0));
  for (let index = 1; index < ranked.length; index += 1) {
    const previous = ranked[index - 1];
    const current = ranked[index];
    assert.ok(
      previous.reviewedAt > current.reviewedAt
      || previous.reviewedAt === current.reviewedAt,
      `${previous.id} 다음에 더 최신 ${current.id}가 배치됐습니다.`,
    );
  }
});

test('전체 검색 인덱스와 초기 24개 문서는 각각 절대 전송량 예산 안에 있다', () => {
  const payload = {
    schema: 'rulelink_public_search_index_v1',
    generated_at: now.toISOString(),
    documents,
  };
  const ranked = rankSiteSearchDocuments(documents, {now, query: ''})
    .slice(0, 24)
    .map(({
      freshnessState: _freshness,
      matchReasons: _reasons,
      score: _score,
      ...document
    }) => document);
  assert.ok(
    Buffer.byteLength(JSON.stringify(payload)) <= 400_000,
    '지연 검색 인덱스가 400KB 절대 예산을 넘었습니다.',
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify(ranked)) <= 60_000,
    '초기 검색 문서 24개가 60KB 절대 예산을 넘었습니다.',
  );
});

test('지식 검색 카드는 연결된 모든 사실분기 질문을 순서대로 색인한다', () => {
  const entry = bundle.knowledge.content_entries.find(
    candidate => (decisionQuestions.get(candidate.content_id)?.length ?? 0) > 1,
  );
  assert.ok(entry);
  const questions = decisionQuestions.get(entry.content_id);
  const document = documents.find(candidate => candidate.id === entry.content_id);
  assert.deepEqual(document?.fields.decision, questions);
  assert.doesNotMatch(JSON.stringify(document), /when_true_ko|when_false_ko/u);

  const laterQuestion = questions.at(-1);
  const ranked = rankSiteSearchDocuments(documents, {
    now,
    query: laterQuestion,
  });
  const result = ranked.find(candidate => candidate.id === entry.content_id);
  assert.equal(result?.decisionQuestion, laterQuestion);
  assert.ok(result?.matchReasons.some(reason => (
    reason.field === 'decision'
    && reason.text_ko === laterQuestion
    && reason.label_ko === '판단 질문'
  )));
});

test('0-query 동률은 검토일·제목·ID로 결정되고 법령변화 종류가 선두를 고정하지 않는다', () => {
  const fixture = [
    searchDocument('change-old', 'change', '2026-01-01', '오래된 법령 변화'),
    searchDocument('knowledge-new', 'knowledge', '2026-07-20', '최근 독립 지식'),
    searchDocument('issue-tie-b', 'issue', '2026-07-10', '나 제목'),
    searchDocument('change-tie-a', 'change', '2026-07-10', '가 제목'),
  ];
  const ranked = rankSiteSearchDocuments(fixture, {now, query: ''});
  assert.deepEqual(
    ranked.map(result => result.id),
    ['knowledge-new', 'change-tie-a', 'issue-tie-b', 'change-old'],
  );
});

test('상황형 한국어 질의는 ID가 아니라 실제 의미 필드가 맞는 독립 글을 찾는다', () => {
  const cases = [
    ['집주인이 보증금을 안 줘요', /임대인|보증금|반환/u],
    ['직장에서 괴롭힘 당했어요', /직장|괴롭힘|피해/u],
    ['사장님이 월급을 안 줘요', /회사|임금|급여|지급/u],
    ['인터넷 쇼핑 환불', /온라인|쇼핑|환불/u],
    ['보이스피싱 돈 돌려받기', /보이스피싱|환급|피해금/u],
    ['전 남편이 계속 연락해요', /배우자|연인|연락|스토킹/u],
    ['학교에서 맞았어요', /학교|폭행|학교폭력/u],
    ['월세를 세 번 밀렸어요', /월세|연체|누적/u],
    ['상속 빚이 많아요', /상속|채무|빚|초과/u],
  ];

  for (const [query, meaning] of cases) {
    const ranked = rankSiteSearchDocuments(documents, {now, query});
    assert.ok(ranked.length > 0, `${query}: 검색 결과가 없습니다.`);
    const top = ranked[0];
    assert.equal(top.kind, 'knowledge', `${query}: 독립 지식글이 선두가 아닙니다.`);
    const semanticFields = searchableText(top);
    assert.match(semanticFields, meaning, `${query}: 의미 필드가 질의를 뒷받침하지 않습니다.`);
    assert.ok(top.matchReasons.length > 0, `${query}: 실제 매칭 이유가 없습니다.`);
  }
});

test('정확한 search intent와 제목·대상·요약·공식근거를 결정론적으로 가중한다', () => {
  const fixture = [
    searchDocument('title-partial', 'knowledge', '2026-07-20', '보증금 반환 절차'),
    {
      ...searchDocument('intent-exact', 'knowledge', '2026-07-10', '임차인 안내'),
      fields: {
        ...searchDocument('intent-exact', 'knowledge', '2026-07-10', '임차인 안내').fields,
        searchIntent: ['보증금 반환'],
      },
    },
    {
      ...searchDocument('detail-only', 'knowledge', '2026-07-24', '다른 제목'),
      fields: {
        ...searchDocument('detail-only', 'knowledge', '2026-07-24', '다른 제목').fields,
        detail: ['보증금 반환'],
      },
    },
  ];
  const ranked = rankSiteSearchDocuments(fixture, {now, query: '보증금 반환'});
  assert.equal(ranked[0].id, 'intent-exact');
  assert.equal(ranked[0].matchReasons[0].field, 'search_intent');
  assert.equal(ranked.at(-1).id, 'detail-only');
});

test('조사 제거는 원문을 보존한 보조 variant이고 짧은 말·법률용어를 과도 절단하지 않는다', () => {
  assert.deepEqual(tokenizeSiteSearchQuery('상속인이'), [['상속인이', '상속인']]);
  assert.deepEqual(tokenizeSiteSearchQuery('법인은'), [['법인은', '법인']]);
  assert.deepEqual(tokenizeSiteSearchQuery('이'), [['이']]);

  const fixture = [
    searchDocument('heir', 'knowledge', '2026-07-20', '법정상속인 순위'),
    searchDocument('tax', 'knowledge', '2026-07-20', '상속세 신고'),
    searchDocument('seizure', 'knowledge', '2026-07-20', '급여 압류'),
  ];
  assert.deepEqual(
    rankSiteSearchDocuments(fixture, {now, query: '상속인이'}).map(result => result.id),
    ['heir'],
  );
  assert.deepEqual(
    rankSiteSearchDocuments(fixture, {
      now,
      query: '사장님이 월급을 안 줘요',
    }).map(result => result.id),
    [],
  );
});

test('비어 있지 않은 질의의 의미 토큰과 실제 매칭 이유가 없으면 결과를 닫는다', () => {
  assert.deepEqual(tokenizeSiteSearchQuery('세 번'), []);
  assert.deepEqual(
    rankSiteSearchDocuments(documents, {now, query: '세 번'}),
    [],
  );
  assert.deepEqual(
    rankSiteSearchDocuments(documents, {now, query: '!!!'}),
    [],
  );

  for (const result of rankSiteSearchDocuments(documents, {
    now,
    query: '보증금',
  })) {
    assert.ok(
      result.matchReasons.length > 0,
      `${result.id}: 비어 있지 않은 질의 결과에 표시할 근거가 없습니다.`,
    );
  }
});

test('짧은 부정어와 많다는 표현은 관련 문맥이 있을 때만 확장한다', () => {
  const fixture = [
    searchDocument('generic-guide', 'knowledge', '2026-07-20', '법률 안내'),
    searchDocument('asset-heavy', 'knowledge', '2026-07-20', '상속 재산이 많아요'),
    searchDocument('debt-heavy', 'knowledge', '2026-07-20', '상속 채무가 재산을 초과하는 경우'),
  ];

  assert.deepEqual(
    rankSiteSearchDocuments(fixture, {now, query: '안'}),
    [],
  );
  assert.deepEqual(
    rankSiteSearchDocuments(fixture, {
      now,
      query: '상속 재산이 많아요',
    }).map(result => result.id),
    ['asset-heavy'],
  );
  assert.ok(
    tokenizeSiteSearchQuery('집주인이 보증금을 안 줘요')
      .some(variants => variants.includes('돌려주지')),
  );
  assert.ok(
    tokenizeSiteSearchQuery('상속 빚이 많아요')
      .some(variants => variants.includes('초과')),
  );
});

test('공백·구두점과 부분 토큰을 정규화하고 모든 논리 토큰의 일치를 유지한다', () => {
  const spaced = rankSiteSearchDocuments(documents, {
    now,
    query: '  온라인,   쇼핑! 환불  ',
  });
  assert.ok(spaced.length > 0);
  assert.ok(spaced.every(result => (
    /온라인|전자상거래/u.test(searchableText(result))
    && /쇼핑/u.test(searchableText(result))
    && /환불/u.test(searchableText(result))
  )));
});

test('매칭 이유는 실제 표시 필드의 문구만 사용하고 현재성은 publicationNow 계약을 따른다', () => {
  const fixture = [{
    ...searchDocument('freshness', 'knowledge', '2026-07-20', '보증금 안내'),
    expiresAt: '2026-07-25T00:00:00+09:00',
    fields: {
      ...searchDocument('freshness', 'knowledge', '2026-07-20', '보증금 안내').fields,
      audience: ['임대인이 보증금을 돌려주지 않은 경우'],
    },
  }];
  const previous = process.env.RULELINK_PUBLICATION_NOW;
  process.env.RULELINK_PUBLICATION_NOW = '2026-07-24T00:00:00+09:00';
  try {
    const [result] = rankSiteSearchDocuments(fixture, {query: '집주인이 보증금을 안 줘요'});
    assert.equal(result.freshnessState, 'current');
    for (const reason of result.matchReasons) {
      const candidates = searchableValues(result);
      const visible = reason.text_ko.replace(/^…|…$/gu, '');
      assert.ok(candidates.some(candidate => candidate.includes(visible)));
    }
  } finally {
    if (previous === undefined) delete process.env.RULELINK_PUBLICATION_NOW;
    else process.env.RULELINK_PUBLICATION_NOW = previous;
  }
  const [expired] = rankSiteSearchDocuments(fixture, {
    now: new Date('2026-07-26T00:00:00+09:00'),
    query: '보증금',
  });
  assert.equal(expired.freshnessState, 'review_due');
});

function searchDocument(id, kind, reviewedAt, title) {
  return {
    id,
    kind,
    href: `/fixture/${id}`,
    title,
    summary: title,
    context: 'fixture',
    reviewedAt: `${reviewedAt}T00:00:00+09:00`,
    expiresAt: '2027-01-01T00:00:00+09:00',
    evidenceLabels: [],
    fields: {
      searchIntent: [],
      audience: [],
      detail: [],
    },
  };
}

function searchableText(document) {
  return searchableValues(document).join(' ');
}

function searchableValues(document) {
  return [
    document.title,
    document.summary,
    document.context,
    ...document.evidenceLabels,
    ...Object.values(document.fields).flat(),
  ];
}
