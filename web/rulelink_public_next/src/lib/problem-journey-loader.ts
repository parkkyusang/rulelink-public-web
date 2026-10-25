import {problemJourneyDefinitions} from './problem-journey-definitions';
import {buildProblemJourney} from './problem-journey';
import {knowledgeDetail, listKnowledgeEntries} from './publication';
import {browserOfficialSourceUrl} from './official-source-url';
import {site} from './site';
import type {PublicKnowledgeEntry} from '@/types/publication';

export async function loadProblemJourney(hubId: string, entries: readonly PublicKnowledgeEntry[]) {
  const definition = problemJourneyDefinitions.find(item => item.hubId === hubId);
  if (!definition) return null;
  const available = await listKnowledgeEntries();
  const ids = new Set(definition.routes.flatMap(route => [...route.contentIds, ...(route.referenceContentIds ?? [])]));
  const details = Object.fromEntries(await Promise.all(available.filter(entry => ids.has(entry.content_id)).map(async entry => {
    const detail = await knowledgeDetail(entry);
    return [entry.content_id, {
      scenarios: detail.scenarios,
      sources: detail.sources.map(source => ({
        id: source.coordinate_id,
        title: source.source_kind === 'precedent' || source.source_kind === 'official_document'
          ? source.title_ko : `${source.law_name_ko} ${source.article_no}`,
        href: browserOfficialSourceUrl(source) ?? source.official_url,
        checkedAt: source.last_verified_at,
        // 기존의 버전·문언 검증을 통과한 공개 원문만 재사용합니다.
        text: detail.sourceTexts[source.coordinate_id]?.official_text_ko,
        effectiveDate: detail.sourceTexts[source.coordinate_id]?.effective_date,
        explanations: detail.rules.filter(rule => rule.source_coordinate_ids.includes(source.coordinate_id)).map(rule => ({
          title: rule.title_ko, text: `${rule.norm.conditions_ko} ${rule.norm.legal_effect_ko}`,
        })),
      })),
    }];
  })));
  // 주제의 직접 안내는 소속 주제 안에, 참고 읽기는 승인된 전체 공개 글 안에 있어야 합니다.
  const hubIds = new Set(entries.map(entry => entry.content_id));
  if (definition.routes.some(route => route.contentIds.some(id => !hubIds.has(id)))) throw new Error('주제에 속하지 않는 직접 안내입니다.');
  return {...buildProblemJourney(definition, available, details), origin: site.url};
}
