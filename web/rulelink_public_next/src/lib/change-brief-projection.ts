import {browserOfficialSourceUrl} from './official-source-url.ts';

import type {
  LegalChangeBrief,
  PublicKnowledgeEntry,
  PublicKnowledgeSource,
  SourceAssertion,
  SourceCoordinate,
} from '../types/publication.ts';

export type ChangeBriefReadingLink = {
  content_id: string;
  slug: string;
  title_ko: string;
  one_line_answer_ko: string;
  basis: 'explicit_related_content' | 'shared_source_snapshot';
};

export type ChangeBriefOfficialSource = {
  assertion_id: string;
  user_facing_text_ko: string;
  source_snapshot_id: string;
  article_no?: string;
  effective_from?: string;
  version_scope?: SourceCoordinate['version_scope'];
  url: string;
};

export type ChangeBriefProjection = {
  status: 'future_effective' | 'currently_effective';
  status_label_ko: string;
  status_context_ko: string;
  old_frame_label_ko: string;
  new_frame_label_ko: string;
  lifecycle_consistent: boolean;
  related_readings: ChangeBriefReadingLink[];
  official_sources: ChangeBriefOfficialSource[];
};

type ProjectionInput = {
  brief: LegalChangeBrief;
  assertions: SourceAssertion[];
  entries: PublicKnowledgeEntry[];
  sources: PublicKnowledgeSource[];
  asOf: string;
  relatedLimit?: number;
};

function timestamp(value: string): number {
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00+09:00` : value);
  if (!Number.isFinite(parsed)) throw new Error(`유효하지 않은 법령변화 기준시각입니다: ${value}`);
  return parsed;
}

function snapshotsForEntry(entry: PublicKnowledgeEntry, sourceByCoordinate: Map<string, PublicKnowledgeSource>): Set<string> {
  return new Set(entry.source_coordinate_ids
    .map(coordinateId => sourceByCoordinate.get(coordinateId)?.source_snapshot_id)
    .filter((value): value is string => Boolean(value)));
}

function projectRelatedReadings(
  brief: LegalChangeBrief,
  assertions: SourceAssertion[],
  entries: PublicKnowledgeEntry[],
  sources: PublicKnowledgeSource[],
  limit: number,
): ChangeBriefReadingLink[] {
  const entryById = new Map(entries.map(entry => [entry.content_id, entry]));
  const explicitIds = brief.related_content_ids ?? [];
  if (explicitIds.length) {
    return explicitIds
      .map(contentId => entryById.get(contentId))
      .filter((entry): entry is PublicKnowledgeEntry => Boolean(entry))
      .slice(0, limit)
      .map(entry => ({
        content_id: entry.content_id,
        slug: entry.slug,
        title_ko: entry.title_ko,
        one_line_answer_ko: entry.one_line_answer_ko,
        basis: 'explicit_related_content',
      }));
  }

  const assertionSnapshots = new Set(assertions.flatMap(assertion => assertion.source_coordinates
    .map(source => source.source_snapshot_id)
    .filter((value): value is string => Boolean(value))));
  const sourceByCoordinate = new Map(sources.map(source => [source.coordinate_id, source]));

  return entries
    .map(entry => ({
      entry,
      overlap: [...snapshotsForEntry(entry, sourceByCoordinate)]
        .filter(snapshotId => assertionSnapshots.has(snapshotId)).length,
    }))
    .filter(candidate => candidate.overlap > 0)
    .sort((left, right) => (
      right.overlap - left.overlap ||
      left.entry.content_id.localeCompare(right.entry.content_id, 'en')
    ))
    .slice(0, limit)
    .map(({entry}) => ({
      content_id: entry.content_id,
      slug: entry.slug,
      title_ko: entry.title_ko,
      one_line_answer_ko: entry.one_line_answer_ko,
      basis: 'shared_source_snapshot',
    }));
}

function projectOfficialSources(brief: LegalChangeBrief, assertions: SourceAssertion[]): ChangeBriefOfficialSource[] {
  const seen = new Set<string>();
  const result: ChangeBriefOfficialSource[] = [];
  for (const assertion of assertions) {
    for (const source of assertion.source_coordinates) {
      if (source.validation_status !== 'verified') continue;
      const url = browserOfficialSourceUrl(source, brief.law_name_ko);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      result.push({
        assertion_id: assertion.assertion_id,
        user_facing_text_ko: assertion.user_facing_text_ko,
        source_snapshot_id: source.source_snapshot_id ?? '',
        article_no: source.article_no,
        effective_from: source.effective_from,
        version_scope: source.version_scope,
        url,
      });
    }
  }
  return result;
}

export function projectChangeBrief(input: ProjectionInput): ChangeBriefProjection {
  const effective = timestamp(input.brief.effective_date);
  const asOf = timestamp(input.asOf);
  const future = effective > asOf;
  const status = future ? 'future_effective' : 'currently_effective';
  return {
    status,
    status_label_ko: future ? '시행 예정' : '현재 시행 중',
    status_context_ko: future
      ? `${input.brief.effective_date}부터 새 규정이 적용됩니다. 그 전까지는 현재 규정을 함께 확인하세요.`
      : `${input.brief.effective_date}부터 새 규정이 시행되고 있습니다. 사건 시점이 그보다 앞서면 종전 규정 적용 여부를 확인하세요.`,
    old_frame_label_ko: future ? '현재 시행 규정' : '종전 규정',
    new_frame_label_ko: future ? '시행 예정 규정' : '현재 시행 규정',
    lifecycle_consistent: future
      ? input.brief.lifecycle === 'future_effective'
      : input.brief.lifecycle !== 'future_effective',
    related_readings: projectRelatedReadings(
      input.brief,
      input.assertions,
      input.entries,
      input.sources,
      input.relatedLimit ?? 6,
    ),
    official_sources: projectOfficialSources(input.brief, input.assertions),
  };
}
