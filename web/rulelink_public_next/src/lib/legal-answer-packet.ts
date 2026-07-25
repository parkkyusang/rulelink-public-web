import {createHash} from 'node:crypto';

import type {
  CanonicalLegalAnswerProjection,
  PublicLegalAnswerPacketSet,
  RuleLinkLegalAnswerPacket,
  ValidatedCanonicalLegalAnswerPacket,
} from '@/types/legal-answer-packet';
import type {
  PublicAuthorityBinding,
  PublicAuthorityReadingUnit,
  PublicKnowledgeIndex,
  PublicKnowledgeSource,
  PublicSourceAuthorityUnit,
  PublicSourceVersionBridge,
  PublishedBundle,
} from '@/types/publication';
import {pythonCaseFold} from './python-casefold.ts';

export const LEGAL_ANSWER_PACKET_PRODUCER_COMMIT =
  'c87cc9314f247b4be39c3ee96f1d49a332300ae0';
export const LEGAL_ANSWER_PACKET_SCHEMA_SOURCE_COMMIT =
  'd781dd30a7571eb25cb496b8d1d3ff5c0ad6c051';
export const LEGAL_ANSWER_PACKET_SCHEMA_SHA256 =
  '71077ce5054255cf933d4bdaa3be2c6094aa9b8dc726b21159c654f579d49715';
export const LEGAL_ANSWER_PACKET_SCHEMA_PATH =
  'schemas/rulelink_legal_answer_packet_v1.schema.json';
export const LEGAL_ANSWER_PACKET_SCHEMA_ID =
  'urn:rulelink:schema:legal-answer-packet:v1';

const REQUIRED_GATE_IDS: ReadonlySet<
  RuleLinkLegalAnswerPacket['verification']['gates'][number]['gate_id']
