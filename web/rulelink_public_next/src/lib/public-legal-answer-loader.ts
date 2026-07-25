import {createPublicKey, verify as verifySignature} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {
  inspectPublicLegalAnswerPacketSet,
  projectCanonicalLegalAnswerPacket,
  sha256Bytes,
} from './legal-answer-packet.ts';
import {resolveKnowledgeEntryGraph} from './knowledge-search.ts';

import type {
  CanonicalLegalAnswerProjection,
  RuleLinkLegalAnswerPacket,
} from '@/types/legal-answer-packet';
import type {PublishedBundle} from '@/types/publication';

export type TargetedCanonicalLegalAnswerProjection =
  CanonicalLegalAnswerProjection & {
    targetContentId: string;
  };

export type PublicLegalAnswerCatalog =
  | {
      state: 'absent';
      projections: readonly TargetedCanonicalLegalAnswerProjection[];
    }
  | {
      state: 'validated';
      projections: readonly TargetedCanonicalLegalAnswerProjection[];
    };

type LoaderOptions = {
  appRoot?: string;
  bundlePath?: string;
  packetReceiptPath?: string;
  packetSetPath?: string;
  packetTrustPolicyPath?: string;
  receiptPath?: string;
  schemaPath?: string;
};

const ABSENT_CATALOG: PublicLegalAnswerCatalog = Object.freeze({
  state: 'absent',
  projections:
    Object.freeze([]) as readonly TargetedCanonicalLegalAnswerProjection[],
});

let defaultCatalogPromise: Promise<PublicLegalAnswerCatalog> | undefined;

export function loadPublicLegalAnswerCatalog(
  options?: LoaderOptions,
): Promise<PublicLegalAnswerCatalog> {
  if (options) return loadPublicLegalAnswerCatalogUncached(options);
  defaultCatalogPromise ??= loadPublicLegalAnswerCatalogUncached({});
  return defaultCatalogPromise;
}

export async function loadPublicLegalAnswerForContent(
  contentId: string,
): Promise<CanonicalLegalAnswerProjection | null> {
  return publicLegalAnswerForContent(
    await loadPublicLegalAnswerCatalog(),
    contentId,
  );
}

export function publicLegalAnswerForContent(
  catalog: PublicLegalAnswerCatalog,
  contentId: string,
): TargetedCanonicalLegalAnswerProjection | null {
  if (catalog.state === 'absent') return null;
  return (
    catalog.projections.find(
      projection => projection.targetContentId === contentId,
    ) ?? null
  );
}

