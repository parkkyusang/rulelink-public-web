import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {sha256Bytes} from '../src/lib/legal-answer-packet.ts';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const packetFixturePath = path.join(
  appRoot,
  'scripts',
  'fixtures',
  'legal-answer-packet',
  'canonical-public.json',
);

export const canonicalPublicPacketFixture = JSON.parse(
  await readFile(packetFixturePath, 'utf8'),
);

export function validLegalAnswerFixture() {
  const packet = structuredClone(canonicalPublicPacketFixture);
  const bundle = {
    schema: 'rulelink_published_bundle_v1',
    snapshot_id: 'snapshot:consumer-test',
    built_at: '2026-07-25T00:00:00Z',
    source_snapshot_id: 'snapshot:source-test',
    jurisdiction: 'KR',
    locale: 'ko-KR',
    cards: [],
    assertions: [],
    file_hashes: {},
    knowledge: buildKnowledge(packet),
  };
  const bundleRaw = canonicalBytes(bundle);
  const packetSet = {
    schema: 'rulelink_public_legal_answer_packet_set_v1',
    publication_snapshot_id: bundle.snapshot_id,
    publication_bundle_sha256: sha256Bytes(bundleRaw),
    packets: [packet],
  };
  rebindPacketSet(packetSet, bundle, bundleRaw);
  return {bundle, bundleRaw, packetSet};
}

export function rebindPacketSet(packetSet, bundle, bundleRaw) {
  const hash = sha256Bytes(bundleRaw);
  packetSet.publication_snapshot_id = bundle.snapshot_id;
  packetSet.publication_bundle_sha256 = hash;
  for (const packet of packetSet.packets) {
    packet.provenance.publication_snapshot_id = bundle.snapshot_id;
    packet.provenance.publication_bundle_sha256 = hash;
    for (const receiptRow of packet.retrieval.receipts) {
      if (receiptRow.index_kind === 'current_public_bundle') {
        receiptRow.canonical_snapshot_id = bundle.snapshot_id;
        receiptRow.canonical_hash = hash;
        receiptRow.index_version = bundle.snapshot_id;
      }
    }
  }
}