> = new Set([
  'scope_supported',
  'jurisdiction_resolved',
  'time_resolved',
  'procedural_posture_resolved',
  'goal_resolved',
  'blocking_facts_resolved',
  'branch_closed',
  'authority_closed',
  'authority_current',
  'exceptions_covered',
  'evidence_action_deadline_covered',
  'graph_closed',
  'contradictions_absent',
  'rendering_faithful',
  'privacy_mode_valid',
]);
const PYTHON_UNICODE_WHITESPACE =
  /[\u0009-\u000d\u001c-\u001f\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/u;

type VendorReceipt = {
  schema: string;
  producer_repository: string;
  producer_commit: string;
  schema_source_commit: string;
  schema_path: string;
  schema_id: string;
  schema_sha256: string;
};

type JsonSchema = {
  $defs?: Record<string, JsonSchema>;
  $ref?: string;
  type?: string;
  enum?: unknown[];
  const?: unknown;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minLength?: number;
  minimum?: number;
  pattern?: string;
  format?: string;
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  if?: JsonSchema;
  then?: JsonSchema;
  not?: JsonSchema;
  [key: string]: unknown;
};

export type LegalAnswerPacketInspection =
  | {
      ok: true;
      errors: [];
      packets: ValidatedCanonicalLegalAnswerPacket[];
    }
  | {
      ok: false;
      errors: string[];
      packets: [];
    };

const validatedPacketRegistry = new WeakSet<RuleLinkLegalAnswerPacket>();

export function sha256Bytes(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function legalAnswerQueryFingerprint(queryText: string): string {
  const normalized = pythonCaseFold(
    queryText
      .split(PYTHON_UNICODE_WHITESPACE)
      .filter(Boolean)
      .join(' '),
  );
  return sha256Bytes(normalized);
}

export function validateVendoredLegalAnswerContract(
  schemaRaw: string,
  receiptValue: unknown,
): string[] {
  const errors: string[] = [];
  if (!isRecord(receiptValue)) return ['legal_answer_vendor_receipt_not_object'];
  const receipt = receiptValue as VendorReceipt;
  const expected: Record<string, string> = {
    schema: 'rulelink_legal_answer_packet_vendor_receipt_v1',
    producer_repository: 'https://github.com/parkkyusang/liale-rulelink-ir.git',
    producer_commit: LEGAL_ANSWER_PACKET_PRODUCER_COMMIT,
    schema_source_commit: LEGAL_ANSWER_PACKET_SCHEMA_SOURCE_COMMIT,
    schema_path: LEGAL_ANSWER_PACKET_SCHEMA_PATH,
    schema_id: LEGAL_ANSWER_PACKET_SCHEMA_ID,
    schema_sha256: LEGAL_ANSWER_PACKET_SCHEMA_SHA256,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (receipt[key as keyof VendorReceipt] !== value) {
      errors.push(`legal_answer_vendor_receipt_mismatch:${key}`);
    }
  }
  if (sha256Bytes(schemaRaw) !== LEGAL_ANSWER_PACKET_SCHEMA_SHA256) {
    errors.push('legal_answer_vendored_schema_sha256_mismatch');
  }
  try {
    const schema = JSON.parse(schemaRaw) as JsonSchema;
    if (schema.$id !== LEGAL_ANSWER_PACKET_SCHEMA_ID) {
      errors.push('legal_answer_vendored_schema_id_mismatch');
    }
  } catch {
    errors.push('legal_answer_vendored_schema_invalid_json');
  }
  return errors;
}

export function inspectPublicLegalAnswerPacketSet(
  value: unknown,
  options: {
    bundle: PublishedBundle;
    bundleSha256: string;
    schema: JsonSchema;
    receipt: unknown;
    schemaRaw: string;
  },
): LegalAnswerPacketInspection {
  const errors = validateVendoredLegalAnswerContract(
    options.schemaRaw,
    options.receipt,
  );
  if (!isRecord(value)) {
    return inspectionFailure([...errors, 'legal_answer_packet_set_not_object']);
  }
  if (value.schema !== 'rulelink_public_legal_answer_packet_set_v1') {
    errors.push('legal_answer_packet_set_schema_invalid');
  }
  if (value.publication_snapshot_id !== options.bundle.snapshot_id) {
    errors.push('legal_answer_packet_set_snapshot_mismatch');
  }
  if (value.publication_bundle_sha256 !== options.bundleSha256) {
    errors.push('legal_answer_packet_set_bundle_sha256_mismatch');
  }
  if (!Array.isArray(value.packets)) {
    return inspectionFailure([
      ...errors,
      'legal_answer_packet_set_packets_not_array',
    ]);
  }
  const seenPacketIds = new Set<string>();
  const validated: ValidatedCanonicalLegalAnswerPacket[] = [];
  for (const [index, packet] of value.packets.entries()) {
    const label = `packets[${index}]`;
    const schemaErrors = validateJsonSchema(packet, options.schema);
    errors.push(...schemaErrors.map(error => `${label}:${error}`));
    if (schemaErrors.length > 0 || !isRecord(packet)) continue;
    if (seenPacketIds.has(String(packet.packet_id))) {
      errors.push(`${label}:packet_id_duplicate:${String(packet.packet_id)}`);
      continue;
    }
    seenPacketIds.add(String(packet.packet_id));
    const semanticErrors = validateCanonicalPacket(
      packet as RuleLinkLegalAnswerPacket,
      options.bundle,
      options.bundleSha256,
    );
    errors.push(...semanticErrors.map(error => `${label}:${error}`));
    if (semanticErrors.length === 0) {
      validated.push(packet as ValidatedCanonicalLegalAnswerPacket);
    }
  }
  const uniqueErrors = [...new Set(errors)];
  if (uniqueErrors.length > 0) return inspectionFailure(uniqueErrors);
  const packets = validated.map(packet => {
    const immutablePacket = deepFreezeJson(
      structuredClone(packet),
    ) as ValidatedCanonicalLegalAnswerPacket;
    validatedPacketRegistry.add(immutablePacket);
    return immutablePacket;
  });
  return {ok: true, errors: [], packets};
}

export function projectCanonicalLegalAnswerPacket(
  packet: ValidatedCanonicalLegalAnswerPacket,
): CanonicalLegalAnswerProjection {
  if (!validatedPacketRegistry.has(packet)) {
    throw new Error('legal_answer_packet_not_from_successful_inspection');
  }
  const quickIds = new Set(packet.answer.quick_answer_unit_ids);
  return {
    packetId: packet.packet_id,
    status: packet.status as 'verified' | 'conditional',
    asOf: packet.as_of,
    canonicalContentIds: [...packet.retrieval.canonical_content_ids],
    quickAnswer: packet.answer.units.filter(unit => quickIds.has(unit.unit_id)),
    claims: [...packet.claims],
    evidence: [...packet.evidence_requirements],
    actions: [...packet.actions].sort((left, right) => left.sequence - right.sequence),
    deadlines: [...packet.deadlines],
  };
}

function inspectionFailure(errors: string[]): LegalAnswerPacketInspection {
  return {ok: false, errors: [...new Set(errors)], packets: []};
}

function deepFreezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreezeJson(nested);
    Object.freeze(value);
  }
  return value;
}