async function loadPublicLegalAnswerCatalogUncached(
  options: LoaderOptions,
): Promise<PublicLegalAnswerCatalog> {
  const appRoot = path.resolve(options.appRoot ?? process.cwd());
  const packetSetPath = path.resolve(
    options.packetSetPath ??
      path.join(appRoot, 'content', 'legal-answer-packets.json'),
  );
  const packetSetRaw = await readOptionalFile(packetSetPath);
  if (packetSetRaw === null) return ABSENT_CATALOG;
  const packetReceiptPath = path.resolve(
    options.packetReceiptPath ??
      path.join(
        appRoot,
        'contracts',
        'legal-answer-packet',
        'packet-set-verification-receipt.json',
      ),
  );
  const packetTrustPolicyPath = path.resolve(
    options.packetTrustPolicyPath ??
      path.join(
        appRoot,
        'contracts',
        'legal-answer-packet',
        'packet-set-trust-policy.json',
      ),
  );

  const bundlePath = path.resolve(
    options.bundlePath ?? path.join(appRoot, 'content', 'bundle.json'),
  );
  const schemaPath = path.resolve(
    options.schemaPath ??
      path.join(
        appRoot,
        'contracts',
        'legal-answer-packet',
        'rulelink_legal_answer_packet_v1.schema.json',
      ),
  );
  const receiptPath = path.resolve(
    options.receiptPath ??
      path.join(
        appRoot,
        'contracts',
        'legal-answer-packet',
        'producer-receipt.json',
      ),
  );
  const [
    bundleRaw,
    schemaRawBuffer,
    receiptRaw,
    packetReceiptRaw,
    packetTrustPolicyRaw,
  ] =
    await Promise.all([
    readRequiredFile(bundlePath, 'publication_bundle'),
    readRequiredFile(schemaPath, 'legal_answer_schema'),
    readRequiredFile(receiptPath, 'legal_answer_producer_receipt'),
    readRequiredFile(
      packetReceiptPath,
      'legal_answer_packet_set_verification_receipt',
    ),
    readRequiredFile(
      packetTrustPolicyPath,
      'legal_answer_packet_set_trust_policy',
    ),
  ]);
  const schemaRaw = schemaRawBuffer.toString('utf8');
  const bundle = parseJson(bundleRaw, 'publication_bundle') as PublishedBundle;
  const packetSet = parseJson(
    packetSetRaw,
    'legal_answer_packet_set',
  );
  const producerReceipt = parseJson(
    receiptRaw,
    'legal_answer_producer_receipt',
  );
  const receiptByPacketId = validatePacketSetVerificationReceipt(
    parseJson(
      packetReceiptRaw,
      'legal_answer_packet_set_verification_receipt',
    ),
    parseJson(
      packetTrustPolicyRaw,
      'legal_answer_packet_set_trust_policy',
    ),
    producerReceipt,
    receiptRaw,
    packetSetRaw,
  );
  const inspection = inspectPublicLegalAnswerPacketSet(
    packetSet,
    {
      bundle,
      bundleSha256: sha256Bytes(bundleRaw),
      schema: parseJson(
        schemaRawBuffer,
        'legal_answer_schema',
      ) as Parameters<typeof inspectPublicLegalAnswerPacketSet>[1]['schema'],
      receipt: producerReceipt,
      schemaRaw,
    },
  );
  if (!inspection.ok) {
    throw new Error(
      `public_legal_answer_packet_set_invalid:\n${inspection.errors.join('\n')}`,
    );
  }
  if (inspection.packets.length === 0) {
    throw new Error('public_legal_answer_packet_set_present_but_empty');
  }

  assertReceiptPacketSetExact(inspection.packets, receiptByPacketId);
  const projections = inspection.packets.map(packet => {
    const receiptRow = receiptByPacketId.get(packet.packet_id);
    if (!receiptRow) {
      throw new Error(
        `public_legal_answer_packet_receipt_target_missing:${packet.packet_id}`,
      );
    }
    const targetContentId = receiptRow.target_content_id;
    assertPageProjectionClosed(packet, bundle, targetContentId);
    const projection = projectCanonicalLegalAnswerPacket(packet);
    if (projection.quickAnswer.length === 0) {
      throw new Error(
        `public_legal_answer_quick_answer_required:${projection.packetId}`,
      );
    }
    if (
      projection.quickAnswer.some(unit => unit.claim_ids.length === 0)
    ) {
      throw new Error(
        `public_legal_answer_quick_answer_claim_required:${projection.packetId}`,
      );
    }
    return Object.freeze({...projection, targetContentId});
  });
  const packetByContentId = new Map<string, string>();
  for (const projection of projections) {
    const existing = packetByContentId.get(projection.targetContentId);
    if (existing) {
      throw new Error(
        `public_legal_answer_content_mapping_duplicate:${projection.targetContentId}:${existing}:${projection.packetId}`,
      );
    }
    packetByContentId.set(
      projection.targetContentId,
      projection.packetId,
    );
  }
  return Object.freeze({
    state: 'validated',
    projections: Object.freeze(projections),
  });
}

type PacketReceiptRow = {
  packet_id: string;
  packet_sha256: string;
  target_content_id: string;
  verifier_version: string;
};

