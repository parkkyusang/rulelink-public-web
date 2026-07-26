import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {changeLifecycleLabel} from '../src/lib/change-lifecycle.ts';
import {
  buildKnowledgeSearchDocuments,
  buildKnowledgeSearchSemanticSupport,
} from '../src/lib/knowledge-search.ts';
import {
  buildSiteSearchDocuments,
  classifySiteSearchMiss,
  rankSiteSearchDocuments,
  SITE_SEARCH_PLACEHOLDER,
  tokenizeSiteSearchQuery,
} from '../src/lib/site-search-discovery.ts';
import {
  decodeSiteSearchIndex,
  encodeSiteSearchIndex,
  encodeSiteSearchIndexV2,
  projectLegacySiteSearchDocuments,
} from '../src/lib/site-search-index.ts';

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
    const questions = entry.scenario_ids.flatMap(scenarioId => {
      const question = scenarioById.get(scenarioId)?.question_ko?.trim();
      return question ? [{question, scenarioId}] : [];
    });
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
  buildKnowledgeSearchSemanticSupport(bundle.knowledge),
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
  const payload = encodeSiteSearchIndex(documents, now.toISOString());
  const v2Payload = encodeSiteSearchIndexV2(documents, now.toISOString());
  const legacyDocuments = projectLegacySiteSearchDocuments(documents);
  const legacyPayload = {
    schema: 'rulelink_public_search_index_v1',
    generated_at: now.toISOString(),
    documents: legacyDocuments,
  };
  assert.deepEqual(decodeSiteSearchIndex(payload), {
    generatedAt: now.toISOString(),
    documents,
  });
  assert.equal(v2Payload.schema, 'rulelink_public_search_index_v2');
  assert.ok(v2Payload.documents.every(document => document.length === 14));
  assert.equal(decodeSiteSearchIndex(v2Payload), null);
  const ranked = rankSiteSearchDocuments(documents, {now, query: ''})
    .slice(0, 24)
    .map(({
      freshnessState: _freshness,
      matchReasons: _reasons,
      score: _score,
      ...document
    }) => document);
  assert.ok(
    Buffer.byteLength(JSON.stringify(payload)) <= 390_000,
    'exact scenario handoff를 포함한 지연 검색 인덱스가 390KB 절대 예산을 넘었습니다.',
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify(legacyPayload)) <= 390_000,
    '구 클라이언트 호환용 v1 검색 인덱스가 390KB 절대 예산을 넘었습니다.',
  );
  assert.ok(legacyDocuments.every(document => (
    document.decisionIds === undefined && document.fields.decision === undefined
  )), 'v1 호환 인덱스에는 v2 전용 사실분기 투영을 중복 전송하지 않습니다.');
  assert.ok(
    Buffer.byteLength(JSON.stringify(ranked)) <= 60_000,
    '초기 검색 문서 24개가 60KB 절대 예산을 넘었습니다.',
  );
});

test('공용 문자열 사전은 잘못된 문서 tuple과 문자열 참조를 fail-closed 한다', () => {
  const payload = encodeSiteSearchIndex(documents, now.toISOString());
  const decisionDocumentIndex = payload.documents.findIndex(document => document[9].length > 0);
  assert.notEqual(decisionDocumentIndex, -1);
  assert.equal(decodeSiteSearchIndex({...payload, schema: 'unknown'}), null);
  assert.equal(decodeSiteSearchIndex({...payload, documents: [[0]]}), null);
  assert.equal(decodeSiteSearchIndex({
    ...payload,
    documents: payload.documents.map((document, index) => (
      index === 0
        ? document.map((value, position) => (
            position === 0 ? payload.strings.length : value
      ))
        : document
    )),
  }), null);
  assert.equal(decodeSiteSearchIndex({
    ...payload,
    documents: payload.documents.map((document, index) => (
      index === decisionDocumentIndex
        ? document.map((value, position) => (
            position === 9 ? [] : value
          ))
        : document
    )),
  }), null);
});

