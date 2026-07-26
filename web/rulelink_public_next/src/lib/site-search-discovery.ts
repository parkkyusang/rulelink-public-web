import {
  isPublicationFresh,
  publicationNow,
} from './publication-freshness.ts';

import type {PublicKnowledgeSearchDocument} from './knowledge-search';
import type {
  LegalChangeBrief,
  LegalIssueCard,
  PublicTopic,
} from '@/types/publication';

export type SiteSearchResultKind = 'issue' | 'knowledge' | 'change';
export type SiteSearchResultFilter = 'all' | SiteSearchResultKind;
export type SiteSearchMatchField =
  | 'title'
  | 'search_intent'
  | 'audience'
  | 'decision'
  | 'summary'
  | 'source'
  | 'detail';

export type SiteSearchMatchReason = {
  field: SiteSearchMatchField;
  label_ko: string;
  text_ko: string;
};

export type SiteSearchDocument = {
  id: string;
  kind: SiteSearchResultKind;
  href: string;
  title: string;
  summary: string;
  context: string;
  reviewedAt: string;
  expiresAt: string;
  evidenceLabels: string[];
  decisionIds?: string[];
  fields: {
    searchIntent: string[];
    audience: string[];
    decision?: string[];
    detail: string[];
  };
};

type SiteSearchScoringFields = {
  title: string[];
  searchIntent: string[];
  audience: string[];
  decision: string[];
  summary: string[];
  source: string[];
  detail: string[];
};

export type RankedSiteSearchResult = SiteSearchDocument & {
  decisionQuestion?: string;
  decisionScenarioId?: string;
  score: number;
  matchReasons: SiteSearchMatchReason[];
  freshnessState: 'current' | 'review_due';
};

export type SiteSearchResultCounts = Record<
  'all' | SiteSearchResultKind,
  number
>;

export type SiteSearchMissReason =
  | 'insufficient_query'
  | 'unindexed_reference'
  | 'possible_expression_or_coverage_gap';

export const SITE_SEARCH_PLACEHOLDER = '집주인이 보증금을 돌려주지 않아요';

type Labels = {
  changeLifecycle: (value: LegalChangeBrief['lifecycle']) => string;
  knowledgeContentType: (
    value: PublicKnowledgeSearchDocument['entry']['content_type'],
  ) => string;
};

type RankOptions = {
  filter?: SiteSearchResultFilter;
  now?: Date;
  query: string;
};

const FIELD_META: Record<
  keyof SiteSearchScoringFields,
  {field: SiteSearchMatchField; label: string; tokenWeight: number}
> = {
  title: {field: 'title', label: '제목', tokenWeight: 28},
  searchIntent: {
    field: 'search_intent',
    label: '찾는 상황',
    tokenWeight: 24,
  },
  audience: {field: 'audience', label: '대상 상황', tokenWeight: 18},
  decision: {field: 'decision', label: '판단 질문', tokenWeight: 20},
  summary: {field: 'summary', label: '핵심 답', tokenWeight: 14},
  source: {field: 'source', label: '공식 근거', tokenWeight: 11},
  detail: {field: 'detail', label: '확인 항목', tokenWeight: 4},
};

const PHRASE_WEIGHTS: Record<keyof SiteSearchScoringFields, number> = {
  title: 72,
  searchIntent: 62,
  audience: 46,
  decision: 52,
  summary: 34,
  source: 28,
  detail: 8,
};

const KOREAN_PARTICLES = [
  '으로부터',
  '에게서는',
  '에게서',
  '에서는',
  '으로는',
  '에게',
  '한테',
  '에서',
  '으로',
  '이랑',
  '로는',
  '와는',
  '과는',
  '은',
  '는',
  '이',
  '가',
  '을',
  '를',
  '의',
  '에',
  '도',
  '만',
  '와',
  '과',
  '랑',
  '로',
] as const;