function validatePacketSetVerificationReceipt(
  value: unknown,
  trustPolicy: unknown,
  producerReceipt: unknown,
  producerReceiptRaw: Uint8Array,
  packetSetRaw: Uint8Array,
): Map<string, PacketReceiptRow> {
  if (
    !isRecord(value) ||
    !isRecord(trustPolicy) ||
    !isRecord(producerReceipt)
  ) {
    throw new Error('public_legal_answer_packet_receipt_shape_invalid');
  }
  if (
    value.schema !==
      'rulelink_legal_answer_packet_set_verification_receipt_v1' ||
    value.producer_commit !== producerReceipt.producer_commit ||
    value.schema_source_commit !== producerReceipt.schema_source_commit ||
    value.schema_sha256 !== producerReceipt.schema_sha256 ||
    value.producer_receipt_sha256 !== sha256Bytes(producerReceiptRaw) ||
    value.packet_set_sha256 !== sha256Bytes(packetSetRaw) ||
    !Array.isArray(value.packets)
  ) {
    throw new Error('public_legal_answer_packet_receipt_binding_invalid');
  }
  assertPacketReceiptSignature(value, trustPolicy, producerReceipt);
  const rows = new Map<string, PacketReceiptRow>();
  for (const row of value.packets) {
    if (
      !isRecord(row) ||
      typeof row.packet_id !== 'string' ||
      typeof row.packet_sha256 !== 'string' ||
      typeof row.target_content_id !== 'string' ||
      typeof row.verifier_version !== 'string' ||
      rows.has(row.packet_id)
    ) {
      throw new Error('public_legal_answer_packet_receipt_row_invalid');
    }
    rows.set(row.packet_id, row as PacketReceiptRow);
  }
  return rows;
}

function assertPacketReceiptSignature(
  receipt: Record<string, unknown>,
  policy: Record<string, unknown>,
  producerReceipt: Record<string, unknown>,
): void {
  const signing = receipt.signing;
  if (
    policy.schema !==
      'rulelink_legal_answer_packet_set_trust_policy_v1' ||
    policy.status !== 'active' ||
    typeof policy.issuer !== 'string' ||
    policy.producer_commit !== producerReceipt.producer_commit ||
    !Array.isArray(policy.keys) ||
    !isRecord(signing) ||
    signing.algorithm !== 'Ed25519' ||
    signing.issuer !== policy.issuer ||
    typeof signing.key_id !== 'string' ||
    typeof signing.signature !== 'string'
  ) {
    throw new Error('public_legal_answer_packet_receipt_trust_invalid');
  }
  const key = policy.keys.find(
    candidate =>
      isRecord(candidate) &&
      candidate.key_id === signing.key_id &&
      candidate.algorithm === 'Ed25519' &&
      typeof candidate.public_key_pem === 'string',
  );
  if (!isRecord(key) || typeof key.public_key_pem !== 'string') {
    throw new Error('public_legal_answer_packet_receipt_key_untrusted');
  }
  const unsignedReceipt = structuredClone(receipt);
  const unsignedSigning = unsignedReceipt.signing;
  if (!isRecord(unsignedSigning)) {
    throw new Error('public_legal_answer_packet_receipt_shape_invalid');
  }
  delete unsignedSigning.signature;
  let signature: Buffer;
  try {
    signature = Buffer.from(signing.signature, 'base64');
  } catch {
    throw new Error('public_legal_answer_packet_receipt_signature_invalid');
  }
  if (
    signature.length !== 64 ||
    !verifySignature(
      null,
      Buffer.from(canonicalJson(unsignedReceipt), 'utf8'),
      createPublicKey(key.public_key_pem),
      signature,
    )
  ) {
    throw new Error('public_legal_answer_packet_receipt_signature_invalid');
  }
}

