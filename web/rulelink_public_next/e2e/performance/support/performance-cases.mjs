export const performanceWidths = [390, 1440];

export function resolvePerformanceCases(bundle) {
  const knowledge = bundle.knowledge;
  const hubs = knowledge.topic_hubs;
  const entries = knowledge.content_entries;
  const changes = bundle.change_briefs;
  const contentById = new Map(entries.map(entry => [entry.content_id, entry]));

  const hub = selectRichest(hubs, item => item.content_ids.length);
  const hubEntries = hub.content_ids
    .map(contentId => contentById.get(contentId))
    .filter(Boolean);
  const representativeKnowledge = selectRichest(
    hubEntries.length > 0 ? hubEntries : entries,
    entry => (
      (entry.body_sections?.length ?? 0)
      + (entry.rule_ids?.length ?? 0)
      + (entry.scenario_ids?.length ?? 0)
      + (entry.related_edges?.length ?? 0)
      + (entry.related_content_ids?.length ?? 0)
    ),
  );
  const authorityZero = entries.find(
    entry => !entry.authority_binding_ids?.length,
  );
  const change = selectRichest(
    changes,
    item => (
      (item.changed_points?.length ?? 0)
      + (item.action_checklist?.length ?? 0)
      + (item.related_content_ids?.length ?? 0)
    ),
  );
  const query = representativeKnowledge.search_intents_ko?.[0]
    ?? representativeKnowledge.audience_situation_ko
    ?? representativeKnowledge.title_ko;

  return {
    query,
    routes: [
      {id: 'home', route: '/', state: 'ready'},
      {id: 'search-initial', route: '/ko/search', state: 'idle'},
      {id: 'search-query', route: '/ko/search', state: 'ready'},
      {id: 'hub', route: `/ko/hubs/${hub.slug}`, state: 'ready'},
      {
        id: 'knowledge',
        route: `/ko/knowledge/${representativeKnowledge.slug}`,
        state: 'ready',
      },
      {
        id: 'change-detail',
        route: `/ko/changes/${change.slug}`,
        state: 'ready',
      },
      {
        id: 'authority-zero',
        route: `/ko/knowledge/${authorityZero.slug}`,
        state: 'zero',
      },
    ],
  };
}

export function expectedPerformanceCases(bundle) {
  return resolvePerformanceCases(bundle).routes.flatMap(item => (
    performanceWidths.map(width => ({...item, width}))
  ));
}

export function performanceCaseKey(item) {
  return [
    item.id,
    item.state,
    item.width,
    item.route,
  ].join('|');
}

function selectRichest(items, score) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('성능 표본을 고를 공개 데이터가 없습니다.');
  }
  return items.reduce((selected, item) => (
    score(item) > score(selected) ? item : selected
  ));
}