const OPTIONAL_CONVERSATIONAL_TOKENS = new Set([
  '세',
  '번',
  '제가',
  '저는',
  '나는',
  '어떻게',
  '어떡해요',
  '어떡하죠',
  '해야',
  '하나요',
  '해요',
  '되나요',
  '될까요',
  '싶어요',
  '싶습니다',
  '궁금해요',
  '뭘',
  '무엇을',
  '수',
  '있나요',
  '갑자기',
  '때문에',
  '계속',
  '자꾸',
  '전',
  '왔어요',
  '안되고',
  '연락도',
  '더',
  '좀',
]);
const CONTEXTUAL_NEGATION_TOKENS = new Set(['안', '미', '못', '않']);
const NEGATION_ACTION_CONTEXT = new Set([
  '줘요',
  '지급',
  '주지',
  '돌려주지',
  '돌려받기',
  '환급',
  '반환',
  '회수',
]);
const DEBT_CONTEXT = new Set(['빚', '채무', '부채']);

const CONVERSATIONAL_EQUIVALENCE_GROUPS = [
  ['계속', '지속', '반복'],
  ['집주인', '임대인'],
  ['보증금', '전세금', '임대차보증금'],
  ['사장님', '사용자', '사업주', '회사'],
  ['상사', '상급자', '직속 상급자', '관리자'],
  ['월급', '임금', '급여'],
  ['퇴직금', '퇴직급여'],
  ['줘요', '지급', '주지', '돌려주지'],
  ['돌려줘', '돌려주', '돌려받', '반환', '환급', '회수'],
  ['잘렸', '잘리', '해고', '근로관계 종료'],
  ['괴롭혀', '괴롭힘', '직장 내 괴롭힘'],
  ['나누', '재산분할', '분할'],
  ['당했어요', '피해', '당한', '발생'],
  ['사기당', '사기 피해', '기망'],
  ['인터넷', '온라인', '전자상거래'],
  ['돈', '피해금', '금전'],
  ['돌려받기', '환급', '반환', '회수', '피해구제'],
  ['남편', '배우자', '연인', '애인'],
  ['때려', '폭행', '가정폭력', '신체폭력'],
  ['부모님', '부모', '피상속인'],
  ['돌아가시', '사망', '상속개시'],
  ['났는데', '났', '사고', '발생'],
  ['상대방', '가해자', '상대차량', '운전자'],
  ['내고', '사고', '발생', '야기'],
  ['당해', '당한', '피해', '피해자', '발생'],
  ['환불받', '환불', '환급', '반환', '회수'],
  ['젖었', '누수', '침수', '물 피해'],
  ['아이', '학생', '자녀', '미성년자'],
  ['연락해요', '연락', '접촉', '찾아오'],
  ['맞았어요', '폭행', '학교폭력'],
  ['맞고', '폭행', '학교폭력'],
  ['밀렸어요', '연체', '밀리', '누적'],
  ['빚', '채무', '부채'],
  ['도망', '도주', '뺑소니'],
  ['보냈', '송금', '이체'],
  ['빌려', '대여', '대여금'],
  ['냈', '지급', '지불', '납부'],
  ['샀는데', '샀', '매수', '매매', '구입'],
  ['발견됐', '발견', '확인'],
  ['취소', '해제', '철회'],
  ['준비', '서류', '자료', '증빙'],
  ['억울', '부당', '위법', '불복'],
  ['갚', '변제', '상환', '미변제'],
  ['잠', '수면', '수면 방해'],
  ['못자', '수면 방해', '수면'],
  ['다투', '불복', '행정심판'],
] as const;

const CONVERSATIONAL_EQUIVALENCES = new Map<string, string[]>();
for (const group of CONVERSATIONAL_EQUIVALENCE_GROUPS) {
  for (const term of group) {
    CONVERSATIONAL_EQUIVALENCES.set(
      term,
      group.filter(candidate => candidate !== term),
    );
  }
}

