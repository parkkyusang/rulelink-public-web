import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  inspectPublicLegalAnswerPacketSet,
  sha256Bytes,
  validateVendoredLegalAnswerContract,
} from '../src/lib/legal-answer-packet.ts';

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
  const schemaRaw = await readFile(schemaPath, 'utf8');
  const receipt = await readJson(receiptPath, 'producer receipt');
  const contractErrors = validateVendoredLegalAnswerContract(schemaRaw, receipt);
  if (contractErrors.length > 0) {
    return {errors: contractErrors, packetCount: 0, state: 'contract_invalid'};
  }
  if (!(await exists(packetSetPath))) {
    if (options.requirePackets === true) {
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
  const [bundleRaw, packetSet] = await Promise.all([
    readFile(bundlePath),
    readJson(packetSetPath, 'legal answer packet set'),
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
  return {
    errors: inspection.errors,
    packetCount: inspection.packets.length,
    state: inspection.errors.length > 0 ? 'invalid' : 'validated',
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
