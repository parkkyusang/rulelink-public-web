import type {SiteSearchDocument, SiteSearchResultKind} from './site-search-discovery';

export const SITE_SEARCH_INDEX_SCHEMA = 'rulelink_public_search_index_v2' as const;

const SITE_SEARCH_KIND_CODES = {
  issue: 0,
  knowledge: 1,
  change: 2,
} as const satisfies Record<SiteSearchResultKind, number>;

const SITE_SEARCH_KINDS = ['issue', 'knowledge', 'change'] as const;

type CompactSiteSearchDocument = [
  id: number,
  kind: number,
  href: number,
  title: number,
  summary: number,
  context: number,
  reviewedAt: number,
  expiresAt: number,
  evidenceLabels: number[],
  decisionIds: number[],
  searchIntent: number[],
  audience: number[],
  decision: number[],
  detail: number[],
];

export type SiteSearchIndexPayload = {
  schema: typeof SITE_SEARCH_INDEX_SCHEMA;
  generated_at: string;
  strings: string[];
  documents: CompactSiteSearchDocument[];
};

export function projectLegacySiteSearchDocuments(
  documents: readonly SiteSearchDocument[],
): SiteSearchDocument[] {
  return documents.map(({decisionIds: _decisionIds, ...document}) => {
    const {decision: _decision, ...fields} = document.fields;
    return {...document, fields};
  });
}

type DecodedSiteSearchIndex = {
  generatedAt: string;
  documents: SiteSearchDocument[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIndex(value: unknown, strings: readonly string[]): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < strings.length;
}

function decodeIndexes(value: unknown, strings: readonly string[]): string[] | null {
  if (!Array.isArray(value) || !value.every(index => isIndex(index, strings))) return null;
  return value.map(index => strings[index]!);
}

export function encodeSiteSearchIndex(
  documents: readonly SiteSearchDocument[],
  generatedAt: string,
): SiteSearchIndexPayload {
  const strings: string[] = [];
  const indexes = new Map<string, number>();
  const intern = (value: string) => {
    const existing = indexes.get(value);
    if (existing !== undefined) return existing;
    const index = strings.length;
    strings.push(value);
    indexes.set(value, index);
    return index;
  };
  const internAll = (values: readonly string[]) => values.map(intern);

  return {
    schema: SITE_SEARCH_INDEX_SCHEMA,
    generated_at: generatedAt,
    strings,
    documents: documents.map(document => [
      intern(document.id),
      SITE_SEARCH_KIND_CODES[document.kind],
      intern(document.href),
      intern(document.title),
      intern(document.summary),
      intern(document.context),
      intern(document.reviewedAt),
      intern(document.expiresAt),
      internAll(document.evidenceLabels),
      internAll(document.decisionIds ?? []),
      internAll(document.fields.searchIntent),
      internAll(document.fields.audience),
      internAll(document.fields.decision ?? []),
      internAll(document.fields.detail),
    ]),
  };
}

export function decodeSiteSearchIndex(payload: unknown): DecodedSiteSearchIndex | null {
  if (
    !isRecord(payload)
    || payload.schema !== SITE_SEARCH_INDEX_SCHEMA
    || typeof payload.generated_at !== 'string'
    || !Array.isArray(payload.strings)
    || !payload.strings.every(value => typeof value === 'string')
    || !Array.isArray(payload.documents)
  ) {
    return null;
  }

  const strings = payload.strings;
  const documents: SiteSearchDocument[] = [];
  for (const value of payload.documents) {
    if (
      !Array.isArray(value)
      || value.length !== 14
      || !value.slice(0, 8).every((index, position) => (
        position === 1
          ? Number.isInteger(index) && Number(index) >= 0 && Number(index) < SITE_SEARCH_KINDS.length
          : isIndex(index, strings)
      ))
    ) {
      return null;
    }
    const evidenceLabels = decodeIndexes(value[8], strings);
    const decisionIds = decodeIndexes(value[9], strings);
    const searchIntent = decodeIndexes(value[10], strings);
    const audience = decodeIndexes(value[11], strings);
    const decision = decodeIndexes(value[12], strings);
    const detail = decodeIndexes(value[13], strings);
    if (
      !evidenceLabels
      || !decisionIds
      || !searchIntent
      || !audience
      || !decision
      || !detail
      || decisionIds.length !== decision.length
    ) {
      return null;
    }

    const kind = SITE_SEARCH_KINDS[value[1] as number];
    if (!kind) return null;
    documents.push({
      id: strings[value[0] as number]!,
      kind,
      href: strings[value[2] as number]!,
      title: strings[value[3] as number]!,
      summary: strings[value[4] as number]!,
      context: strings[value[5] as number]!,
      reviewedAt: strings[value[6] as number]!,
      expiresAt: strings[value[7] as number]!,
      evidenceLabels,
      ...(decisionIds.length ? {decisionIds} : {}),
      fields: {
        searchIntent,
        audience,
        ...(decision.length ? {decision} : {}),
        detail,
      },
    });
  }

  return {
    generatedAt: payload.generated_at,
    documents,
  };
}