export function buildSiteSearchDocuments(
  cards: readonly LegalIssueCard[],
  changeBriefs: readonly LegalChangeBrief[],
  knowledgeDocuments: readonly PublicKnowledgeSearchDocument[],
  topics: readonly PublicTopic[],
  labels: Labels,
  knowledgeDecisionQuestions: ReadonlyMap<string, readonly {
    question: string;
    scenarioId: string;
  }[]> = new Map(),
): SiteSearchDocument[] {
  const topicByCardId = new Map<string, PublicTopic[]>();
  for (const topic of topics) {
    for (const cardId of topic.issue_card_ids) {
      topicByCardId.set(cardId, [
        ...(topicByCardId.get(cardId) ?? []),
        topic,
      ]);
    }
  }

  return [
    ...cards.map(card => {
      const cardTopics = topicByCardId.get(card.issue_card_id) ?? [];
      return siteSearchDocument({
        id: card.issue_card_id,
        kind: 'issue',
        href: `/ko/issues/${card.slug}`,
        title: card.title_ko,
        summary: card.audience_situation_ko,
        context:
          cardTopics.map(topic => topic.title_ko).join(' · ') || '생활법률',
        reviewedAt: card.reviewed_at,
        expiresAt: card.expires_at,
        audience: [card.audience_situation_ko],
        detail: [
          ...card.entry_signals,
          ...card.urgency_signals,
          ...card.branch_questions,
          ...card.evidence_checklist,
          ...card.action_paths,
          ...card.escalation_rules,
          ...cardTopics.flatMap(topic => [
            topic.title_ko,
            topic.description_ko,
            ...topic.search_terms_ko,
          ]),
        ],
      });
    }),
    ...knowledgeDocuments.map(document => {
      const entry = document.entry;
      const contentType = labels.knowledgeContentType(entry.content_type);
      return siteSearchDocument({
        id: entry.content_id,
        kind: 'knowledge',
        href: `/ko/knowledge/${entry.slug}`,
        title: entry.title_ko,
        summary: entry.one_line_answer_ko,
        context: `${contentType} · ${entry.audience_situation_ko}`,
        reviewedAt: entry.reviewed_at,
        expiresAt: entry.expires_at,
        evidenceLabels: document.evidence_labels_ko,
        searchIntent: entry.search_intents_ko,
        audience: [entry.audience_situation_ko],
        decisionTargets: [...(knowledgeDecisionQuestions.get(entry.content_id) ?? [])],
        detail: [contentType, ...document.search_terms_ko],
      });
    }),
    ...changeBriefs.map(brief => {
      const source = `${brief.law_name_ko} ${brief.article_no}`;
      return siteSearchDocument({
        id: brief.change_brief_id,
        kind: 'change',
        href: `/ko/changes/${brief.slug}`,
        title: brief.title_ko,
        summary: brief.summary_ko,
        context: `${labels.changeLifecycle(brief.lifecycle)} · ${source}`,
        reviewedAt: brief.reviewed_at,
        expiresAt: brief.expires_at,
        evidenceLabels: [source],
        audience: brief.affected_audiences,
        detail: [
          ...brief.changed_points,
          ...brief.action_checklist,
          brief.transition_note_ko,
        ],
      });
    }),
  ];
}

export function rankSiteSearchDocuments(
  documents: readonly SiteSearchDocument[],
  {
    filter = 'all',
    now = publicationNow(),
    query,
  }: RankOptions,
): RankedSiteSearchResult[] {
  const normalizedQuery = normalizeSiteSearchText(query);
  const queryTokens = tokenizeSiteSearchQuery(query);
  const hasQuery = query.trim().length > 0;
  if (hasQuery && queryTokens.length === 0) return [];

  return documents
    .filter(document => filter === 'all' || document.kind === filter)
    .map(document => scoreDocument(
      document,
      normalizedQuery,
      queryTokens,
      now,
    ))
    .filter((result): result is RankedSiteSearchResult => Boolean(result))
    .sort((left, right) => (
      right.score - left.score
      || right.reviewedAt.localeCompare(left.reviewedAt)
      || left.title.localeCompare(right.title, 'ko')
      || left.id.localeCompare(right.id)
    ));
}