export function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(sortObject(value))}\n`, 'utf8');
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function buildKnowledge(packet) {
  const refs = packet.claims.flatMap(claim => claim.authority_refs);
  const sources = uniqueBy(
    refs.map(ref => ({
      coordinate_id: ref.source_coordinate_id,
      source_id: ref.locator.source_id ?? ref.source_coordinate_id,
      source_kind: ref.source_kind === 'statute'
        ? 'statute'
        : (
            ['court_adjudication', 'administrative_adjudication'].includes(
              ref.source_kind,
            )
              ? 'precedent'
              : 'official_document'
          ),
      law_key: ref.locator.law_key,
      law_name_ko: '시험 법령',
      article_no: ref.locator.article_no
        ? `제${Number(ref.locator.article_no)}조`
        : undefined,
      title_ko: '시험 근거',
      case_number: ref.locator.case_number,
      decision_date: ref.locator.decision_date,
      document_kind: ref.locator.locator_kind === 'official_document'
        ? 'unnumbered_regulation'
        : undefined,
      effective_date: ref.version.effective_from,
      promulgation_number: '시험',
      official_url: 'https://www.law.go.kr/',
      source_snapshot_id: ref.source_snapshot_id,
      last_verified_at: '2026-07-25T00:00:00Z',
    })),
    'coordinate_id',
  );
  const readings = uniqueBy(
    refs.map(ref => ({
      authority_reading_unit_id: ref.authority_reading_unit_id,
      title_ko: '시험 조문 읽기',
      route_key: {
        law_key: ref.locator.law_key ?? 'official',
        article_no: ref.locator.article_no ?? '0000',
      },
      source_coordinate_id: ref.source_coordinate_id,
      source_snapshot_id: ref.source_snapshot_id,
      source_version_key: 'sha256:test',
      time_state: ref.version.time_state,
      effective_from: `${ref.version.effective_from}T00:00:00Z`,
      ...(ref.version.effective_to
        ? {effective_to: `${ref.version.effective_to}T00:00:00Z`}
        : {}),
      summary_ko: '시험',
      anchors: (ref.anchor_ids ?? []).map(anchorId => ({
        anchor_id: anchorId,
        source_authority_unit_id: `unit:${anchorId}`,
        locator_key: anchorId,
        official_text_hash: 'a'.repeat(64),
        plain_heading_ko: '시험',
        explanation_ko: '시험',
      })),
      logical_groups: [],
      explanation_paragraphs: [],
      citation_edges: [],
      editorial_status: 'approved',
    })),
    'authority_reading_unit_id',
    mergeReadingAnchors,
  );
  const readingById = new Map(
    readings.map(reading => [reading.authority_reading_unit_id, reading]),
  );
  const firstContentId = packet.retrieval.canonical_content_ids[0];
  const bindings = packet.retrieval.authority_binding_ids.map(bindingId => {
    const readingId = refs.find(
      ref => ref.authority_binding_id === bindingId,
    ).authority_reading_unit_id;
    return {
      binding_id: bindingId,
      from_kind: 'content',
      from_id: firstContentId,
      to_kind: 'authority_reading_unit',
      to_authority_reading_unit_id: readingId,
      anchor_ids: readingById
        .get(readingId)
        .anchors.map(anchor => anchor.anchor_id),
    };
  });
  const sourceAuthorityUnits = uniqueBy(
    refs.flatMap(ref =>
      (ref.anchor_ids ?? []).map((anchorId, ordinal) => {
        const paragraph = anchorId.match(/\.p(\d+)(?:\.|$)/u)?.[1];
        const item = anchorId.match(/\.i(\d+)(?:\.|$)/u)?.[1];
        const subitem = anchorId.match(/\.s(\d+)(?:\.|$)/u)?.[1];
        return {
          source_authority_unit_id: `unit:${anchorId}`,
          version_bridge_id: `bridge:${ref.source_coordinate_id}`,
          source_coordinate_id: ref.source_coordinate_id,
          source_snapshot_id: ref.source_snapshot_id,
          source_version_key: 'sha256:test',
          unit_kind: subitem
            ? 'subitem'
            : item
              ? 'item'
              : paragraph
                ? 'paragraph'
                : 'article',
          locator: {
            article_no: ref.locator.article_no,
            ...(paragraph ? {paragraph_no: paragraph} : {}),
            ...(item ? {item_no: item} : {}),
            ...(subitem ? {subitem_no: subitem} : {}),
          },
          locator_key: anchorId,
          ordinal,
          official_text_ko: '시험 조문 원문',
          official_text_hash: 'a'.repeat(64),
          validation_status: 'verified',
        };
      }),
    ),
    'source_authority_unit_id',
  );
  const sourceVersionBridges = uniqueBy(
    refs.map(ref => ({
      bridge_id: `bridge:${ref.source_coordinate_id}`,
      source_coordinate_id: ref.source_coordinate_id,
      source_snapshot_id: ref.source_snapshot_id,
      source_version_key: 'sha256:test',
      validation_status: 'verified',
    })),
    'bridge_id',
  );
  return {
    schema: 'rulelink_public_knowledge_index_v1',
    sources,
    rule_cards: packet.retrieval.rule_ids.map(rule_id => ({
      rule_id,
      source_coordinate_ids: [...packet.retrieval.source_coordinate_ids],
    })),
    scenario_branches: packet.retrieval.scenario_ids.map(scenario_id => ({
      scenario_id,
      rule_ids: [...packet.retrieval.rule_ids],
      source_coordinate_ids: [...packet.retrieval.source_coordinate_ids],
    })),
    content_entries: packet.retrieval.canonical_content_ids.map(
      (content_id, index) => ({
        content_id,
        rule_ids: index === 0 ? [...packet.retrieval.rule_ids] : [],
        scenario_ids:
          index === 0 ? [...packet.retrieval.scenario_ids] : [],
        source_coordinate_ids:
          index === 0 ? [...packet.retrieval.source_coordinate_ids] : [],
        hub_ids: [],
        concept_ids: [],
        authority_binding_ids:
          index === 0 ? [...packet.retrieval.authority_binding_ids] : [],
      }),
    ),
    topic_hubs: [],
    concept_cards: packet.retrieval.concept_ids.map(concept_id => ({
      concept_id,
    })),
    source_authority_units: sourceAuthorityUnits,
    source_version_bridges: sourceVersionBridges,
    authority_reading_units: readings,
    authority_bindings: bindings,
  };
}

function mergeReadingAnchors(left, right) {
  left.anchors = uniqueBy([...left.anchors, ...right.anchors], 'anchor_id');
  return left;
}

function uniqueBy(rows, key, merge = left => left) {
  const result = new Map();
  for (const row of rows) {
    const existing = result.get(row[key]);
    result.set(row[key], existing ? merge(existing, row) : row);
  }
  return [...result.values()];
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, sortObject(value[key])]),
  );
}
