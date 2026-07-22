import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {buildKnowledgeSearchDocuments, buildKnowledgeSourceDocuments, resolveKnowledgeEntryGraph} from '@/lib/knowledge-search';
import {buildKnowledgeHubConnections} from '@/lib/knowledge-hub-connections';
import {buildKnowledgeRelatedPresentation} from '@/lib/knowledge-relations';
import {changeLifecycleOrder} from '@/lib/change-lifecycle';
import {filterFreshPublications} from '@/lib/publication-freshness';

import type {KnowledgeHubConnection} from '@/lib/knowledge-hub-connections';
import type {KnowledgeRelatedSection} from '@/lib/knowledge-relations';

import type {
  EditorialOperationsQueue,
  LegalChangeBrief,
  LegalIssueCard,
  PublicConceptCard,
  PublicContentBundle,
  PublicKnowledgeEntry,
  PublicKnowledgeHub,
  PublicKnowledgeSource,
  PublicRuleCard,
  PublicScenarioBranch,
  PublicTopic,
  PublishedBundle,
  SourceAssertion,
} from '@/types/publication';

export async function loadPublishedBundle(): Promise<PublicContentBundle | null> {
  const bundlePath = publicationBundlePath();
  try {
    const payload = JSON.parse(await readFile(bundlePath, 'utf8')) as unknown;
    if (isPublishedBundle(payload)) return payload;
    return editorialPreviewEnabled() && isEditorialPreviewBundle(payload) ? payload : null;
  } catch {
    return null;
  }
}

export async function listPublishedCards(): Promise<LegalIssueCard[]> {
  return filterFreshPublications((await loadPublishedBundle())?.cards ?? []);
}

export async function findPublishedCard(slug: string): Promise<LegalIssueCard | null> {
  return (await listPublishedCards()).find(card => card.slug === slug) ?? null;
}

export async function assertionsForCard(card: LegalIssueCard): Promise<SourceAssertion[]> {
  const bundle = await loadPublishedBundle();
  if (!bundle) return [];
  const allowed = new Set(card.assertion_ids);
  return bundle.assertions.filter(assertion => allowed.has(assertion.assertion_id));
}

export async function listPublishedTopics(): Promise<PublicTopic[]> {
  const bundle = await loadPublishedBundle();
  const topics = bundle?.catalog?.topics ?? [];
  const visibleCardIds = new Set(filterFreshPublications(bundle?.cards ?? []).map(card => card.issue_card_id));
  return topics
    .filter(topic => topic.issue_card_ids.some(cardId => visibleCardIds.has(cardId)))
    .sort((left, right) => left.order - right.order || left.title_ko.localeCompare(right.title_ko, 'ko'));
}

export async function findPublishedTopic(slug: string): Promise<PublicTopic | null> {
  return (await listPublishedTopics()).find(topic => topic.slug === slug) ?? null;
}

export async function cardsForTopic(topic: PublicTopic): Promise<LegalIssueCard[]> {
  const cards = await listPublishedCards();
  const byId = new Map(cards.map(card => [card.issue_card_id, card]));
  return topic.issue_card_ids.map(cardId => byId.get(cardId)).filter((card): card is LegalIssueCard => Boolean(card));
}

export async function topicsForCard(card: LegalIssueCard): Promise<PublicTopic[]> {
  return (await listPublishedTopics()).filter(topic => topic.issue_card_ids.includes(card.issue_card_id));
}

export async function relatedCardsForCard(card: LegalIssueCard, limit = 3): Promise<LegalIssueCard[]> {
  const [cards, topics] = await Promise.all([listPublishedCards(), topicsForCard(card)]);
  const relatedIds = new Set(topics.flatMap(topic => topic.issue_card_ids));
  return cards.filter(candidate => candidate.issue_card_id !== card.issue_card_id && relatedIds.has(candidate.issue_card_id)).slice(0, limit);
}