export function countSiteSearchDocuments(
  documents: readonly SiteSearchDocument[],
): SiteSearchResultCounts {
  return {
    all: documents.length,
    issue: documents.filter(document => document.kind === 'issue').length,
    knowledge: documents.filter(
      document => document.kind === 'knowledge',
    ).length,
    change: documents.filter(document => document.kind === 'change').length,
  };
}

export function normalizeSiteSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function tokenizeSiteSearchQuery(value: string): string[][] {
  const baseTokens = normalizeSiteSearchText(value)
    .split(' ')
    .filter(Boolean)
    .filter(token => !isOptionalConversationalToken(token))
    .map(token => {
      const stripped = stripKoreanParticle(token);
      return stripped === token ? [token] : [token, stripped];
    });
  const context = new Set(baseTokens.flat());

  return baseTokens
    .map(bases => [...new Set(bases.flatMap(base => (
      contextualQueryVariants(base, context)
    )))])
    .filter(variants => variants.length > 0);
}

export function classifySiteSearchMiss(query: string): SiteSearchMissReason {
  const normalized = normalizeSiteSearchText(query);
  const tokens = tokenizeSiteSearchQuery(query);
  if (!normalized || tokens.length === 0) return 'insufficient_query';
  if (
    /(?:제\s*)?\d{1,4}조(?:의\d{1,3})?/u.test(normalized)
    || /\d{2,4}[가-힣]{1,4}\d{2,}/u.test(normalized)
  ) {
    return 'unindexed_reference';
  }
  return 'possible_expression_or_coverage_gap';
}

function siteSearchDocument(value: {
  id: string;
  kind: SiteSearchResultKind;
  href: string;
  title: string;
  summary: string;
  context: string;
  reviewedAt: string;
  expiresAt: string;
  evidenceLabels?: string[];
  searchIntent?: string[];
  audience?: string[];
  decision?: string[];
  decisionTargets?: Array<{
    question: string;
    scenarioId: string;
  }>;
  detail?: string[];
}): SiteSearchDocument {
  const decisionTargets = value.decisionTargets ?? [];
  const decision = uniqueNonEmpty([
    ...(value.decision ?? []),
    ...decisionTargets.map(target => target.question),
  ]);
  return {
    id: value.id,
    kind: value.kind,
    href: value.href,
    title: value.title,
    summary: value.summary,
    context: value.context,
    reviewedAt: value.reviewedAt,
    expiresAt: value.expiresAt,
    evidenceLabels: uniqueNonEmpty(value.evidenceLabels ?? []),
    ...(decisionTargets.length ? {
      decisionIds: decisionTargets.map(target => target.scenarioId),
    } : {}),
    fields: {
      searchIntent: uniqueNonEmpty(value.searchIntent ?? []),
      audience: uniqueNonEmpty(value.audience ?? []),
      ...(decision.length ? {
        decision,
      } : {}),
      detail: uniqueNonEmpty(value.detail ?? []),
    },
  };
}

