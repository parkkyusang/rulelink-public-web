export type LegalAnswerResolutionStatus = 'resolved' | 'missing' | 'out_of_scope';
export type LegalAnswerPacketStatus =
  | 'verified'
  | 'conditional'
  | 'needs_user_fact'
  | 'out_of_scope'
  | 'escalation_required'
  | 'failed_verification';

export type LegalAnswerJurisdiction = {
  status: LegalAnswerResolutionStatus;
  basis_fact_ids: string[];
  value?: string;
  country_code?: string;
  subdivision_code?: string;
};

export type LegalAnswerProceduralPosture = {
  status: LegalAnswerResolutionStatus;
  basis_fact_ids: string[];
  value?: string;
  forum_kind?:
    | 'none'
    | 'court'
    | 'prosecution'
    | 'police'
    | 'administrative_agency'
    | 'commission'
    | 'mediation_body'
    | 'unknown';
  stage?: string;
};

export type LegalAnswerGoal = {
  status: LegalAnswerResolutionStatus;
  basis_fact_ids: string[];
  value?: string;
  goal_kind?:
    | 'understand_rule'
    | 'check_eligibility'
    | 'compare_options'
    | 'prepare_evidence'
    | 'take_action'
    | 'calculate_deadline'
    | 'seek_remedy'
    | 'prepare_consultation';
};

export type LegalAnswerTimeContext = {
  status: LegalAnswerResolutionStatus;
  as_of: string;
  event_dates: Array<{
    event_key: string;
    date: string;
    confirmation: 'confirmed' | 'unconfirmed';
  }>;
  basis_fact_ids: string[];
};

export type LegalAnswerRequest = {
  query_kind: 'canonical_question' | 'user_query';
  query_text: string;
  jurisdiction: LegalAnswerJurisdiction;
  time_context: LegalAnswerTimeContext;
  procedural_posture: LegalAnswerProceduralPosture;
  goal: LegalAnswerGoal;
};

export type LegalAnswerFact = {
  fact_id: string;
  statement_ko: string;
  fact_kind:
    | 'party_role'
    | 'relationship'
    | 'event'
    | 'date'
    | 'amount'
    | 'document'
    | 'procedure'
    | 'evidence'
    | 'goal'
    | 'other';
  origin: 'canonical' | 'user' | 'uploaded_document' | 'llm_extracted' | 'system_derived';
  confirmation: 'confirmed' | 'unconfirmed' | 'contradicted';
  materiality: 'blocking' | 'outcome_changing' | 'context';
  evidence_refs: string[];
};

export type LegalAnswerBranch = {
  branch_id: string;
  scenario_id: string;
  decision_fact_id: string;
  answer: 'yes' | 'no' | 'unknown' | 'not_applicable';
  resolution: 'selected' | 'rejected' | 'unresolved';
  claim_ids: string[];
};

export type LegalAnswerRetrievalReceipt = {
  index_kind: 'current_public_bundle' | 'active_sqlite' | 'opensearch_derived';
  index_version: string;
  query_sha256: string;
  candidate_ids: string[];
  rehydrated_ids: string[];
  canonical_snapshot_id: string;
  canonical_hash: string;
};

export type LegalAnswerRetrieval = {
  canonical_content_ids: string[];
  rule_ids: string[];
  scenario_ids: string[];
  concept_ids: string[];
  source_coordinate_ids: string[];
  authority_binding_ids: string[];
  receipts: LegalAnswerRetrievalReceipt[];
};

export type LegalAnswerStatuteLocator = {
  locator_kind: 'statute';
  law_key: string;
  article_no: string;
  paragraph_no?: string;
  item_no?: string;
  subitem_no?: string;
};

export type LegalAnswerAdjudicationLocator = {
  locator_kind: 'adjudication';
  source_id: string;
  case_number?: string;
  decision_date?: string;
  section_key?: string;
};

export type LegalAnswerOfficialDocumentLocator = {
  locator_kind: 'official_document';
  source_id: string;
  document_number?: string;
  section_key?: string;
};

export type LegalAnswerAuthorityLocator =
  | LegalAnswerStatuteLocator
  | LegalAnswerAdjudicationLocator
  | LegalAnswerOfficialDocumentLocator;

export type LegalAnswerAuthorityRef = {
  source_coordinate_id: string;
  source_snapshot_id: string;
  source_kind:
    | 'statute'
    | 'court_adjudication'
    | 'administrative_adjudication'
    | 'official_interpretation'
    | 'administrative_rule'
    | 'official_guidance';
  authority_binding_id?: string;
  authority_reading_unit_id?: string;
  anchor_ids?: string[];
  locator: LegalAnswerAuthorityLocator;
  version: {
    time_state: 'current_as_of_review' | 'future_effective' | 'historical';
    effective_from: string;
    effective_to?: string;
    as_of_match: 'matched' | 'not_yet_effective' | 'historical_only' | 'unknown';
  };
  support_role: 'direct' | 'exception' | 'supporting' | 'context';
};

export type LegalAnswerClaim = {
  claim_id: string;
  claim_type:
    | 'rule'
    | 'application'
    | 'exception'
    | 'procedure'
    | 'deadline'
    | 'evidence'
    | 'action'
    | 'limitation';
  statement_ko: string;
  legal_effect: 'applies' | 'does_not_apply' | 'conditional' | 'informational' | 'unresolved';
  rule_ids: string[];
  scenario_ids: string[];
  conditions: {
    all_fact_ids: string[];
    any_fact_ids: string[];
    excluded_fact_ids: string[];
    branch_ids: string[];
  };
  authority_refs: LegalAnswerAuthorityRef[];
  exception_claim_ids: string[];
  evidence_requirement_ids: string[];
  action_ids: string[];
  deadline_ids: string[];
};