export async function listChangeBriefs(): Promise<LegalChangeBrief[]> {
  const briefs = filterFreshPublications((await loadPublishedBundle())?.change_briefs ?? []);
  return [...briefs].sort((left, right) => {
    if (left.lifecycle !== right.lifecycle) return changeLifecycleOrder(left.lifecycle) - changeLifecycleOrder(right.lifecycle);
    const direction = left.lifecycle === 'future_effective' ? 1 : -1;
    return direction * left.effective_date.localeCompare(right.effective_date);
  });
}

export async function findChangeBrief(slug: string): Promise<LegalChangeBrief | null> {
  return (await listChangeBriefs()).find(brief => brief.slug === slug) ?? null;
}

export async function assertionsForChangeBrief(brief: LegalChangeBrief): Promise<SourceAssertion[]> {
  const bundle = await loadPublishedBundle();
  if (!bundle) return [];
  const allowed = new Set(brief.assertion_ids);
  return bundle.assertions.filter(assertion => allowed.has(assertion.assertion_id));
}


export async function relatedCardsForChangeBrief(brief: LegalChangeBrief, limit = 6): Promise<LegalIssueCard[]> {
  const cardsById = new Map((await listPublishedCards()).map(card => [card.issue_card_id, card]));
  return brief.related_issue_card_ids
    .map(cardId => cardsById.get(cardId))
    .filter((card): card is LegalIssueCard => Boolean(card))
    .slice(0, limit);
}

export async function relatedChangeBriefsForCard(card: LegalIssueCard, limit = 6): Promise<LegalChangeBrief[]> {
  return (await listChangeBriefs())
    .filter(brief => brief.related_issue_card_ids.includes(card.issue_card_id))
    .slice(0, limit);
}

export async function listKnowledgeEntries(): Promise<PublicKnowledgeEntry[]> {
  return filterFreshPublications((await loadPublishedBundle())?.knowledge?.content_entries ?? []);
}

export async function listConceptCards(): Promise<PublicConceptCard[]> {
  return filterFreshPublications((await loadPublishedBundle())?.knowledge?.concept_cards ?? []);
}

export async function findConceptCard(slug: string): Promise<PublicConceptCard | null> {
  return (await listConceptCards()).find(concept => concept.slug === slug) ?? null;
}

export async function listKnowledgeSearchDocuments() {
  const knowledge = (await loadPublishedBundle())?.knowledge;
  if (!knowledge) return [];
  const visibleContentIds = new Set(
    filterFreshPublications(knowledge.content_entries).map(entry => entry.content_id),
  );
  return buildKnowledgeSearchDocuments(knowledge, visibleContentIds);
}

export async function listKnowledgeSourceDocuments() {
  const knowledge = (await loadPublishedBundle())?.knowledge;
  if (!knowledge) return [];
  const visibleContentIds = new Set(
    filterFreshPublications(knowledge.content_entries).map(entry => entry.content_id),
  );
  const visibleConceptIds = new Set(
    filterFreshPublications(knowledge.concept_cards ?? []).map(concept => concept.concept_id),
  );
  return buildKnowledgeSourceDocuments(knowledge, visibleContentIds, visibleConceptIds);
}

export async function findKnowledgeEntry(slug: string): Promise<PublicKnowledgeEntry | null> {
  return (await listKnowledgeEntries()).find(entry => entry.slug === slug) ?? null;
}

export async function conceptDetail(concept: PublicConceptCard): Promise<{
  sources: PublicKnowledgeSource[];
  rules: PublicRuleCard[];
  relatedConcepts: PublicConceptCard[];
  relatedEntries: PublicKnowledgeEntry[];
}> {
  const knowledge = (await loadPublishedBundle())?.knowledge;
  if (!knowledge) return {sources: [], rules: [], relatedConcepts: [], relatedEntries: []};
  const sourceIds = new Set([
    ...concept.source_coordinate_ids,
    ...concept.assertions.flatMap(assertion => assertion.source_coordinate_ids),
  ]);
  const ruleIds = new Set(concept.related_rule_ids);
  const relatedConceptIds = new Set(concept.related_concept_ids);
  const relatedEntryIds = new Set(concept.related_content_ids);
  return {
    sources: knowledge.sources.filter(source => sourceIds.has(source.coordinate_id)),
    rules: knowledge.rule_cards.filter(rule => ruleIds.has(rule.rule_id)),
    relatedConcepts: filterFreshPublications(knowledge.concept_cards ?? [])
      .filter(candidate => relatedConceptIds.has(candidate.concept_id)),
    relatedEntries: filterFreshPublications(knowledge.content_entries)
      .filter(entry => relatedEntryIds.has(entry.content_id) || (entry.concept_ids ?? []).includes(concept.concept_id))
      .slice(0, 8),
  };
}