function scoreDocument(
  document: SiteSearchDocument,
  normalizedQuery: string,
  queryTokens: string[][],
  now: Date,
): RankedSiteSearchResult | null {
  const scoringFields = siteSearchScoringFields(document);
  const normalizedFields = mapNormalizedFields(scoringFields);
  const searchable = Object.values(normalizedFields).flat();
  const queryMatch = queryDocumentMatch(searchable, queryTokens);
  if (!queryMatch.accepted) {
    return null;
  }

  let score = queryMatch.matchedTokenCount * 36
    + queryMatch.matchedInformationWeight;
  if (normalizedQuery) {
    if (normalizedFields.title.some(value => value === normalizedQuery)) {
      score += 180;
    }
    if (
      normalizedFields.searchIntent.some(value => value === normalizedQuery)
    ) {
      score += 170;
    }
    for (const key of Object.keys(normalizedFields) as Array<
      keyof SiteSearchScoringFields
    >) {
      if (
        normalizedFields[key].some(value => value.includes(normalizedQuery))
      ) {
        score += PHRASE_WEIGHTS[key];
      }
    }
    for (const variants of queryTokens) {
      for (const key of Object.keys(normalizedFields) as Array<
          keyof SiteSearchScoringFields
      >) {
        if (
          normalizedFields[key].some(value => (
            variants.some(variant => valueIncludesVariant(value, variant))
          ))
        ) {
          score += FIELD_META[key].tokenWeight;
        }
      }
    }
  }

  const decisionQuestion = bestMatchingValue(
    scoringFields.decision,
    normalizedQuery,
    queryTokens,
  ) ?? scoringFields.decision[0];
  const decisionScenarioId = decisionQuestion
    ? document.decisionIds?.[scoringFields.decision.indexOf(decisionQuestion)]
    : undefined;
  const matchReasons = buildMatchReasons(
    scoringFields,
    normalizedQuery,
    queryTokens,
    decisionQuestion,
  );
  if (queryTokens.length > 0 && matchReasons.length === 0) return null;

  return {
    ...document,
    ...(decisionQuestion ? {decisionQuestion} : {}),
    ...(decisionScenarioId ? {decisionScenarioId} : {}),
    score,
    matchReasons,
    freshnessState: isPublicationFresh(
      {expires_at: document.expiresAt},
      now,
    )
      ? 'current'
      : 'review_due',
  };
}

function bestMatchingValue(
  values: readonly string[],
  normalizedQuery: string,
  queryTokens: readonly string[][],
): string | undefined {
  if (!queryTokens.length) return values[0];
  const ranked = values
    .map((value, index) => {
      const metrics = matchValueMetrics(value, normalizedQuery, queryTokens);
      return {
        ...metrics,
        index,
        value,
      };
    })
    .filter(candidate => candidate.matches > 0)
    .sort((left, right) => (
      right.exactPhrase - left.exactPhrase
      || right.matches - left.matches
      || right.informationWeight - left.informationWeight
      || left.index - right.index
    ));
  return ranked[0]?.value;
}

