import type {PublicKnowledgeEntry} from '@/types/publication';

export type KnowledgeHubJourneyStage = {
  key: 'problem' | 'judgment' | 'evidence' | 'action';
  label_ko: string;
  items_ko: string[];
};

export type KnowledgeHubJourney = {
  content_id: string;
  slug: string;
  title_ko: string;
  content_type: PublicKnowledgeEntry['content_type'];
  reviewed_at: string;
  source_count: number;
  stages: KnowledgeHubJourneyStage[];
};

export function buildKnowledgeHubJourneys(
  entries: readonly PublicKnowledgeEntry[],
): KnowledgeHubJourney[] {
  return entries.map(entry => ({
    content_id: entry.content_id,
    slug: entry.slug,
    title_ko: entry.title_ko,
    content_type: entry.content_type,
    reviewed_at: entry.reviewed_at,
    source_count: entry.source_coordinate_ids.length,
    stages: [
      stage('problem', '내 상황', [entry.audience_situation_ko]),
      stage('judgment', '핵심 판단', [entry.one_line_answer_ko]),
      stage('evidence', '확인할 사실·자료', entry.facts_to_check_ko),
      stage('action', '다음 행동', entry.action_steps_ko),
    ].filter((value): value is KnowledgeHubJourneyStage => Boolean(value)),
  }));
}

function stage(
  key: KnowledgeHubJourneyStage['key'],
  label_ko: string,
  items: readonly string[],
): KnowledgeHubJourneyStage | null {
  const items_ko = [...new Set(items.map(item => item.trim()).filter(Boolean))];
  return items_ko.length ? {key, label_ko, items_ko} : null;
}