export async function listKnowledgeHubs(): Promise<PublicKnowledgeHub[]> {
  const knowledge = (await loadPublishedBundle())?.knowledge;
  if (!knowledge) return [];
  const visibleEntryIds = new Set(
    filterFreshPublications(knowledge.content_entries).map(entry => entry.content_id),
  );
  return knowledge.topic_hubs.filter(hub => hub.content_ids.some(contentId => visibleEntryIds.has(contentId)));
}

export async function findKnowledgeHub(slug: string): Promise<PublicKnowledgeHub | null> {
  return (await listKnowledgeHubs()).find(hub => hub.slug === slug) ?? null;
}

export async function entriesForKnowledgeHub(hub: PublicKnowledgeHub): Promise<PublicKnowledgeEntry[]> {
  const byId = new Map((await listKnowledgeEntries()).map(entry => [entry.content_id, entry]));
  return hub.content_ids.map(contentId => byId.get(contentId)).filter((entry): entry is PublicKnowledgeEntry => Boolean(entry));
}

export async function decisionPathsForKnowledgeHub(hub: PublicKnowledgeHub): Promise<Array<{
  scenario: PublicScenarioBranch;
  entries: PublicKnowledgeEntry[];
}>> {
  const knowledge = (await loadPublishedBundle())?.knowledge;
  if (!knowledge) return [];
  const visibleEntryById = new Map(
    filterFreshPublications(knowledge.content_entries).map(entry => [entry.content_id, entry]),
  );
  const hubEntries = hub.content_ids
    .map(contentId => visibleEntryById.get(contentId))
    .filter((entry): entry is PublicKnowledgeEntry => Boolean(entry));
  const entriesByScenarioId = new Map<string, PublicKnowledgeEntry[]>();

  for (const entry of hubEntries) {
    for (const scenarioId of entry.scenario_ids) {
      const linked = entriesByScenarioId.get(scenarioId) ?? [];
      if (!linked.some(candidate => candidate.content_id === entry.content_id)) linked.push(entry);
      entriesByScenarioId.set(scenarioId, linked);
    }
  }

  return knowledge.scenario_branches
    .map(scenario => ({scenario, entries: entriesByScenarioId.get(scenario.scenario_id) ?? []}))
    .filter(path => path.entries.length > 0);
}

export async function connectedKnowledgeHubs(hub: PublicKnowledgeHub, limit = 4): Promise<KnowledgeHubConnection[]> {
  const [entries, hubs] = await Promise.all([listKnowledgeEntries(), listKnowledgeHubs()]);
  return buildKnowledgeHubConnections(entries, hubs, hub, limit);
}

export async function knowledgeDetail(entry: PublicKnowledgeEntry): Promise<{
  concepts: PublicConceptCard[];
  rules: PublicRuleCard[];
  scenarios: PublicScenarioBranch[];
  scenarioRules: Record<string, PublicRuleCard[]>;
  sources: PublicKnowledgeSource[];
  hubs: PublicKnowledgeHub[];
  related: PublicKnowledgeEntry[];
  relatedSections: KnowledgeRelatedSection[];
}> {
  const knowledge = (await loadPublishedBundle())?.knowledge;
  if (!knowledge) return {concepts: [], rules: [], scenarios: [], scenarioRules: {}, sources: [], hubs: [], related: [], relatedSections: []};
  const graph = resolveKnowledgeEntryGraph(knowledge, entry);
  const directRuleIds = new Set(entry.rule_ids);
  const ruleById = new Map(graph.rules.map(rule => [rule.rule_id, rule]));
  const scenarioRules = Object.fromEntries(
    graph.scenarios.map(scenario => [
      scenario.scenario_id,
      scenario.rule_ids
        .map(ruleId => ruleById.get(ruleId))
        .filter((rule): rule is PublicRuleCard => Boolean(rule)),
    ]),
  );
  const entryById = new Map(filterFreshPublications(knowledge.content_entries).map(candidate => [candidate.content_id, candidate]));
  const {related, sections: relatedSections} = buildKnowledgeRelatedPresentation(
    entry,
    [...entryById.values()],
    graph.hubs.flatMap(hub => hub.content_ids),
  );
  return {
    concepts: graph.concepts,
    rules: graph.rules.filter(rule => directRuleIds.has(rule.rule_id)),
    scenarios: graph.scenarios,
    scenarioRules,
    sources: graph.sources,
    hubs: graph.hubs,
    related,
    relatedSections,
  };
}

