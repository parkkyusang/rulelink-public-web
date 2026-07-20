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