test('지식 검색 카드는 연결된 모든 사실분기 질문을 순서대로 색인한다', () => {
  const entry = bundle.knowledge.content_entries.find(
    candidate => (decisionQuestions.get(candidate.content_id)?.length ?? 0) > 1,
  );
  assert.ok(entry);
  const questions = decisionQuestions.get(entry.content_id);
  const document = documents.find(candidate => candidate.id === entry.content_id);
  assert.deepEqual(document?.fields.decision, questions.map(item => item.question));
  assert.deepEqual(
    document?.decisionIds,
    questions.map(item => item.scenarioId),
  );
  assert.doesNotMatch(JSON.stringify(document), /when_true_ko|when_false_ko/u);

  const laterTarget = questions.at(-1);
  const laterQuestion = laterTarget.question;
  const ranked = rankSiteSearchDocuments(documents, {
    now,
    query: laterQuestion,
  });
  const result = ranked.find(candidate => candidate.id === entry.content_id);
  assert.equal(result?.decisionQuestion, laterQuestion);
  assert.equal(result?.decisionScenarioId, laterTarget.scenarioId);
  assert.ok(result?.matchReasons.some(reason => (
    reason.field === 'decision'
    && reason.text_ko === laterQuestion
    && reason.label_ko === '판단 질문'
  )));
});

test('운영 정본의 후속 사실분기 질문은 전부 카드 질문과 판단 근거가 일치한다', () => {
  const laterQuestions = [...decisionQuestions].flatMap(
    ([contentId, questions]) => questions.slice(1).map(target => ({
      contentId,
      question: target.question,
      scenarioId: target.scenarioId,
    })),
  );
  const expectedLaterQuestionCount = bundle.knowledge.content_entries.reduce(
    (count, entry) => count + Math.max(0, (
      entry.scenario_ids.filter(scenarioId => (
        Boolean(scenarioById.get(scenarioId)?.question_ko?.trim())
      )).length - 1
    )),
    0,
  );
  assert.equal(laterQuestions.length, expectedLaterQuestionCount);

  for (const {contentId, question, scenarioId} of laterQuestions) {
    const result = rankSiteSearchDocuments(documents, {
      now,
      query: question,
    }).find(candidate => candidate.id === contentId);
    assert.ok(result, `${contentId}: 후속 판단 질문 검색 결과 누락`);
    assert.equal(result.decisionQuestion, question, `${contentId}: 카드 질문 불일치`);
    assert.equal(result.decisionScenarioId, scenarioId, `${contentId}: scenario anchor 불일치`);
    assert.ok(
      result.matchReasons.some(reason => (
        reason.field === 'decision'
        && reason.text_ko === question
        && reason.label_ko === '판단 질문'
      )),
      `${contentId}: 선택한 카드 질문이 세 개 검색 근거에 결박되지 않음`,
    );
  }
});

test('복합 질의는 흔한 짧은 말보다 고유한 판단어가 있는 질문을 선택한다', () => {
  const contentId = 'content.admin-appeal.eligibility-document-branch';
  const result = rankSiteSearchDocuments(documents, {
    now,
    query: '신청 행정정보',
  }).find(candidate => candidate.id === contentId);
  assert.ok(result);
  assert.match(result.decisionQuestion ?? '', /행정정보/u);
  assert.ok(result.matchReasons.some(reason => (
    reason.field === 'decision'
    && reason.text_ko === result.decisionQuestion
  )));
});