export type LegalAnswerEvidence = {
  evidence_id: string;
  label_ko: string;
  purpose_claim_ids: string[];
  status: 'available' | 'missing' | 'unknown' | 'not_applicable';
};

export type LegalAnswerAction = {
  action_id: string;
  label_ko: string;
  basis_claim_ids: string[];
  sequence: number;
  status: 'recommended' | 'conditional' | 'blocked' | 'not_applicable';
};

export type LegalAnswerDeadline = {
  deadline_id: string;
  label_ko: string;
  basis_claim_ids: string[];
  trigger_fact_id: string;
  calculation_kind: 'fixed_date' | 'duration_from_event' | 'not_calculable';
  duration_value?: number;
  duration_unit?: 'day' | 'week' | 'month' | 'year';
  calculated_date?: string;
  status: 'calculated' | 'needs_trigger_fact' | 'exception_possible' | 'not_applicable';
  timezone: 'Asia/Seoul';
};

export type LegalAnswerUnit = {
  unit_id: string;
  unit_kind:
    | 'quick_answer'
    | 'reason'
    | 'application'
    | 'evidence'
    | 'action'
    | 'deadline'
    | 'caution'
    | 'scope_limit';
  text_ko: string;
  claim_ids: string[];
};

export type LegalAnswerVerificationGate = {
  gate_id:
    | 'scope_supported'
    | 'jurisdiction_resolved'
    | 'time_resolved'
    | 'procedural_posture_resolved'
    | 'goal_resolved'
    | 'blocking_facts_resolved'
    | 'branch_closed'
    | 'authority_closed'
    | 'authority_current'
    | 'exceptions_covered'
    | 'evidence_action_deadline_covered'
    | 'graph_closed'
    | 'contradictions_absent'
    | 'rendering_faithful'
    | 'privacy_mode_valid';
  status: 'pass' | 'fail' | 'blocked' | 'not_applicable';
  evidence_refs: string[];
};

export type RuleLinkLegalAnswerPacket = {
  schema: 'rulelink_legal_answer_packet_v1';
  packet_id: string;
  packet_kind: 'canonical_public' | 'personalized_ephemeral';
  visibility: 'public_indexable' | 'private_noindex';
  status: LegalAnswerPacketStatus;
  language: 'ko-KR';
  created_at: string;
  as_of: string;
  request: LegalAnswerRequest;
  scope: {
    supported: boolean;
    supported_domain_ids: string[];
    excluded_reasons: Array<
      | 'jurisdiction_not_supported'
      | 'time_not_supported'
      | 'topic_not_published'
      | 'authority_not_verified'
      | 'procedural_posture_not_supported'
      | 'requires_document_review'
      | 'requires_individual_legal_judgment'
    >;
  };
  facts: LegalAnswerFact[];
  branches: LegalAnswerBranch[];
  retrieval: LegalAnswerRetrieval;
  claims: LegalAnswerClaim[];
  evidence_requirements: LegalAnswerEvidence[];
  actions: LegalAnswerAction[];
  deadlines: LegalAnswerDeadline[];
  answer: {
    quick_answer_unit_ids: string[];
    units: LegalAnswerUnit[];
  };
  verification: {
    overall: 'pass' | 'blocked' | 'fail';
    gates: LegalAnswerVerificationGate[];
    unsupported_claim_ids: string[];
    unresolved_blocking_fact_ids: string[];
    verifier_version: 'rulelink_legal_answer_verifier_v1';
    verified_at: string;
  };
  escalation: {
    required: boolean;
    reasons: Array<
      | 'outside_verified_scope'
      | 'missing_material_fact'
      | 'authority_missing'
      | 'authority_stale'
      | 'authority_conflict'
      | 'jurisdiction_unresolved'
      | 'time_unresolved'
      | 'procedural_posture_unresolved'
      | 'deadline_risk'
      | 'personalized_legal_judgment'
      | 'document_review_required'
      | 'emergency_safety'
    >;
    route:
      | 'public_information'
      | 'ask_user'
      | 'source_maintenance'
      | 'verified_attorney_workspace'
      | 'emergency_service'
      | 'internal_legal_review';
    safe_summary_ko: string;
  };
  provenance: {
    publication_snapshot_id: string;
    publication_bundle_sha256: string;
    source_db_release_id: string;
    pipeline_version: string;
    schema_source_commit: string;
    memo_artifact_hashes?: string[];
  };
  privacy: {
    robots: 'index_follow' | 'noindex_nofollow';
    cache: 'public_immutable' | 'private_no_store';
    retention: 'publication_snapshot' | 'session_ttl' | 'case_workspace';
    contains_user_data: boolean;
    expires_at?: string;
  };
};

export type PublicLegalAnswerPacketSet = {
  schema: 'rulelink_public_legal_answer_packet_set_v1';
  publication_snapshot_id: string;
  publication_bundle_sha256: string;
  packets: RuleLinkLegalAnswerPacket[];
};

declare const validatedCanonicalPacket: unique symbol;

export type ValidatedCanonicalLegalAnswerPacket = RuleLinkLegalAnswerPacket & {
  readonly [validatedCanonicalPacket]: true;
};

export type CanonicalLegalAnswerProjection = {
  packetId: string;
  status: 'verified' | 'conditional';
  asOf: string;
  canonicalContentIds: string[];
  quickAnswer: LegalAnswerUnit[];
  answerUnits: LegalAnswerUnit[];
  facts: LegalAnswerFact[];
  branches: LegalAnswerBranch[];
  claims: LegalAnswerClaim[];
  evidence: LegalAnswerEvidence[];
  actions: LegalAnswerAction[];
  deadlines: LegalAnswerDeadline[];
};
