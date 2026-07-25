import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  inspectPublicLegalAnswerPacketSet,
  sha256Bytes,
  validateVendoredLegalAnswerContract,
} from '../src/lib/legal-answer-packet.ts';
import {loadPublicLegalAnswerCatalog} from '../src/lib/public-legal-answer-loader.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractRoot = path.join(appRoot, 'contracts', 'legal-answer-packet');

export const DEFAULT_LEGAL_ANSWER_SCHEMA_PATH = path.join(
  contractRoot,
  'rulelink_legal_answer_packet_v1.schema.json',
);
export const DEFAULT_LEGAL_ANSWER_RECEIPT_PATH = path.join(
  contractRoot,
  'producer-receipt.json',
);
export const DEFAULT_LEGAL_ANSWER_PACKET_SET_PATH = path.join(
  appRoot,
  'content',
  'legal-answer-packets.json',
);
export const DEFAULT_PUBLICATION_BUNDLE_PATH = path.join(
  appRoot,
  'content',
  'bundle.json',
);
export const DEFAULT_LEGAL_ANSWER_ACTIVATION_MANIFEST_PATH = path.join(
  contractRoot,
  'activation-manifest.json',
);
export const DEFAULT_LEGAL_ANSWER_PACKET_RECEIPT_PATH = path.join(
  contractRoot,
  'packet-set-verification-receipt.json',
);
export const DEFAULT_LEGAL_ANSWER_PACKET_TRUST_POLICY_PATH = path.join(
  contractRoot,
  'packet-set-trust-policy.json',
);
export const DEFAULT_PRODUCTION_QUEUE_PATH = path.join(
  appRoot,
  '..',
  '..',
  'artifacts',
  'publication',
  'production-queue.json',
);
export const DEFAULT_PRODUCTION_REGISTRY_PATH = path.join(
  appRoot,
  '..',
  '..',
  'artifacts',
  'publication',
  'production-queue-registry.json',
);

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function exactKeys(value, allowed) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every(key => allowed.includes(key)) &&
    allowed.every(key => Object.hasOwn(value, key))
  );
}

export async function loadLegalAnswerActivation(options = {}) {
  const activationManifestPath = path.resolve(
    options.activationManifestPath ??
      DEFAULT_LEGAL_ANSWER_ACTIVATION_MANIFEST_PATH,
  );
  const manifest = await readJson(
    activationManifestPath,
    'legal answer activation manifest',
  );
  if (manifest?.schema !== 'rulelink_legal_answer_packet_activation_v1') {
    throw new Error('legal_answer_activation_schema_invalid');
  }
  if (manifest.activation_state === 'inactive') {
    if (
      !exactKeys(manifest, [
        'schema',
        'activation_state',
        'base_snapshot_id',
      ]) ||
      typeof manifest.base_snapshot_id !== 'string' ||
      manifest.base_snapshot_id.length === 0
    ) {
      throw new Error('legal_answer_activation_inactive_shape_invalid');
    }
    return {
      state: 'inactive',
      manifest,
      manifestSha256: sha256Bytes(
        await readFile(activationManifestPath),
      ),
    };
  }
  const activeKeys = [
    'schema',
    'activation_state',
    'expected_snapshot_id',
    'expected_packet_count',
    'expected_packet_ids',
    'expected_packet_set_sha256',
    'expected_verification_receipt_sha256',
    'expected_trust_policy_sha256',
    'target_topic_ids',
    'queue_work_id',
    'queue_gate_id',
    'queue_gate_evidence_ref',
  ];
  if (
    manifest.activation_state !== 'active' ||
    !exactKeys(manifest, activeKeys) ||
    !Number.isInteger(manifest.expected_packet_count) ||
    manifest.expected_packet_count < 1 ||
    !Array.isArray(manifest.expected_packet_ids) ||
    manifest.expected_packet_ids.length !== manifest.expected_packet_count ||
    new Set(manifest.expected_packet_ids).size !==
      manifest.expected_packet_ids.length ||
    manifest.expected_packet_ids.some(
      packetId => typeof packetId !== 'string' || packetId.length === 0,
    ) ||
    !Array.isArray(manifest.target_topic_ids) ||
    manifest.target_topic_ids.length === 0 ||
    new Set(manifest.target_topic_ids).size !==
      manifest.target_topic_ids.length ||
    manifest.target_topic_ids.some(
      topicId => typeof topicId !== 'string' || !topicId.startsWith('hub.'),
    ) ||
    ![
      manifest.expected_packet_set_sha256,
      manifest.expected_verification_receipt_sha256,
      manifest.expected_trust_policy_sha256,
    ].every(value => SHA256_PATTERN.test(value)) ||
    ![
      manifest.expected_snapshot_id,
      manifest.queue_work_id,
      manifest.queue_gate_id,
      manifest.queue_gate_evidence_ref,
    ].every(value => typeof value === 'string' && value.length > 0)
  ) {
    throw new Error('legal_answer_activation_active_shape_invalid');
  }
  const [queue, registry] = await Promise.all([
    readJson(
      path.resolve(
        options.productionQueuePath ?? DEFAULT_PRODUCTION_QUEUE_PATH,
      ),
      'production queue',
    ),
    readJson(
      path.resolve(
        options.productionRegistryPath ?? DEFAULT_PRODUCTION_REGISTRY_PATH,
      ),
      'production registry',
    ),
  ]);
  const item = (queue.items ?? []).find(
    candidate => candidate.work_id === manifest.queue_work_id,
  );
  const gate = (item?.prerequisite_gates ?? []).find(
    candidate => candidate.gate_id === manifest.queue_gate_id,
  );
  if (
    !item ||
    !gate ||
    gate.status !== 'satisfied' ||
    gate.evidence_ref !== manifest.queue_gate_evidence_ref
  ) {
    throw new Error('legal_answer_activation_queue_gate_invalid');
  }
  const gateReceipt = (registry.prerequisite_gate_receipts ?? []).find(
    receipt =>
      receipt.work_id === manifest.queue_work_id &&
      receipt.gate_id === manifest.queue_gate_id &&
      receipt.evidence_ref === manifest.queue_gate_evidence_ref,
  );
  if (!gateReceipt) {
    throw new Error('legal_answer_activation_queue_receipt_missing');
  }
  return {
    state: 'active',
    manifest,
    manifestSha256: sha256Bytes(await readFile(activationManifestPath)),
    gateReceiptId: `${manifest.queue_work_id}:${manifest.queue_gate_id}`,
  };
}