test('정확한 제목 검색은 부분 일치 판단 질문보다 제목 근거를 먼저 보여준다', () => {
  const knowledgeSearchDocuments = documents.filter(
    document => document.kind === 'knowledge',
  );
  assert.equal(knowledgeSearchDocuments.length, 284);
  for (const document of knowledgeSearchDocuments) {
    const result = rankSiteSearchDocuments(documents, {
      now,
      query: document.title,
    }).find(candidate => candidate.id === document.id);
    assert.ok(result, `${document.id}: 정확한 제목 검색 결과 누락`);
    assert.equal(result.matchReasons[0]?.field, 'title', document.id);
    assert.equal(result.matchReasons[0]?.text_ko, document.title, document.id);
  }
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
    ['집주인이 보증금을 돌려주지 않아요', /임대인|보증금|반환/u],
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

test('문장 어미가 붙은 미일치 의미 술어는 버리지 않고 관련 없는 결과를 차단한다', () => {
  for (const query of [
    '보증금으로 살인했습니다',
    '직장에서 절도했는데요',
    '상속을 위조했습니다',
    '이혼하고 방화했습니다',
  ]) {
    assert.deepEqual(
      rankSiteSearchDocuments(documents, {now, query}),
      [],
      `${query}: 미일치 의미 술어를 버리고 관련 없는 결과를 열었습니다.`,
    );
  }

  const violence = rankSiteSearchDocuments(documents, {
    now,
    query: '남편이 때려요',
  });
  assert.ok(violence.length > 0, '일상어 가정폭력 질의가 결과를 찾지 못합니다.');
  assert.equal(violence[0].kind, 'knowledge');
  assert.match(searchableText(violence[0]), /배우자|가정폭력|폭행|신체/u);
  assert.ok(violence[0].matchReasons.length > 0);
});

test('placeholder 질의는 운영 정본에서 실제 결과와 표시 근거를 가진다', () => {
  const ranked = rankSiteSearchDocuments(documents, {
    now,
    query: SITE_SEARCH_PLACEHOLDER,
  });
  assert.ok(ranked.length > 0, `${SITE_SEARCH_PLACEHOLDER}: 검색 결과가 0건입니다.`);
  assert.ok(
    ranked.every(result => result.matchReasons.length > 0),
    `${SITE_SEARCH_PLACEHOLDER}: 검색 근거 없는 결과가 있습니다.`,
  );
});

test('조문·사건번호 검색은 화면용 운영 데이터 없이 검색 회귀로만 보존한다', () => {
  for (const query of ['민법 제1026조', '2013다73520']) {
    const ranked = rankSiteSearchDocuments(documents, {now, query});
    assert.ok(ranked.length > 0, `${query}: 검색 결과가 0건입니다.`);
    assert.ok(
      ranked.every(result => result.matchReasons.length > 0),
      `${query}: 검색 근거 없는 결과가 있습니다.`,
    );
  }
});

test('홈은 결과처럼 보이는 하드코딩 링크 없이 실제 검색 form과 검증된 placeholder만 둔다', async () => {
  const homeSource = await readFile(path.join(appRoot, 'app', 'page.tsx'), 'utf8');
  assert.match(homeSource, /<form action="\/ko\/search"[\s\S]*method="get"/u);
  assert.match(homeSource, /name="q"/u);
  assert.match(homeSource, /placeholder=\{`예: \$\{SITE_SEARCH_PLACEHOLDER\}`\}/u);
  assert.doesNotMatch(homeSource, /homeSearchExamples|\/ko\/search\?q=/u);

  const ranked = rankSiteSearchDocuments(documents, {
    now,
    query: SITE_SEARCH_PLACEHOLDER,
  });
  assert.ok(ranked.length > 0, '홈 placeholder 질의는 현재 정본에서 결과를 찾아야 합니다.');
  assert.ok(
    ranked.every(result => result.matchReasons.length > 0),
    '홈 placeholder 질의 결과는 실제 일치 근거를 가져야 합니다.',
  );
});

test('통합검색은 placeholder만 유지하고 결과처럼 보이는 예시 버튼을 렌더하지 않는다', async () => {
  const searchSource = await readFile(
    path.join(appRoot, 'src', 'components', 'site-search.tsx'),
    'utf8',
  );
  const searchStyles = await readFile(
    path.join(appRoot, 'src', 'components', 'site-search.module.css'),
    'utf8',
  );

  assert.match(
    searchSource,
    /placeholder=\{`예: \$\{SITE_SEARCH_PLACEHOLDER\}`\}/u,
  );
  assert.doesNotMatch(
    searchSource,
    /aria-label="검색 예시"|searchExamples|SITE_SEARCH_EXAMPLES|updateQuery\(example\.query\)/u,
  );
  assert.doesNotMatch(searchStyles, /\.searchExamples/u);
});

test('무결과는 짧은 질의·정확 식별자·표현 또는 콘텐츠 결손으로 분류한다', () => {
  assert.equal(classifySiteSearchMiss('세 번'), 'insufficient_query');
  assert.equal(classifySiteSearchMiss('민법 제9999조'), 'unindexed_reference');
  assert.equal(
    classifySiteSearchMiss('집주인이 잠적했어요'),
    'possible_expression_or_coverage_gap',
  );
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
  assert.deepEqual(tokenizeSiteSearchQuery('빚이')[0].slice(0, 2), ['빚이', '빚']);

  const fixture = [
    searchDocument('heir', 'knowledge', '2026-07-20', '법정상속인 순위'),
    searchDocument('tax', 'knowledge', '2026-07-20', '상속세 신고'),
    searchDocument('seizure', 'knowledge', '2026-07-20', '급여 압류'),
    searchDocument('corporation', 'knowledge', '2026-07-20', '법인 설립 안내'),
    searchDocument('debt', 'knowledge', '2026-07-20', '상속 채무 확인'),
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
  assert.deepEqual(
    rankSiteSearchDocuments(fixture, {now, query: '법이'})
      .map(result => result.id),
    [],
    '한 글자 조사 제거 stem은 다른 단어의 부분문자열을 열지 않습니다.',
  );
  assert.deepEqual(
    rankSiteSearchDocuments(fixture, {now, query: '빚이'})
      .map(result => result.id),
    ['debt'],
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
    result.semanticFacets?.includes('@domain:online-commerce')
    && result.semanticFacets?.includes('@remedy:refund-return')
    && result.matchReasons.length > 0
  )));
});

test('역할·행동·부정·구제수단을 정본 의미 필드에서 일반화해 찾는다', () => {
  const stalking = rankSiteSearchDocuments(documents, {
    now,
    query: '스토킹 접근금지 받고 싶어요',
  });
  assert.equal(
    stalking[0]?.id,
    'content.domestic-violence-stalking-stalking-emergency',
  );
  assert.ok(stalking[0]?.matchReasons.length > 0);

  const onlineRefund = rankSiteSearchDocuments(documents, {
    now,
    query: '온라인 쇼핑 환불 거부',
  });
  assert.equal(
    onlineRefund[0]?.id,
    'content.online-withdrawal-seven-days-vs-defect-deadline',
  );
  assert.match(searchableText(onlineRefund[0]), /온라인|구매/u);
  assert.match(searchableText(onlineRefund[0]), /거절|거부/u);
  assert.ok(onlineRefund[0].matchReasons.length > 0);

  const unpaidWage = rankSiteSearchDocuments(documents, {
    now,
    query: '월급을 못 받았어요',
  });
  assert.ok(unpaidWage.length > 0);
  assert.notEqual(
    unpaidWage[0]?.id,
    'content.dismissal-notice-pay-is-not-dismissal-validity',
  );
  assert.ok(unpaidWage.every(result => (
    result.semanticFacets?.includes('@subject:wage')
    && result.semanticFacets?.includes('@state:nonpayment')
  )));
  assert.ok(unpaidWage[0].matchReasons.length > 0);
});

test('피동형 역할은 문서의 주된 독자 역할과 일치할 때만 열고 콘텐츠 공백은 닫는다', () => {
  assert.deepEqual(
    rankSiteSearchDocuments(documents, {now, query: '고소당했는데'}),
    [],
    '피고소인용 글이 없으면 피해자용 고소 글을 대신 내보내지 않습니다.',
  );

  const accused = {
    ...searchDocument(
      'accused',
      'knowledge',
      '2026-07-20',
      '피고소인이 수사 연락을 받았을 때 확인할 절차',
    ),
    fields: {
      ...searchDocument('accused', 'knowledge', '2026-07-20', '피고소인 안내').fields,
      audience: ['고소를 당해 피의자 조사 연락을 받은 사람'],
    },
  };
  const victim = {
    ...searchDocument(
      'victim',
      'knowledge',
      '2026-07-20',
      '피해자가 고소를 취소하려면',
    ),
    fields: {
      ...searchDocument('victim', 'knowledge', '2026-07-20', '피해자 안내').fields,
      audience: ['고소인인 피해자가 처벌 의사를 바꾸려는 경우'],
    },
  };
  assert.deepEqual(
    rankSiteSearchDocuments([victim, accused], {
      now,
      query: '고소당했는데',
    }).map(result => result.id),
    ['accused'],
  );
  assert.deepEqual(
    rankSiteSearchDocuments([victim, accused], {
      now,
      query: '고소를 취소하고 싶어요',
    }).map(result => result.id),
    ['victim'],
  );
});

test('부정 수령 표현은 임금 미지급일 때만 결박하고 정상 수령 질의를 오염시키지 않는다', () => {
  const unpaidTokens = tokenizeSiteSearchQuery('월급을 못 받았어요');
  assert.ok(unpaidTokens.some(group => group.includes('@subject:wage')));
  assert.ok(unpaidTokens.some(group => group.includes('@state:nonpayment')));

  const benefitTokens = tokenizeSiteSearchQuery('산재 요양급여를 받을 수 있나요');
  assert.ok(!benefitTokens.flat().includes('@subject:wage'));
  assert.ok(!benefitTokens.flat().includes('@state:nonpayment'));
  const benefits = rankSiteSearchDocuments(documents, {
    now,
    query: '산재 요양급여를 받을 수 있나요',
  });
  assert.ok(benefits.length > 0);
  assert.match(searchableText(benefits[0]), /산재|요양급여|보험급여/u);
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
