export type SourceEvidenceLevel = 'verified_text' | 'coordinate_only';
export type PublicationMaintenanceStatus =
  | 'current'
  | 'review_due'
  | 'invalidated'
  | 'blocked';

export type PublicSourceText = {
  text_id: string;
  source_id: string;
  source_hash: string;
  law_name_ko: string;
  article_no: string;
  article_title_ko: string;
  official_text_ko: string;
  effective_date: string;
  retrieved_at: string;
};

export type PublicSourceTextBinding = {
  coordinate_id: string;
  public_source_snapshot_id: string;
  text_id: string;
  match_method: 'source_id' | 'law_name_and_article';
  bound_at: string;
};

export type PublicSourceTextLibrary = {
  schema: 'rulelink_public_source_text_library_v1';
  generated_at: string;
  publication_snapshot_id: string;
  publication_bundle_sha256: string;
  texts: PublicSourceText[];
  bindings: PublicSourceTextBinding[];
};

export type PublicSourceReviewReceipt = {
  receipt_id: string;
  coordinate_id: string;
  source_snapshot_id: string;
  checked_at: string;
  next_check_at: string;
  evidence_level: SourceEvidenceLevel;
  evidence_hash: string;
  status: PublicationMaintenanceStatus;
};

export type PublicContentMaintenanceView = {
  content_id: string;
  dependency_hash: string;
  source_coordinate_ids: string[];
  source_review_receipt_ids: string[];
  next_check_at: string | null;
  status: PublicationMaintenanceStatus;
  invalidated_by: string[];
};

export type PublicPublicationMaintenanceIndex = {
  schema: 'rulelink_publication_maintenance_index_v1';
  generated_at: string;
  publication_snapshot_id: string;
  publication_bundle_sha256: string;
  source_text_library_sha256: string | null;
  source_receipts: PublicSourceReviewReceipt[];
  content_views: PublicContentMaintenanceView[];
};