export function publicationBundlePath(): string {
  const filename = editorialPreviewEnabled() ? 'editorial-preview-bundle.json' : 'bundle.json';
  return path.join(process.cwd(), 'content', filename);
}

function isPublishedBundle(value: unknown): value is PublishedBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Partial<PublishedBundle>;
  return bundle.schema === 'rulelink_published_bundle_v1'
    && typeof bundle.snapshot_id === 'string'
    && Array.isArray(bundle.cards)
    && Array.isArray(bundle.assertions)
    && bundle.cards.every(card => card.editorial_status === 'approved')
    && (!bundle.change_briefs || bundle.change_briefs.every(brief => brief.editorial_status === 'approved'))
    && (!bundle.knowledge || (
      bundle.knowledge.schema === 'rulelink_public_knowledge_index_v1'
      && Array.isArray(bundle.knowledge.content_entries)
      && bundle.knowledge.content_entries.every(entry => entry.editorial_status === 'approved')
      && (!bundle.knowledge.concept_cards || bundle.knowledge.concept_cards.every(concept => concept.editorial_status === 'approved'))
    ));
}

function isEditorialPreviewBundle(value: unknown): value is PublicContentBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Partial<PublicContentBundle> & {preview_only?: boolean};
  return bundle.schema === 'rulelink_editorial_preview_bundle_v1'
    && bundle.preview_only === true
    && Array.isArray(bundle.cards)
    && Array.isArray(bundle.assertions)
    && bundle.cards.every(card => ['source_verified', 'legal_reviewed', 'approved'].includes(card.editorial_status))
    && (!bundle.change_briefs || bundle.change_briefs.every(brief => ['source_verified', 'legal_reviewed', 'approved'].includes(brief.editorial_status)))
    && (!bundle.knowledge || (
      bundle.knowledge.schema === 'rulelink_public_knowledge_index_v1'
      && Array.isArray(bundle.knowledge.content_entries)
      && bundle.knowledge.content_entries.every(entry => entry.editorial_status === 'source_verified' || entry.editorial_status === 'legal_reviewed')
      && (!bundle.knowledge.concept_cards || bundle.knowledge.concept_cards.every(concept => ['source_verified', 'legal_reviewed', 'approved'].includes(concept.editorial_status)))
    ));
}

export function editorialPreviewEnabled(): boolean {
  return process.env.RULELINK_EDITORIAL_PREVIEW_MODE === 'true';
}

export async function loadEditorialOperationsQueue(): Promise<EditorialOperationsQueue | null> {
  if (!editorialPreviewEnabled()) return null;
  const queuePath = process.env.RULELINK_EDITORIAL_OPERATIONS_QUEUE;
  if (!queuePath || !path.isAbsolute(queuePath)) return null;
  try {
    const payload = JSON.parse(await readFile(queuePath, 'utf8')) as Partial<EditorialOperationsQueue>;
    return payload.schema === 'rulelink_editorial_operations_queue_v1'
      && payload.automatic_publication === false
      && Array.isArray(payload.clusters)
      && Array.isArray(payload.items)
      ? payload as EditorialOperationsQueue
      : null;
  } catch {
    return null;
  }
}