function buildMatchReasons(
  fields: SiteSearchScoringFields,
  normalizedQuery: string,
  queryTokens: string[][],
  selectedDecision?: string,
): SiteSearchMatchReason[] {
  if (!queryTokens.length) return [];
  const candidates: Array<{
    exactPhrase: number;
    fieldIndex: number;
    informationWeight: number;
    matches: number;
    reason: SiteSearchMatchReason;
    valueIndex: number;
  }> = [];
  const seen = new Set<string>();

  const fieldKeys = Object.keys(fields) as Array<
    keyof SiteSearchScoringFields
  >;
  for (const [fieldIndex, key] of fieldKeys.entries()) {
    const meta = FIELD_META[key];
    const values = key === 'decision' && selectedDecision
      ? [selectedDecision]
      : fields[key];
    for (const [valueIndex, value] of values.entries()) {
      const metrics = matchValueMetrics(value, normalizedQuery, queryTokens);
      if (metrics.matches === 0) continue;
      const text = matchedExcerpt(value, queryTokens);
      const signature = `${meta.field}:${text}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      candidates.push({
        ...metrics,
        fieldIndex,
        reason: {
          field: meta.field,
          label_ko: meta.label,
          text_ko: text,
        },
        valueIndex,
      });
    }
  }
  return candidates
    .sort((left, right) => (
      right.exactPhrase - left.exactPhrase
      || right.matches - left.matches
      || right.informationWeight - left.informationWeight
      || left.fieldIndex - right.fieldIndex
      || left.valueIndex - right.valueIndex
    ))
    .slice(0, 3)
    .map(candidate => candidate.reason);
}

function matchValueMetrics(
  value: string,
  normalizedQuery: string,
  queryTokens: readonly string[][],
): {
  exactPhrase: number;
  informationWeight: number;
  matches: number;
} {
  const normalized = normalizeSiteSearchText(value);
  const matchedWeights = queryTokens
    .map(variants => Math.max(
      0,
      ...variants
        .filter(variant => valueIncludesVariant(normalized, variant))
        .map(variant => variant.length ** 2),
    ))
    .filter(weight => weight > 0);
  return {
    exactPhrase: normalized === normalizedQuery ? 2 : (
      normalizedQuery && normalized.includes(normalizedQuery) ? 1 : 0
    ),
    informationWeight: matchedWeights.reduce(
      (sum, weight) => sum + weight,
      0,
    ),
    matches: matchedWeights.length,
  };
}

function matchedExcerpt(value: string, queryTokens: string[][]): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  if (compact.length <= 120) return compact;
  const normalized = normalizeSiteSearchText(compact);
  const matched = queryTokens
    .flat()
    .map(token => ({index: normalized.indexOf(token), token}))
    .filter(match => match.index >= 0)
    .sort((left, right) => left.index - right.index)[0];
  if (!matched) return `${compact.slice(0, 117)}…`;
  const start = Math.max(0, matched.index - 38);
  const end = Math.min(compact.length, start + 112);
  return `${start > 0 ? '…' : ''}${compact.slice(start, end)}${
    end < compact.length ? '…' : ''
  }`;
}

function mapNormalizedFields(
  fields: SiteSearchScoringFields,
): Record<keyof SiteSearchScoringFields, string[]> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, values]) => [
      key,
      values.map(normalizeSiteSearchText),
    ]),
  ) as Record<keyof SiteSearchScoringFields, string[]>;
}

function siteSearchScoringFields(
  document: SiteSearchDocument,
): SiteSearchScoringFields {
  return {
    title: [document.title],
    searchIntent: document.fields.searchIntent,
    audience: document.fields.audience,
    decision: document.fields.decision ?? [],
    summary: [document.summary],
    source: document.evidenceLabels,
    detail: uniqueNonEmpty([document.context, ...document.fields.detail]),
  };
}

function stripKoreanParticle(token: string): string {
  if (token.length < 2) return token;
  for (const particle of KOREAN_PARTICLES) {
    if (!token.endsWith(particle)) continue;
    const stem = token.slice(0, -particle.length);
    if (stem.length >= 1) return stem;
  }
  return token;
}

function contextualQueryVariants(
  base: string,
  context: ReadonlySet<string>,
): string[] {
  if (
    CONTEXTUAL_NEGATION_TOKENS.has(base)
    || /^(?:안|미|못|않)(?:아|어|여|해)?(?:요|습니다|다)?$/u.test(base)
  ) {
    const hasActionContext = [...NEGATION_ACTION_CONTEXT].some(
      token => context.has(token),
    );
    return hasActionContext
      ? [base, '미지급', '지급하지', '주지', '돌려주지', '못', '않']
      : [];
  }
  if (/^많(?:아요|으면|은|다)?$/u.test(base)) {
    const hasDebtContext = [...context].some(token => (
      DEBT_CONTEXT.has(token)
      || /^(빚|채무|부채)(이|가|은|는|을|를)$/u.test(token)
    ));
    return hasDebtContext ? [base, '많', '초과'] : [base, '많'];
  }
  const inflectional = inflectionalQueryVariants(base);
  const compactNegation = inflectional.flatMap(value => {
    const match = value.match(/^(안|못)(.+)$/u);
    if (!match) return [];
    const predicate = match[2];
    const predicateEquivalents = equivalentQueryVariants(predicate);
    const hasPaymentContext = [...NEGATION_ACTION_CONTEXT].some(action => (
      predicate.startsWith(action)
      || action.startsWith(predicate)
      || context.has(action)
    ));
    return [
      predicate,
      ...predicateEquivalents,
      ...(hasPaymentContext ? [
        '미지급',
        '지급하지',
        '주지',
        '돌려주지',
        '받지 못',
      ] : []),
    ];
  });
  return [...new Set([
    ...inflectional,
    ...inflectional.flatMap(equivalentQueryVariants),
    ...compactNegation,
  ])];
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function isOptionalConversationalToken(token: string): boolean {
  if (OPTIONAL_CONVERSATIONAL_TOKENS.has(token)) return true;
  return /^(?:어떻게|어떡)(?:해|하|해야|하면|하면요|하나요|하죠|할까요)?$/u
    .test(token);
}

function inflectionalQueryVariants(base: string): string[] {
  const variants = new Set([base]);
  const suffixes = [
    '고싶습니다',
    '고싶어요',
    '으려면',
    '려면',
    '하려면',
    '해야',
    '하고',
    '했는데요',
    '았는데요',
    '었는데요',
    '했는데',
    '았는데',
    '었는데',
    '는데요',
    '은데요',
    '는데',
    '은데',
    '했습니다',
    '했어요',
    '됐어요',
    '였어요',
    '았어요',
    '었어요',
    '겠어요',
    '해요',
    '돼요',
    '나요',
    '죠',
    '어요',
    '아요',
    '습니다',
    '습니까',
    '으면',
  ] as const;
  for (const suffix of suffixes) {
    if (!base.endsWith(suffix)) continue;
    const stem = base.slice(0, -suffix.length);
    if (stem.length >= 2) variants.add(stem);
  }
  for (const variant of [...variants]) {
    if (variant.length >= 3 && /(?:받|당|하|되)$/u.test(variant)) {
      variants.add(variant.slice(0, -1));
    }
  }
  return [...variants];
}

function equivalentQueryVariants(base: string): string[] {
  const exact = CONVERSATIONAL_EQUIVALENCES.get(base);
  if (exact) return exact;
  if (base.length < 2) return [];
  for (const [term, equivalents] of CONVERSATIONAL_EQUIVALENCES) {
    if (term.length < 2) continue;
    if (base.startsWith(term)) {
      return [term, ...equivalents];
    }
  }
  return [];
}

function queryDocumentMatch(
  searchable: readonly string[],
  queryTokens: readonly string[][],
): {
  accepted: boolean;
  matchedInformationWeight: number;
  matchedTokenCount: number;
} {
  const matches = queryTokens.map(variants => {
    const matchingVariants = variants.filter(variant => (
      searchable.some(value => valueIncludesVariant(value, variant))
    ));
    return {
      informationWeight: Math.max(
        0,
        ...matchingVariants.map(variant => variant.length ** 2),
      ),
      matched: matchingVariants.length > 0,
      originalInformationLength: variants[0]?.length ?? 0,
      originalToken: variants[0] ?? '',
    };
  });
  const matched = matches.filter(match => match.matched);
  const strongestOriginalToken = Math.max(
    0,
    ...matched.map(match => match.originalInformationLength),
  );
  const matchedTokenCount = matched.length;
  return {
    accepted: queryTokens.length === 0 || (
      matchedTokenCount > 0
      && strongestOriginalToken >= 2
      && matches.every(match => match.matched)
    ),
    matchedInformationWeight: matched.reduce(
      (sum, match) => sum + match.informationWeight,
      0,
    ),
    matchedTokenCount,
  };
}

function valueIncludesVariant(value: string, variant: string): boolean {
  if (variant.length > 1) return value.includes(variant);
  return value.split(' ').includes(variant);
}