export async function validateLegalAnswerPacketFiles(options = {}) {
  const schemaPath = path.resolve(
    options.schemaPath ?? DEFAULT_LEGAL_ANSWER_SCHEMA_PATH,
  );
  const receiptPath = path.resolve(
    options.receiptPath ?? DEFAULT_LEGAL_ANSWER_RECEIPT_PATH,
  );
  const packetSetPath = path.resolve(
    options.packetSetPath ?? DEFAULT_LEGAL_ANSWER_PACKET_SET_PATH,
  );
  const bundlePath = path.resolve(
    options.bundlePath ?? DEFAULT_PUBLICATION_BUNDLE_PATH,
  );
  let activation;
  try {
    activation = await loadLegalAnswerActivation(options);
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : String(error)],
      packetCount: 0,
      state: 'activation_invalid',
    };
  }
  const requirePackets =
    options.requirePackets === true || activation.state === 'active';
  if (activation.state === 'inactive' && (await exists(bundlePath))) {
    const inactiveBundle = await readJson(
      bundlePath,
      'publication bundle for inactive legal answer activation',
    );
    if (inactiveBundle.snapshot_id !== activation.manifest.base_snapshot_id) {
      return {
        errors: ['legal_answer_activation_inactive_snapshot_mismatch'],
        packetCount: 0,
        state: 'activation_invalid',
      };
    }
  }
  const schemaRaw = await readFile(schemaPath, 'utf8');
  const receipt = await readJson(receiptPath, 'producer receipt');
  const contractErrors = validateVendoredLegalAnswerContract(schemaRaw, receipt);
  if (contractErrors.length > 0) {
    return {errors: contractErrors, packetCount: 0, state: 'contract_invalid'};
  }
  if (!(await exists(packetSetPath))) {
    if (requirePackets) {
      return {
        errors: ['legal_answer_packet_set_required_but_missing'],
        packetCount: 0,
        state: 'missing',
      };
    }
    return {errors: [], packetCount: 0, state: 'zero_state'};
  }
  if (!(await exists(bundlePath))) {
    return {
      errors: ['publication_bundle_required_for_legal_answer_packets'],
      packetCount: 0,
      state: 'bundle_missing',
    };
  }
  const packetReceiptPath = path.resolve(
    options.packetReceiptPath ??
      DEFAULT_LEGAL_ANSWER_PACKET_RECEIPT_PATH,
  );
  const packetTrustPolicyPath = path.resolve(
    options.packetTrustPolicyPath ??
      DEFAULT_LEGAL_ANSWER_PACKET_TRUST_POLICY_PATH,
  );
  const [bundleRaw, packetSet, packetSetRaw] = await Promise.all([
    readFile(bundlePath),
    readJson(packetSetPath, 'legal answer packet set'),
    readFile(packetSetPath),
  ]);
  let bundle;
  let schema;
  try {
    bundle = JSON.parse(bundleRaw.toString('utf8'));
    schema = JSON.parse(schemaRaw);
  } catch (error) {
    return {
      errors: [
        `legal_answer_consumer_json_invalid:${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      packetCount: 0,
      state: 'invalid_json',
    };
  }
  const inspection = inspectPublicLegalAnswerPacketSet(packetSet, {
    bundle,
    bundleSha256: sha256Bytes(bundleRaw),
    schema,
    receipt,
    schemaRaw,
  });
  if (
    requirePackets &&
    inspection.ok &&
    inspection.packets.length === 0
  ) {
    return {
      errors: ['legal_answer_packet_set_required_but_empty'],
      packetCount: 0,
      state: 'empty',
    };
  }
  if (activation.state === 'active') {
    const activeErrors = [];
    let packetReceiptRaw;
    let packetTrustPolicyRaw;
    try {
      [packetReceiptRaw, packetTrustPolicyRaw] = await Promise.all([
        readFile(packetReceiptPath),
        readFile(packetTrustPolicyPath),
      ]);
    } catch {
      return {
        errors: ['legal_answer_activation_receipt_or_trust_policy_missing'],
        packetCount: 0,
        state: 'activation_invalid',
      };
    }
    const expected = activation.manifest;
    if (bundle.snapshot_id !== expected.expected_snapshot_id) {
      activeErrors.push('legal_answer_activation_snapshot_mismatch');
    }
    if (
      sha256Bytes(packetSetRaw) !== expected.expected_packet_set_sha256
    ) {
      activeErrors.push('legal_answer_activation_packet_set_hash_mismatch');
    }
    if (
      sha256Bytes(packetReceiptRaw) !==
      expected.expected_verification_receipt_sha256
    ) {
      activeErrors.push('legal_answer_activation_receipt_hash_mismatch');
    }
    if (
      sha256Bytes(packetTrustPolicyRaw) !==
      expected.expected_trust_policy_sha256
    ) {
      activeErrors.push('legal_answer_activation_trust_policy_hash_mismatch');
    }
    const actualPacketIds = inspection.packets
      .map(packet => packet.packet_id)
      .sort();
    const expectedPacketIds = [...expected.expected_packet_ids].sort();
    if (
      actualPacketIds.length !== expected.expected_packet_count ||
      JSON.stringify(actualPacketIds) !== JSON.stringify(expectedPacketIds)
    ) {
      activeErrors.push('legal_answer_activation_packet_ids_or_count_mismatch');
    }
    if (activeErrors.length > 0 || !inspection.ok) {
      return {
        errors: [...inspection.errors, ...activeErrors],
        packetCount: 0,
        state: 'activation_invalid',
      };
    }
    try {
      await loadPublicLegalAnswerCatalog({
        appRoot,
        bundlePath,
        packetReceiptPath,
        packetSetPath,
        packetTrustPolicyPath,
        receiptPath,
        schemaPath,
      });
    } catch (error) {
      return {
        errors: [
          `legal_answer_activation_trusted_loader_failed:${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
        packetCount: 0,
        state: 'activation_invalid',
      };
    }
  }
  return {
    errors: inspection.errors,
    packetCount: inspection.packets.length,
    state: inspection.ok ? 'validated' : 'invalid',
  };
}

async function readJson(filename, label) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    throw new Error(
      `${label} JSON을 읽을 수 없습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateLegalAnswerPacketFiles({
    bundlePath:
      optionValue('--bundle') ??
      process.env.RULELINK_WEB_BUNDLE_PATH ??
      DEFAULT_PUBLICATION_BUNDLE_PATH,
    packetSetPath:
      optionValue('--packet-set') ??
      process.env.RULELINK_LEGAL_ANSWER_PACKETS_PATH ??
      DEFAULT_LEGAL_ANSWER_PACKET_SET_PATH,
    requirePackets:
      process.argv.includes('--require-packets') ||
      process.env.RULELINK_REQUIRE_LEGAL_ANSWER_PACKETS === 'true',
    activationManifestPath:
      optionValue('--activation-manifest') ??
      DEFAULT_LEGAL_ANSWER_ACTIVATION_MANIFEST_PATH,
  });
  if (result.errors.length > 0) {
    process.stderr.write(
      `공개 법률답변 패킷 검증 실패:\n- ${result.errors.join('\n- ')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    result.state === 'zero_state'
      ? '공개 법률답변 패킷 0건 호환 검증 통과\n'
      : `공개 법률답변 패킷 ${result.packetCount}건 검증 통과\n`,
  );
}