function assertReceiptPacketSetExact(
  packets: readonly RuleLinkLegalAnswerPacket[],
  receiptByPacketId: ReadonlyMap<string, PacketReceiptRow>,
): void {
  if (
    packets.length !== receiptByPacketId.size ||
    packets.some(packet => !receiptByPacketId.has(packet.packet_id))
  ) {
    throw new Error('public_legal_answer_packet_receipt_set_mismatch');
  }
  for (const packet of packets) {
    const row = receiptByPacketId.get(packet.packet_id);
    if (
      !row ||
      row.packet_sha256 !== sha256Bytes(canonicalJson(packet)) ||
      row.verifier_version !== packet.verification.verifier_version
    ) {
      throw new Error(
        `public_legal_answer_packet_receipt_verification_mismatch:${packet.packet_id}`,
      );
    }
  }
}

function assertPageProjectionClosed(
  packet: RuleLinkLegalAnswerPacket,
  bundle: PublishedBundle,
  targetContentId: string,
): void {
  const knowledge = bundle.knowledge;
  if (!knowledge) {
    throw new Error(
      `public_legal_answer_knowledge_missing:${packet.packet_id}`,
    );
  }
  const entry = knowledge.content_entries.find(
    candidate => candidate.content_id === targetContentId,
  );
  if (
    !entry ||
    !packet.retrieval.canonical_content_ids.includes(targetContentId) ||
    !packet.retrieval.receipts.some(receipt =>
      receipt.rehydrated_ids.includes(targetContentId),
    )
  ) {
    throw new Error(
      `public_legal_answer_target_content_invalid:${packet.packet_id}:${targetContentId}`,
    );
  }
  const graph = resolveKnowledgeEntryGraph(knowledge, entry);
  const visibleRuleIds = new Set(graph.rules.map(rule => rule.rule_id));
  const visibleScenarioIds = new Set(
    graph.scenarios.map(scenario => scenario.scenario_id),
  );
  const visibleSourceIds = new Set(
    graph.sources.map(source => source.coordinate_id),
  );
  const visibleBindingIds = new Set(entry.authority_binding_ids ?? []);
  const bindingById = new Map(
    (knowledge.authority_bindings ?? []).map(binding => [
      binding.binding_id,
      binding,
    ]),
  );
  for (const claim of packet.claims) {
    for (const ruleId of claim.rule_ids) {
      if (!visibleRuleIds.has(ruleId)) {
        throw new Error(
          `public_legal_answer_target_rule_missing:${packet.packet_id}:${targetContentId}:${ruleId}`,
        );
      }
    }
    for (const scenarioId of claim.scenario_ids) {
      if (!visibleScenarioIds.has(scenarioId)) {
        throw new Error(
          `public_legal_answer_target_scenario_missing:${packet.packet_id}:${targetContentId}:${scenarioId}`,
        );
      }
    }
    for (const authority of claim.authority_refs) {
      if (!visibleSourceIds.has(authority.source_coordinate_id)) {
        throw new Error(
          `public_legal_answer_target_source_missing:${packet.packet_id}:${targetContentId}:${authority.source_coordinate_id}`,
        );
      }
      const bindingId = authority.authority_binding_id;
      const binding = bindingId ? bindingById.get(bindingId) : undefined;
      if (
        !bindingId ||
        !visibleBindingIds.has(bindingId) ||
        !binding ||
        binding.from_id !== targetContentId
      ) {
        throw new Error(
          `public_legal_answer_target_binding_mismatch:${packet.packet_id}:${targetContentId}:${bindingId ?? 'missing'}`,
        );
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function readOptionalFile(filename: string): Promise<Buffer | null> {
  try {
    return await readFile(filename);
  } catch (error) {
    if (isFileError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readRequiredFile(
  filename: string,
  label: string,
): Promise<Buffer> {
  try {
    return await readFile(filename);
  } catch (error) {
    throw new Error(
      `${label}_read_failed:${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function parseJson(value: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(value).toString('utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `${label}_json_invalid:${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function isFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
