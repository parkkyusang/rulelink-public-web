export type SourceCoordinate = {
  source_id?: string;
  law_key?: string;
  law_name_ko?: string;
  article_no?: string;
  case_no?: string;
  source_snapshot_id?: string;
  version_scope?: 'current_as_of_review' | 'future_effective' | 'historical';
  effective_from?: string;
  official_url?: string;
  source_hash?: string;
  last_verified_at: string;
  validation_status: 'verified' | 'unverified' | 'expired';
};

export type SourceAssertion = {
  assertion_id: string;
  user_facing_text_ko: string;
  proposition_type: 'rule' | 'procedure' | 'warning' | 'evidence' | 'action' | 'exception';
  applies_when: string[];
  does_not_apply_when: string[];
  source_coordinates: SourceCoordinate[];
};

export type LegalIssueCard = {
  issue_card_id: string;
  jurisdiction: string;
  locale: string;
  slug: string;
  title_ko: string;
  audience_situation_ko: string;
  editorial_status: 'source_verified' | 'legal_reviewed' | 'approved';
  version: string;
  effective_from: string;
  reviewed_at: string;
  expires_at: string;
  entry_signals: string[];
  urgency_signals: string[];
  branch_questions: string[];
  evidence_checklist: string[];
  action_paths: string[];
  escalation_rules: string[];
  assertion_ids: string[];
};

export type PublicTopic = {
  topic_id: string;
  slug: string;
  title_ko: string;
  description_ko: string;
  order: number;
  search_terms_ko: string[];
  issue_card_ids: string[];
};

export type PublicCatalog = {
  schema: 'rulelink_public_catalog_v1';
  jurisdiction: string;
  locale: string;
  topics: PublicTopic[];
};

type PublicKnowledgeSourceBase = {
  coordinate_id: string;
  source_id: string;
  official_url: string;
  source_snapshot_id: string;
  last_verified_at: string;
};

export type PublicKnowledgeSource = PublicKnowledgeSourceBase & (
  | {
      source_kind?: 'statute';
      law_name_ko: string;
      article_no: string;
    }
  | {
      source_kind: 'precedent';
      title_ko: string;
      case_number: string;
      decision_date: string;
    }
  | {
      source_kind: 'official_document';
      document_kind: 'revision_reason' | 'revision_text' | 'unnumbered_regulation';
      title_ko: string;
      effective_date: string;
      promulgation_number: string;
    }
);

export type PublicRuleCard = {
  rule_id: string;
  title_ko: string;
  proposition_ko: string;
  norm: {
    actor_ko: string;
    conditions_ko: string;
    legal_effect_ko: string;
  };
  source_coordinate_ids: string[];
};

export type PublicScenarioBranch = {
  scenario_id: string;
  question_ko: string;
  decision_fact_ko: string;
  when_true_ko: string;
  when_false_ko: string;
  rule_ids: string[];
  source_coordinate_ids: string[];
};

export type PublicConceptAssertion = {
  assertion_id: string;
  role: 'plain_definition' | 'legal_definition' | 'elements' | 'legal_effects' | 'judgment_factors' | 'limits' | 'procedure';
  text_ko: string;
  source_coordinate_ids: string[];
};

export type PublicConceptCard = {
  concept_id: string;
  version: string;
  slug: string;
  preferred_term_ko: string;
  aliases_ko: string[];
  plain_definition_ko: string;
  legal_definition_ko: string;
  elements_ko: string[];
  legal_effects_ko: string[];
  judgment_factors_ko: string[];
  limits_and_counterexamples_ko: string[];
  confused_with_ko: string[];
  examples_ko: string[];
  assertions: PublicConceptAssertion[];
  source_coordinate_ids: string[];
  related_rule_ids: string[];
  related_concept_ids: string[];
  related_content_ids: string[];
  reviewed_at: string;
  expires_at: string;
  editorial_status: 'source_verified' | 'legal_reviewed' | 'approved';
};

export type PublicKnowledgeEntry = {
  content_id: string;
  content_type: 'law_change' | 'doctrine_explainer' | 'fact_branch' | 'precedent_doctrine' | 'similar_case_comparison' | 'misconception_correction' | 'procedure_evidence' | 'recurring_issue_generalization';
  editorial_status: 'source_verified' | 'legal_reviewed' | 'approved';
  reviewed_at: string;
  expires_at: string;
  slug: string;
  title_ko: string;
  one_line_answer_ko: string;
  audience_situation_ko: string;
  key_points_ko: string[];
  action_steps_ko: string[];
  facts_to_check_ko: string[];
  caution_ko: string;
  search_intents_ko: string[];
  body_sections: Array<{
    heading_ko: string;
    paragraphs_ko: string[];
  }>;
  rule_ids: string[];
  scenario_ids: string[];
  source_coordinate_ids: string[];
  hub_ids: string[];
  related_content_ids: string[];
  concept_ids?: string[];
  lawyer_workspace_entry?: {
    question_ko: string;
    decision_facts_ko: string[];
    href: '/ko/lawyer-workspace';
    audience: 'verified_attorney';
  };
};

