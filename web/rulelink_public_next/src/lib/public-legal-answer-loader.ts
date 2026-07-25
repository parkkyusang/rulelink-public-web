import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {
  inspectPublicLegalAnswerPacketSet,
  projectCanonicalLegalAnswerPacket,
  sha256Bytes,
} from './legal-answer-packet.ts';

import type {CanonicalLegalAnswerProjection} from '@/types/legal-answer-packet';
import type {PublishedBundle} from '@/types/publication';

export type PublicLegalAnswerCatalog =
  | {
      state: 'absent';
      projections: readonly CanonicalLegalAnswerProjection[];
    }
  | {
      state: 'validated';
      projections: readonly CanonicalLegalAnswerProjection[];
    };

type LoaderOptions = {
  appRoot?: string;
  bundlePath?: string;
  packetSetPath?: string;
  receiptPath?: string;
  schemaPath?: string;
};

const ABSENT_CATALOG: PublicLegalAnswerCatalog = Object.freeze({
  state: 'absent',
  projections: Object.freeze([]) as readonly CanonicalLegalAnswerProjection[],
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
): CanonicalLegalAnswerProjection | null {
  if (catalog.state === 'absent') return null;
  return (
    catalog.projections.find(projection =>
      projection.canonicalContentIds.includes(contentId),
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
  const [bundleRaw, schemaRawBuffer, receiptRaw] = await Promise.all([
    readRequiredFile(bundlePath, 'publication_bundle'),
    readRequiredFile(schemaPath, 'legal_answer_schema'),
    readRequiredFile(receiptPath, 'legal_answer_producer_receipt'),
  ]);
  const schemaRaw = schemaRawBuffer.toString('utf8');
  const inspection = inspectPublicLegalAnswerPacketSet(
    parseJson(packetSetRaw, 'legal_answer_packet_set'),
    {
      bundle: parseJson(bundleRaw, 'publication_bundle') as PublishedBundle,
      bundleSha256: sha256Bytes(bundleRaw),
      schema: parseJson(
        schemaRawBuffer,
        'legal_answer_schema',
      ) as Parameters<typeof inspectPublicLegalAnswerPacketSet>[1]['schema'],
      receipt: parseJson(receiptRaw, 'legal_answer_producer_receipt'),
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

  const projections = inspection.packets.map(packet => {
    const projection = projectCanonicalLegalAnswerPacket(packet);
    if (projection.quickAnswer.length === 0) {
      throw new Error(
        `public_legal_answer_quick_answer_required:${projection.packetId}`,
      );
    }
    return Object.freeze(projection);
  });
  const packetByContentId = new Map<string, string>();
  for (const projection of projections) {
    for (const contentId of projection.canonicalContentIds) {
      const existing = packetByContentId.get(contentId);
      if (existing) {
        throw new Error(
          `public_legal_answer_content_mapping_duplicate:${contentId}:${existing}:${projection.packetId}`,
        );
      }
      packetByContentId.set(contentId, projection.packetId);
    }
  }
  return Object.freeze({
    state: 'validated',
    projections: Object.freeze(projections),
  });
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
