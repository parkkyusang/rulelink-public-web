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

const OPTIONAL_CONVERSATIONAL_TOKENS = new Set(['세', '번']);
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
  ['사장님', '사용자', '사업주', '회사'],
  ['월급', '임금', '급여'],
  ['줘요', '지급', '주지', '돌려주지'],
  ['당했어요', '피해', '당한', '발생'],
  ['인터넷', '온라인', '전자상거래'],
  ['돈', '피해금', '금전'],
  ['돌려받기', '환급', '반환', '회수', '피해구제'],
  ['남편', '배우자', '연인'],
  ['연락해요', '연락', '접촉', '찾아오'],
  ['맞았어요', '폭행', '학교폭력'],
  ['밀렸어요', '연체', '밀리', '누적'],
  ['빚', '채무'],
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
    .filter(token => !OPTIONAL_CONVERSATIONAL_TOKENS.has(token))
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
  if (
    queryTokens.some(variants => (
      !variants.some(variant => searchable.some(value => value.includes(variant)))
    ))
  ) {
    return null;
  }

  let score = 0;
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
            variants.some(variant => value.includes(variant))
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
        .filter(variant => normalized.includes(variant))
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
  if (token.length < 3) return token;
  for (const particle of KOREAN_PARTICLES) {
    if (!token.endsWith(particle)) continue;
    const stem = token.slice(0, -particle.length);
    if (stem.length >= 2) return stem;
  }
  return token;
}

function contextualQueryVariants(
  base: string,
  context: ReadonlySet<string>,
): string[] {
  if (CONTEXTUAL_NEGATION_TOKENS.has(base)) {
    const hasActionContext = [...NEGATION_ACTION_CONTEXT].some(
      token => context.has(token),
    );
    return hasActionContext
      ? ['미지급', '지급하지', '주지', '돌려주지', '못', '않']
      : [];
  }
  if (base === '많아요') {
    const hasDebtContext = [...context].some(token => (
      DEBT_CONTEXT.has(token)
      || /^(빚|채무|부채)(이|가|은|는|을|를)$/u.test(token)
    ));
    return hasDebtContext ? ['많아요', '많', '초과'] : ['많아요'];
  }
  return [
    base,
    ...(CONVERSATIONAL_EQUIVALENCES.get(base) ?? []),
  ];
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