export type PublicKnowledgeHub = {
  hub_id: string;
  slug: string;
  title_ko: string;
  description_ko: string;
  content_ids: string[];
};

export type PublicKnowledgeIndex = {
  schema: 'rulelink_public_knowledge_index_v1';
  sources: PublicKnowledgeSource[];
  rule_cards: PublicRuleCard[];
  scenario_branches: PublicScenarioBranch[];
  content_entries: PublicKnowledgeEntry[];
  topic_hubs: PublicKnowledgeHub[];
  concept_cards?: PublicConceptCard[];
};

export type NormSlot = 'actor' | 'object' | 'trigger' | 'conditions' | 'exception' | 'operation' | 'legal_effect' | 'temporal_rule' | 'transition_rule';

export type NormFrame = {
  source_snapshot_ids: string[];
  actor: string[];
  object: string[];
  trigger: string[];
  conditions: string[];
  exception: string[];
  operation: string[];
  legal_effect: string[];
  temporal_rule: string[];
  transition_rule: string[];
};

export type NormDelta = {
  change_type: 'actor_expansion' | 'actor_restriction' | 'condition_change' | 'exception_change' | 'procedure_change' | 'legal_effect_change' | 'deadline_change' | 'mixed_change' | 'wording_only';
  changed_slots: NormSlot[];
  old_frame: NormFrame;
  new_frame: NormFrame;
  legal_effect_delta_ko: string;
  life_situation_impacts: string[];
  unresolved_questions: string[];
};

export type LegalChangeBrief = {
  change_brief_id: string;
  jurisdiction: string;
  locale: string;
  slug: string;
  title_ko: string;
  summary_ko: string;
  editorial_status: 'source_verified' | 'legal_reviewed' | 'approved';
  version: string;
  lifecycle: 'future_effective' | 'recently_effective';
  law_key: string;
  law_name_ko: string;
  article_no: string;
  promulgation_date?: string;
  effective_date: string;
  reviewed_at: string;
  expires_at: string;
  affected_audiences: string[];
  changed_points: string[];
  action_checklist: string[];
  transition_status: 'verified' | 'not_applicable' | 'verification_needed';
  transition_note_ko: string;
  norm_delta: NormDelta;
  related_issue_card_ids: string[];
  assertion_ids: string[];
  source_event_ids: string[];
  old_snapshot_ids: string[];
  new_snapshot_ids: string[];
};

export type PublishedBundle = {
  schema: 'rulelink_published_bundle_v1';
  snapshot_id: string;
  built_at: string;
  source_snapshot_id: string;
  jurisdiction: string;
  locale: string;
  cards: LegalIssueCard[];
  assertions: SourceAssertion[];
  change_briefs?: LegalChangeBrief[];
  knowledge?: PublicKnowledgeIndex;
  catalog?: PublicCatalog;
  file_hashes: Record<string, string>;
};

export type EditorialPreviewBundle = {
  schema: 'rulelink_editorial_preview_bundle_v1';
  preview_only: true;
  generated_at: string;
  source_snapshot_id: string;
  jurisdiction: string;
  locale: string;
  cards: LegalIssueCard[];
  assertions: SourceAssertion[];
  change_briefs?: LegalChangeBrief[];
  knowledge?: PublicKnowledgeIndex;
  catalog: PublicCatalog;
  file_hashes: Record<string, string>;
};

export type PublicContentBundle = PublishedBundle | EditorialPreviewBundle;

export type EditorialOperationsItem = {
  candidate_id: string;
  event_id: string;
  law_key: string;
  law_name_ko: string;
  article_no: string;
  lifecycle: 'future_effective' | 'recently_effective';
  effective_date: string;
  priority_score: number;
  editorial_stage: 'candidate' | 'source_delta_ready' | 'draft_ready' | 'source_verified' | 'legal_reviewed' | 'approved' | 'published';
  action_priority: number;
  next_action: string;
  transition_status: string;
  published_snapshot_id: string;
};

export type EditorialOperationsQueue = {
  schema: 'rulelink_editorial_operations_queue_v1';
  as_of: string;
  automatic_publication: false;
  summary: {
    candidate_count: number;
    published_count: number;
    approved_not_published_count: number;
    draft_or_review_count: number;
    not_started_count: number;
    stage_counts: Record<string, number>;
    cluster_count: number;
    cluster_stage_counts: Record<string, number>;
  };
  clusters: Array<{
    cluster_id: string;
    boundary_status: 'verification_needed' | 'verified';
    requires_timeline_snapshot_rebuild: boolean;
    law_key: string;
    law_name_ko: string;
    lifecycle: 'future_effective' | 'recently_effective';
    effective_date: string;
    promulgation_no: string;
    promulgation_date: string;
    amendment_type: string;
    priority_score: number;
    article_count: number;
    article_nos: string[];
    cluster_stage: 'not_started' | 'in_progress' | 'partially_published' | 'fully_published';
    covered_event_count: number;
    published_event_count: number;
    next_action: string;
    automatic_merge: false;
  }>;
  items: EditorialOperationsItem[];
};