export function validateJsonSchema(value: unknown, schema: JsonSchema): string[] {
  const errors: string[] = [];
  validateSchemaNode(value, schema, schema, '$', errors);
  return errors;
}

function validateSchemaNode(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  path: string,
  errors: string[],
): void {
  if (schema.$ref) {
    const target = resolveLocalRef(root, schema.$ref);
    if (!target) errors.push(`${path}:schema_ref_unresolved:${schema.$ref}`);
    else validateSchemaNode(value, target, root, path, errors);
    return;
  }
  if (schema.allOf) {
    for (const child of schema.allOf) validateSchemaNode(value, child, root, path, errors);
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(child => {
      const candidate: string[] = [];
      validateSchemaNode(value, child, root, path, candidate);
      return candidate.length === 0;
    });
    if (matches.length !== 1) errors.push(`${path}:schema_one_of_match_count:${matches.length}`);
  }
  if (schema.if) {
    const conditionErrors: string[] = [];
    validateSchemaNode(value, schema.if, root, path, conditionErrors);
    if (conditionErrors.length === 0 && schema.then) {
      validateSchemaNode(value, schema.then, root, path, errors);
    }
  }
  if (schema.not) {
    const candidate: string[] = [];
    validateSchemaNode(value, schema.not, root, path, candidate);
    if (candidate.length === 0) errors.push(`${path}:schema_not_matched`);
  }
  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push(`${path}:schema_const_mismatch`);
  }
  if (schema.enum && !schema.enum.some(candidate => deepEqual(candidate, value))) {
    errors.push(`${path}:schema_enum_mismatch`);
  }
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path}:schema_type_mismatch:${schema.type}`);
    return;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}:schema_min_length`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      errors.push(`${path}:schema_pattern_mismatch`);
    }
    if (schema.format === 'date' && !validDate(value)) {
      errors.push(`${path}:schema_date_invalid`);
    }
    if (schema.format === 'date-time' && !validDateTime(value)) {
      errors.push(`${path}:schema_date_time_invalid`);
    }
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}:schema_minimum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}:schema_min_items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}:schema_max_items`);
    }
    if (schema.uniqueItems && uniqueValues(value).size !== value.length) {
      errors.push(`${path}:schema_unique_items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        validateSchemaNode(item, schema.items as JsonSchema, root, `${path}[${index}]`, errors);
      });
    }
  }
  if (isRecord(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path}:schema_required_missing:${key}`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        validateSchemaNode(value[key], child, root, `${path}.${key}`, errors);
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) errors.push(`${path}:schema_additional_property:${key}`);
      }
    }
  }
}

function validateCanonicalPacket(
  packet: RuleLinkLegalAnswerPacket,
  bundle: PublishedBundle,
  bundleSha256: string,
): string[] {
  const errors: string[] = [];
  const knowledge = bundle.knowledge;
  if (!knowledge) return ['publication_knowledge_missing'];
  if (
    packet.packet_kind !== 'canonical_public' ||
    packet.visibility !== 'public_indexable' ||
    packet.request.query_kind !== 'canonical_question'
  ) {
    errors.push('canonical_public_identity_invalid');
  }
  if (
    packet.privacy.robots !== 'index_follow' ||
    packet.privacy.cache !== 'public_immutable' ||
    packet.privacy.retention !== 'publication_snapshot' ||
    packet.privacy.contains_user_data !== false ||
    packet.privacy.expires_at !== undefined
  ) {
    errors.push('canonical_public_privacy_invalid');
  }
  if (!['verified', 'conditional'].includes(packet.status)) {
    errors.push('canonical_public_status_invalid');
  }
  if (
    packet.provenance.publication_snapshot_id !== bundle.snapshot_id ||
    packet.provenance.publication_bundle_sha256 !== bundleSha256
  ) {
    errors.push('packet_publication_provenance_mismatch');
  }
  if (packet.provenance.schema_source_commit !== LEGAL_ANSWER_PACKET_SCHEMA_SOURCE_COMMIT) {
    errors.push('packet_schema_source_commit_mismatch');
  }
  if (packet.as_of !== packet.request.time_context.as_of) {
    errors.push('request_time_context_as_of_mismatch');
  }
  validateRetrieval(packet, knowledge, bundle, bundleSha256, errors);
  validatePacketGraph(packet, knowledge, errors);
  validatePacketAuthority(packet, knowledge, errors);
  validatePacketLifecycle(packet, errors);
  return [...new Set(errors)];
}

function validateRetrieval(
  packet: RuleLinkLegalAnswerPacket,
  knowledge: PublicKnowledgeIndex,
  bundle: PublishedBundle,
  bundleSha256: string,
  errors: string[],
): void {
  const collections: Array<[string, string[], Set<string>]> = [
    ['content', packet.retrieval.canonical_content_ids, ids(knowledge.content_entries, 'content_id')],
    ['rule', packet.retrieval.rule_ids, ids(knowledge.rule_cards, 'rule_id')],
    ['scenario', packet.retrieval.scenario_ids, ids(knowledge.scenario_branches, 'scenario_id')],
    ['concept', packet.retrieval.concept_ids, ids(knowledge.concept_cards ?? [], 'concept_id')],
    ['source', packet.retrieval.source_coordinate_ids, ids(knowledge.sources, 'coordinate_id')],
    ['authority_binding', packet.retrieval.authority_binding_ids, ids(knowledge.authority_bindings ?? [], 'binding_id')],
  ];
  for (const [label, values, available] of collections) {
    checkUnique(values, `retrieval_${label}`, errors);
    checkReferences(values, available, `retrieval_${label}`, errors);
  }
  const rehydratableIds = new Set(
    collections.flatMap(([, values]) => values),
  );
  const expectedQueryHash = legalAnswerQueryFingerprint(
    packet.request.query_text,
  );
  let currentReceiptCount = 0;
  for (const [index, receipt] of packet.retrieval.receipts.entries()) {
    if (!sameStringSet(receipt.candidate_ids, receipt.rehydrated_ids)) {
      errors.push(`retrieval_candidate_rehydration_mismatch:${index}`);
    }
    checkReferences(
      receipt.rehydrated_ids,
      rehydratableIds,
      `retrieval_rehydrated:${index}`,
      errors,
    );
    if (receipt.query_sha256 !== expectedQueryHash) {
      errors.push(`retrieval_query_hash_mismatch:${index}`);
    }
    if (receipt.index_kind === 'current_public_bundle') {
      currentReceiptCount += 1;
      if (
        receipt.canonical_snapshot_id !== bundle.snapshot_id ||
        receipt.canonical_hash !== bundleSha256 ||
        receipt.index_version !== bundle.snapshot_id
      ) {
        errors.push('current_public_bundle_receipt_mismatch');
      }
    } else if (receipt.index_kind === 'active_sqlite') {
      if (receipt.canonical_hash !== packet.provenance.source_db_release_id) {
        errors.push('active_sqlite_receipt_mismatch');
      }
    } else {
      errors.push('opensearch_receipt_not_supported_in_public_stage_b');
    }
  }
  if (currentReceiptCount !== 1) errors.push('current_public_bundle_receipt_count_invalid');
}

function validatePacketGraph(
  packet: RuleLinkLegalAnswerPacket,
  knowledge: PublicKnowledgeIndex,
  errors: string[],
): void {
  const factIds = uniqueObjectIds(packet.facts, 'fact_id', 'fact', errors);
  const branchIds = uniqueObjectIds(packet.branches, 'branch_id', 'branch', errors);
  const claimIds = uniqueObjectIds(packet.claims, 'claim_id', 'claim', errors);
  const evidenceIds = uniqueObjectIds(
    packet.evidence_requirements,
    'evidence_id',
    'evidence',
    errors,
  );
  const actionIds = uniqueObjectIds(packet.actions, 'action_id', 'action', errors);
  const deadlineIds = uniqueObjectIds(packet.deadlines, 'deadline_id', 'deadline', errors);
  const answerUnitIds = uniqueObjectIds(packet.answer.units, 'unit_id', 'answer_unit', errors);
  const scenarioIds = ids(knowledge.scenario_branches, 'scenario_id');

  for (const fact of packet.facts) {
    if (!['canonical', 'system_derived'].includes(fact.origin)) {
      errors.push(`canonical_fact_origin_invalid:${fact.fact_id}`);
    }
  }
  for (const branch of packet.branches) {
    checkReferences([branch.scenario_id], scenarioIds, `branch_scenario:${branch.branch_id}`, errors);
    checkReferences([branch.decision_fact_id], factIds, `branch_fact:${branch.branch_id}`, errors);
    checkReferences(branch.claim_ids, claimIds, `branch_claim:${branch.branch_id}`, errors);
  }
  for (const claim of packet.claims) {
    checkReferences(claim.rule_ids, new Set(packet.retrieval.rule_ids), `claim_rule:${claim.claim_id}`, errors);
    checkReferences(claim.scenario_ids, new Set(packet.retrieval.scenario_ids), `claim_scenario:${claim.claim_id}`, errors);
    checkReferences(
      [
        ...claim.conditions.all_fact_ids,
        ...claim.conditions.any_fact_ids,
        ...claim.conditions.excluded_fact_ids,
      ],
      factIds,
      `claim_fact:${claim.claim_id}`,
      errors,
    );
    checkReferences(claim.conditions.branch_ids, branchIds, `claim_branch:${claim.claim_id}`, errors);
    checkReferences(claim.exception_claim_ids, claimIds, `claim_exception:${claim.claim_id}`, errors);
    for (const exceptionId of claim.exception_claim_ids) {
      if (packet.claims.find(row => row.claim_id === exceptionId)?.claim_type !== 'exception') {
        errors.push(`claim_exception_type_invalid:${claim.claim_id}:${exceptionId}`);
      }
    }
    checkReferences(claim.evidence_requirement_ids, evidenceIds, `claim_evidence:${claim.claim_id}`, errors);
    checkReferences(claim.action_ids, actionIds, `claim_action:${claim.claim_id}`, errors);
    checkReferences(claim.deadline_ids, deadlineIds, `claim_deadline:${claim.claim_id}`, errors);
  }
  for (const evidence of packet.evidence_requirements) {
    checkReferences(evidence.purpose_claim_ids, claimIds, `evidence_claim:${evidence.evidence_id}`, errors);
  }
  for (const action of packet.actions) {
    checkReferences(action.basis_claim_ids, claimIds, `action_claim:${action.action_id}`, errors);
  }
  for (const deadline of packet.deadlines) {
    checkReferences(deadline.basis_claim_ids, claimIds, `deadline_claim:${deadline.deadline_id}`, errors);
    checkReferences([deadline.trigger_fact_id], factIds, `deadline_fact:${deadline.deadline_id}`, errors);
  }
  checkReferences(packet.answer.quick_answer_unit_ids, answerUnitIds, 'quick_answer_unit', errors);
  for (const unit of packet.answer.units) {
    checkReferences(unit.claim_ids, claimIds, `answer_claim:${unit.unit_id}`, errors);
  }
  if (
    packet.status === 'verified' &&
    packet.claims.some(
      claim =>
        claim.claim_type === 'application' &&
        ['applies', 'does_not_apply'].includes(claim.legal_effect),
    )
  ) {
    errors.push('canonical_verified_personal_application_forbidden');
  }
}

function validatePacketAuthority(
  packet: RuleLinkLegalAnswerPacket,
  knowledge: PublicKnowledgeIndex,
  errors: string[],
): void {
  const sources = objectMap(knowledge.sources, 'coordinate_id');
  const bindings = objectMap(knowledge.authority_bindings ?? [], 'binding_id');
  const readings = objectMap(
    knowledge.authority_reading_units ?? [],
    'authority_reading_unit_id',
  );
  const sourceUnits = objectMap(
    knowledge.source_authority_units ?? [],
    'source_authority_unit_id',
  );
  const versionBridges = objectMap(
    knowledge.source_version_bridges ?? [],
    'bridge_id',
  );
  const canonicalContentIds = new Set(packet.retrieval.canonical_content_ids);
  const referencedSourceIds = new Set<string>();
  const referencedBindingIds = new Set<string>();
  for (const claim of packet.claims) {
    for (const ref of claim.authority_refs) {
      referencedSourceIds.add(ref.source_coordinate_id);
      if (ref.authority_binding_id) referencedBindingIds.add(ref.authority_binding_id);
      const source = sources.get(ref.source_coordinate_id) as PublicKnowledgeSource | undefined;
      if (!source) {
        errors.push(`authority_source_missing:${ref.source_coordinate_id}`);
        continue;
      }
      if (source.source_snapshot_id !== ref.source_snapshot_id) {
        errors.push(`authority_source_snapshot_mismatch:${ref.source_coordinate_id}`);
      }
      validateSourceLocator(ref, source, errors);
      if (!ref.authority_binding_id || !ref.authority_reading_unit_id) {
        errors.push(`authority_public_binding_missing:${claim.claim_id}`);
        continue;
      }
      const binding = bindings.get(ref.authority_binding_id) as PublicAuthorityBinding | undefined;
      const reading = readings.get(
        ref.authority_reading_unit_id,
      ) as PublicAuthorityReadingUnit | undefined;
      if (!binding || !reading) {
        errors.push(`authority_binding_or_reading_missing:${claim.claim_id}`);
        continue;
      }
      if (
        binding.from_kind !== 'content' ||
        !canonicalContentIds.has(binding.from_id) ||
        binding.to_kind !== 'authority_reading_unit' ||
        binding.to_authority_reading_unit_id !== reading.authority_reading_unit_id
      ) {
        errors.push(`authority_binding_projection_mismatch:${binding.binding_id}`);
      }
      if (
        reading.source_coordinate_id !== ref.source_coordinate_id ||
        reading.source_snapshot_id !== ref.source_snapshot_id ||
        reading.time_state !== ref.version.time_state ||
        datePrefix(reading.effective_from) !== ref.version.effective_from ||
        datePrefix(reading.effective_to) !== ref.version.effective_to
      ) {
        errors.push(`authority_reading_version_mismatch:${reading.authority_reading_unit_id}`);
      }
      if (
        ['direct', 'exception'].includes(ref.support_role) &&
        (
          ref.version.time_state !== 'current_as_of_review' ||
          ref.version.as_of_match !== 'matched' ||
          !dateWithinVersion(packet.as_of, ref.version.effective_from, ref.version.effective_to)
        )
      ) {
        errors.push(`authority_direct_version_not_current:${claim.claim_id}`);
      }
      if (
        ['direct', 'exception'].includes(ref.support_role) &&
        (ref.anchor_ids?.length ?? 0) === 0
      ) {
        errors.push(`authority_direct_anchor_required:${claim.claim_id}`);
      }
      const anchorIds = new Set(reading.anchors.map(anchor => anchor.anchor_id));
      checkReferences(ref.anchor_ids ?? [], anchorIds, `authority_anchor:${claim.claim_id}`, errors);
      checkReferences(
        ref.anchor_ids ?? [],
        new Set(binding.anchor_ids),
        `authority_binding_anchor:${claim.claim_id}`,
        errors,
      );
      for (const anchorId of ref.anchor_ids ?? []) {
        const anchor = reading.anchors.find(row => row.anchor_id === anchorId);
        if (!anchor) continue;
        const sourceUnit = sourceUnits.get(
          anchor.source_authority_unit_id,
        ) as PublicSourceAuthorityUnit | undefined;
        if (
          !sourceUnit ||
          sourceUnit.source_coordinate_id !== ref.source_coordinate_id ||
          sourceUnit.source_snapshot_id !== ref.source_snapshot_id ||
          sourceUnit.locator_key !== anchor.locator_key ||
          sourceUnit.official_text_hash !== anchor.official_text_hash
        ) {
          errors.push(`authority_anchor_source_unit_mismatch:${anchorId}`);
          continue;
        }
        const versionBridge = versionBridges.get(
          sourceUnit.version_bridge_id,
        ) as PublicSourceVersionBridge | undefined;
        if (
          !versionBridge ||
          versionBridge.source_coordinate_id !== ref.source_coordinate_id ||
          versionBridge.source_snapshot_id !== ref.source_snapshot_id ||
          versionBridge.source_version_key !== sourceUnit.source_version_key ||
          reading.source_version_key !== sourceUnit.source_version_key
        ) {
          errors.push(`authority_source_version_bridge_mismatch:${anchorId}`);
        }
        if (
          ref.locator.locator_kind === 'statute' &&
          !sameStatuteLocator(ref.locator, sourceUnit.locator)
        ) {
          errors.push(`authority_anchor_locator_mismatch:${anchorId}`);
        }
      }
      if (
        ref.locator.locator_kind === 'statute' &&
        (
          ref.locator.law_key !== reading.route_key.law_key ||
          ref.locator.article_no !== reading.route_key.article_no
        )
      ) {
        errors.push(`authority_statute_route_mismatch:${reading.authority_reading_unit_id}`);
      }
      if (
        ['applies', 'does_not_apply'].includes(claim.legal_effect) &&
        !['direct', 'exception'].includes(ref.support_role) &&
        claim.authority_refs.every(row => !['direct', 'exception'].includes(row.support_role))
      ) {
        errors.push(`authority_polarity_not_direct:${claim.claim_id}`);
      }
    }
  }
  checkExactProjection(
    packet.retrieval.source_coordinate_ids,
    referencedSourceIds,
    'retrieval_source_projection',
    errors,
  );
  checkExactProjection(
    packet.retrieval.authority_binding_ids,
    referencedBindingIds,
    'retrieval_authority_binding_projection',
    errors,
  );
}

function sameStatuteLocator(
  locator: Extract<
    RuleLinkLegalAnswerPacket['claims'][number]['authority_refs'][number]['locator'],
    {locator_kind: 'statute'}
  >,
  sourceLocator: PublicSourceAuthorityUnit['locator'],
): boolean {
  return (
    locator.article_no === sourceLocator.article_no &&
    (locator.paragraph_no === undefined ||
      locator.paragraph_no === sourceLocator.paragraph_no) &&
    (locator.item_no === undefined ||
      locator.item_no === sourceLocator.item_no) &&
    (locator.subitem_no === undefined ||
      locator.subitem_no === sourceLocator.subitem_no)
  );
}

function dateWithinVersion(
  asOf: string,
  effectiveFrom: string,
  effectiveTo?: string,
): boolean {
  const asOfDate = datePrefix(asOf);
  return (
    asOfDate !== undefined &&
    asOfDate >= effectiveFrom &&
    (effectiveTo === undefined || asOfDate <= effectiveTo)
  );
}

function validateSourceLocator(
  ref: RuleLinkLegalAnswerPacket['claims'][number]['authority_refs'][number],
  source: PublicKnowledgeSource,
  errors: string[],
): void {
  if (ref.source_kind === 'statute') {
    if (ref.locator.locator_kind !== 'statute' || source.source_kind === 'precedent' || source.source_kind === 'official_document') {
      errors.push(`authority_source_kind_locator_mismatch:${ref.source_coordinate_id}`);
      return;
    }
    if (source.law_key && source.law_key !== ref.locator.law_key) {
      errors.push(`authority_law_key_mismatch:${ref.source_coordinate_id}`);
    }
  } else if (
    ['court_adjudication', 'administrative_adjudication'].includes(ref.source_kind)
  ) {
    if (ref.locator.locator_kind !== 'adjudication' || source.source_kind !== 'precedent' || source.source_id !== ref.locator.source_id) {
      errors.push(`authority_source_kind_locator_mismatch:${ref.source_coordinate_id}`);
    }
  } else if (
    ref.locator.locator_kind !== 'official_document' ||
    source.source_kind !== 'official_document' ||
    source.source_id !== ref.locator.source_id
  ) {
    errors.push(`authority_source_kind_locator_mismatch:${ref.source_coordinate_id}`);
  }
}

function validatePacketLifecycle(
  packet: RuleLinkLegalAnswerPacket,
  errors: string[],
): void {
  if (
    packet.verification.overall !== 'pass' ||
    packet.verification.unsupported_claim_ids.length > 0 ||
    packet.verification.unresolved_blocking_fact_ids.length > 0
  ) {
    errors.push('canonical_public_verification_not_passed');
  }
  const gates = new Map(
    packet.verification.gates.map(gate => [gate.gate_id, gate.status]),
  );
  if (
    gates.size !== REQUIRED_GATE_IDS.size ||
    [...REQUIRED_GATE_IDS].some(id => gates.get(id) !== 'pass')
  ) {
    errors.push('canonical_public_verification_gates_invalid');
  }
  if (
    packet.escalation.required ||
    packet.escalation.reasons.length > 0 ||
    packet.escalation.route !== 'public_information'
  ) {
    errors.push('canonical_public_escalation_invalid');
  }
  if (
    !packet.scope.supported ||
    packet.request.jurisdiction.status !== 'resolved' ||
    packet.request.time_context.status !== 'resolved' ||
    packet.request.procedural_posture.status !== 'resolved' ||
    packet.request.goal.status !== 'resolved'
  ) {
    errors.push('canonical_public_scope_or_resolution_invalid');
  }
}

function resolveLocalRef(root: JsonSchema, reference: string): JsonSchema | null {
  if (!reference.startsWith('#/')) return null;
  let current: unknown = root;
  for (const part of reference.slice(2).split('/')) {
    if (!isRecord(current)) return null;
    current = current[part.replace(/~1/gu, '/').replace(/~0/gu, '~')];
  }
  return isRecord(current) ? current as JsonSchema : null;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'object') return isRecord(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'null') return value === null;
  return false;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validDateTime(value: string): boolean {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/u,
  );
  if (!match || !validDate(match[1])) {
    return false;
  }
  const [, , hour, minute, second, , offsetHour = '00', offsetMinute = '00'] = match;
  if (
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 60 ||
    Number(offsetHour) > 23 ||
    Number(offsetMinute) > 59
  ) {
    return false;
  }
  const normalized = value
    .replace('t', 'T')
    .replace(/z$/u, 'Z')
    .replace(/:60(?=(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$)/u, ':59');
  return !Number.isNaN(Date.parse(normalized));
}

function uniqueValues(values: unknown[]): Set<string> {
  return new Set(values.map(value => canonicalJson(value)));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ids(rows: unknown[], key: string): Set<string> {
  return new Set(
    rows
      .filter(isRecord)
      .map(row => row[key])
      .filter((value): value is string => typeof value === 'string'),
  );
}

function objectMap(rows: unknown[], key: string): Map<string, unknown> {
  return new Map(
    rows
      .filter(isRecord)
      .filter(row => typeof row[key] === 'string')
      .map(row => [row[key] as string, row]),
  );
}

function uniqueObjectIds(
  rows: unknown[],
  key: string,
  label: string,
  errors: string[],
): Set<string> {
  const values = rows
    .filter(isRecord)
    .map(row => row[key])
    .filter((value): value is string => typeof value === 'string');
  checkUnique(values, label, errors);
  return new Set(values);
}

function checkUnique(values: string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) errors.push(`${label}_duplicate:${value}`);
    seen.add(value);
  }
}

function checkReferences(
  values: string[],
  available: Set<string>,
  label: string,
  errors: string[],
): void {
  for (const value of values) {
    if (!available.has(value)) errors.push(`${label}_missing:${value}`);
  }
}

function checkExactProjection(
  declared: string[],
  referenced: Set<string>,
  label: string,
  errors: string[],
): void {
  const declaredSet = new Set(declared);
  for (const value of referenced) {
    if (!declaredSet.has(value)) errors.push(`${label}_undeclared:${value}`);
  }
  for (const value of declaredSet) {
    if (!referenced.has(value)) errors.push(`${label}_unused:${value}`);
  }
}

function sameStringSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every(value => rightSet.has(value))
  );
}

function datePrefix(value: string | undefined): string | undefined {
  return value?.slice(0, 10);
}
