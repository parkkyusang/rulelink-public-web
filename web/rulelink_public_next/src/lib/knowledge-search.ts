import type {
  PublicKnowledgeEntry,
  PublicKnowledgeHub,
  PublicKnowledgeIndex,
  PublicKnowledgeSource,
  PublicRuleCard,
  PublicScenarioBranch,
} from '@/types/publication';

export type PublicKnowledgeSearchDocument = {
  entry: PublicKnowledgeEntry;
  search_terms_ko: string[];
  evidence_labels_ko: string[];
};

export type ResolvedKnowledgeEntryGraph = {
  scenarios: PublicScenarioBranch[];
  rules: PublicRuleCard[];
  sources: PublicKnowledgeSource[];
  hubs: PublicKnowledgeHub[];
};

export function resolveKnowledgeEntryGraph(
  knowledge: PublicKnowledgeIndex,
  entry: PublicKnowledgeEntry,
): ResolvedKnowledgeEntryGraph {
  return createKnowledgeEntryResolver(knowledge)(entry);
}

export function buildKnowledgeSearchDocuments(
  knowledge: PublicKnowledgeIndex,
  visibleContentIds?: ReadonlySet<string>,
): PublicKnowledgeSearchDocument[] {
  const resolveEntry = createKnowledgeEntryResolver(knowledge);
  return knowledge.content_entries
    .filter(entry => !visibleContentIds || visibleContentIds.has(entry.content_id))
    .map(entry => {
      const {scenarios, rules, sources, hubs} = resolveEntry(entry);
      return {
        entry,
        search_terms_ko: uniqueTerms([
          entry.title_ko,
          entry.one_line_answer_ko,
          entry.audience_situation_ko,
          ...entry.search_intents_ko,
          ...entry.key_points_ko,
          ...entry.action_steps_ko,
          ...entry.facts_to_check_ko,
          entry.caution_ko,
          ...entry.body_sections.flatMap(section => [section.heading_ko, ...section.paragraphs_ko]),
          ...hubs.flatMap(hub => [hub.title_ko, hub.description_ko]),
          ...rules.flatMap(ruleTerms),
          ...scenarios.flatMap(scenarioTerms),
          ...sources.flatMap(sourceTerms),
        ]),
        evidence_labels_ko: uniqueTerms(sources.map(sourceLabel)),
      };
    });
}

function createKnowledgeEntryResolver(knowledge: PublicKnowledgeIndex) {
  const scenarioById = new Map(knowledge.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
  const ruleById = new Map(knowledge.rule_cards.map(rule => [rule.rule_id, rule]));
  const hubById = new Map(knowledge.topic_hubs.map(hub => [hub.hub_id, hub]));

  return (entry: PublicKnowledgeEntry): ResolvedKnowledgeEntryGraph => {
    const scenarios = entry.scenario_ids
      .map(scenarioId => scenarioById.get(scenarioId))
      .filter((scenario): scenario is PublicScenarioBranch => Boolean(scenario));
    const referencedRuleIds = new Set([
      ...entry.rule_ids,
      ...scenarios.flatMap(scenario => scenario.rule_ids),
    ]);
    const rules = [...referencedRuleIds]
      .map(ruleId => ruleById.get(ruleId))
      .filter((rule): rule is PublicRuleCard => Boolean(rule));
    const referencedSourceIds = new Set([
      ...entry.source_coordinate_ids,
      ...rules.flatMap(rule => rule.source_coordinate_ids),
      ...scenarios.flatMap(scenario => scenario.source_coordinate_ids),
    ]);
    const sources = knowledge.sources.filter(source => referencedSourceIds.has(source.coordinate_id));
    const hubs = entry.hub_ids
      .map(hubId => hubById.get(hubId))
      .filter((hub): hub is PublicKnowledgeHub => Boolean(hub));
    return {scenarios, rules, sources, hubs};
  };
}

function ruleTerms(rule: PublicRuleCard): string[] {
  return [
    rule.title_ko,
    rule.proposition_ko,
    rule.norm.actor_ko,
    rule.norm.conditions_ko,
    rule.norm.legal_effect_ko,
  ];
}

function scenarioTerms(scenario: PublicScenarioBranch): string[] {
  return [
    scenario.question_ko,
    scenario.decision_fact_ko,
    scenario.when_true_ko,
    scenario.when_false_ko,
  ];
}

function sourceTerms(source: PublicKnowledgeSource): string[] {
  if (source.source_kind === 'precedent') {
    return [source.title_ko, source.case_number, source.decision_date, source.source_id];
  }
  return [source.law_name_ko, source.article_no, `${source.law_name_ko} ${source.article_no}`, source.source_id];
}

function sourceLabel(source: PublicKnowledgeSource): string {
  return source.source_kind === 'precedent'
    ? source.title_ko
    : `${source.law_name_ko} ${source.article_no}`;
}

function uniqueTerms(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
