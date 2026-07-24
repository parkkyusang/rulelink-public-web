import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {
  inspectPublicLegalAnswerPacketSet,
  LEGAL_ANSWER_PACKET_PRODUCER_COMMIT,
  LEGAL_ANSWER_PACKET_SCHEMA_SHA256,
  projectCanonicalLegalAnswerPacket,
  sha256Bytes,
  validateVendoredLegalAnswerContract,
} from '../src/lib/legal-answer-packet.ts';
import {
  DEFAULT_LEGAL_ANSWER_PACKET_SET_PATH,
  DEFAULT_LEGAL_ANSWER_RECEIPT_PATH,
  DEFAULT_LEGAL_ANSWER_SCHEMA_PATH,
  validateLegalAnswerPacketFiles,
} from './validate-legal-answer-packets.mjs';

const appRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(appRoot, '..', '..');
const currentBundlePath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);
const packetFixturePath = path.join(
  appRoot,
  'scripts',
  'fixtures',
  'legal-answer-packet',
  'canonical-public.json',
);

const schemaRaw = await readFile(DEFAULT_LEGAL_ANSWER_SCHEMA_PATH, 'utf8');
const schema = JSON.parse(schemaRaw);
const receipt = JSON.parse(
  await readFile(DEFAULT_LEGAL_ANSWER_RECEIPT_PATH, 'utf8'),
);
const packetFixture = JSON.parse(await readFile(packetFixturePath, 'utf8'));
const currentBundleRaw = await readFile(currentBundlePath);
const currentBundle = JSON.parse(currentBundleRaw.toString('utf8'));

test('vendored producer schema와 승인 영수증은 exact SHA 및 commit에 결박된다', () => {
  assert.equal(sha256Bytes(schemaRaw), LEGAL_ANSWER_PACKET_SCHEMA_SHA256);
  assert.equal(receipt.producer_commit, LEGAL_ANSWER_PACKET_PRODUCER_COMMIT);
  assert.deepEqual(validateVendoredLegalAnswerContract(schemaRaw, receipt), []);

  const forgedReceipt = {...receipt, producer_commit: 'f'.repeat(40)};
  assert.match(
    validateVendoredLegalAnswerContract(schemaRaw, forgedReceipt).join('\n'),
    /producer_commit/,
  );
  assert.match(
    validateVendoredLegalAnswerContract(`${schemaRaw}\n`, receipt).join('\n'),
    /schema_sha256/,
  );
});

test('023은 packet sidecar가 없을 때 0건으로 exact 호환된다', async () => {
  assert.equal(
    await exists(DEFAULT_LEGAL_ANSWER_PACKET_SET_PATH),
    false,
    '023 기준에는 legal-answer-packets.json이 없어야 한다',
  );
  const result = await validateLegalAnswerPacketFiles();
  assert.deepEqual(result, {errors: [], packetCount: 0, state: 'zero_state'});
});

test('packet sidecar가 요구되면 부재를 성공으로 가장하지 않는다', async () => {
  const result = await validateLegalAnswerPacketFiles({requirePackets: true});
  assert.deepEqual(result, {
    errors: ['legal_answer_packet_set_required_but_missing'],
    packetCount: 0,
    state: 'missing',
  });
});

test('canonical packet은 current snapshot/hash와 닫힌 ID·authority graph에서만 투영된다', () => {
  const {bundle, bundleRaw, packetSet} = validFixture();
  const result = inspect(packetSet, bundle, bundleRaw);
  assert.deepEqual(result.errors, []);
  assert.equal(result.packets.length, 1);
  const projection = projectCanonicalLegalAnswerPacket(result.packets[0]);
  assert.equal(projection.packetId, packetFixture.packet_id);
  assert.equal(projection.status, 'conditional');
  assert.deepEqual(
    projection.quickAnswer.map(unit => unit.unit_id),
    ['answer.compensation-order.quick'],
  );
  assert.deepEqual(
    projection.actions.map(action => action.sequence),
    [1, 2],
  );
});

test('현재 023에 authority가 없는 상태에서 packet만 투입하면 fail-closed다', () => {
  const packetSet = {
    schema: 'rulelink_public_legal_answer_packet_set_v1',
    publication_snapshot_id: currentBundle.snapshot_id,
    publication_bundle_sha256: sha256Bytes(currentBundleRaw),
    packets: [packetFixture],
  };
  const errors = inspect(packetSet, currentBundle, currentBundleRaw).errors.join('\n');
  assert.match(errors, /retrieval_rule_missing/);
  assert.match(errors, /retrieval_authority_binding_missing/);
  assert.match(errors, /authority_binding_or_reading_missing/);
});

test('stale snapshot·bundle hash·schema commit은 각각 거부된다', () => {
  const fixture = validFixture();
  for (const mutate of [
    value => {
      value.publication_snapshot_id = 'snapshot:stale';
    },
    value => {
      value.publication_bundle_sha256 = 'f'.repeat(64);
    },
    value => {
      value.packets[0].provenance.schema_source_commit = 'f'.repeat(40);
    },
  ]) {
    const packetSet = structuredClone(fixture.packetSet);
    mutate(packetSet);
    assert.notEqual(inspect(packetSet, fixture.bundle, fixture.bundleRaw).errors.length, 0);
  }
});

test('content/rule/scenario/source/authority ID closure가 하나라도 깨지면 거부된다', () => {
  const fields = [
    ['content_entries', 'content_id', packetFixture.retrieval.canonical_content_ids[0]],
    ['rule_cards', 'rule_id', packetFixture.retrieval.rule_ids[0]],
    ['scenario_branches', 'scenario_id', packetFixture.retrieval.scenario_ids[0]],
    ['sources', 'coordinate_id', packetFixture.retrieval.source_coordinate_ids[0]],
    ['authority_bindings', 'binding_id', packetFixture.retrieval.authority_binding_ids[0]],
  ];
  for (const [collection, key, removedId] of fields) {
    const fixture = validFixture();
    fixture.bundle.knowledge[collection] = fixture.bundle.knowledge[collection]
      .filter(row => row[key] !== removedId);
    const raw = canonicalBytes(fixture.bundle);
    rebindPacketSet(fixture.packetSet, fixture.bundle, raw);
    const errors = inspect(fixture.packetSet, fixture.bundle, raw).errors.join('\n');
    assert.match(errors, new RegExp(`missing:${escapeRegExp(removedId)}`));
  }
});

test('authority snapshot·binding from_id·locator·version 변조는 거부된다', () => {
  for (const mutate of [
    bundle => {
      bundle.knowledge.sources[0].source_snapshot_id = 'snapshot:forged';
    },
    bundle => {
      bundle.knowledge.authority_bindings[0].from_id = 'content.forged';
    },
    bundle => {
      bundle.knowledge.authority_reading_units[0].route_key.article_no = '9999';
    },
    bundle => {
      bundle.knowledge.authority_reading_units[0].effective_from = '2025-01-01T00:00:00Z';
    },
  ]) {
    const fixture = validFixture();
    mutate(fixture.bundle);
    const raw = canonicalBytes(fixture.bundle);
    rebindPacketSet(fixture.packetSet, fixture.bundle, raw);
    assert.notEqual(inspect(fixture.packetSet, fixture.bundle, raw).errors.length, 0);
  }
});

test('private·noindex·user-data packet과 unknown schema field는 공개 소비가 거부된다', () => {
  for (const mutate of [
    packet => {
      packet.packet_kind = 'personalized_ephemeral';
      packet.visibility = 'private_noindex';
      packet.request.query_kind = 'user_query';
      packet.privacy = {
        robots: 'noindex_nofollow',
        cache: 'private_no_store',
        retention: 'session_ttl',
        contains_user_data: true,
        expires_at: '2026-07-25T00:00:00Z',
      };
    },
    packet => {
      packet.privacy.contains_user_data = true;
    },
    packet => {
      packet.unknown_consumer_field = true;
    },
  ]) {
    const fixture = validFixture();
    mutate(fixture.packetSet.packets[0]);
    assert.notEqual(
      inspect(fixture.packetSet, fixture.bundle, fixture.bundleRaw).errors.length,
      0,
    );
  }
});

test('실제 파일 경로에서도 invalid packet은 build validator를 실패시킨다', async () => {
  const fixture = validFixture();
  fixture.packetSet.packets[0].provenance.publication_snapshot_id = 'snapshot:stale';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rulelink-answer-consumer-'));
  try {
    const bundlePath = path.join(directory, 'bundle.json');
    const packetSetPath = path.join(directory, 'packets.json');
    await writeFile(bundlePath, fixture.bundleRaw);
    await writeFile(packetSetPath, canonicalBytes(fixture.packetSet));
    const result = await validateLegalAnswerPacketFiles({bundlePath, packetSetPath});
    assert.equal(result.state, 'invalid');
    assert.match(result.errors.join('\n'), /packet_publication_provenance_mismatch/);
    const command = spawnSync(
      process.execPath,
      [
        path.join(appRoot, 'scripts', 'validate-legal-answer-packets.mjs'),
        '--bundle',
        bundlePath,
        '--packet-set',
        packetSetPath,
      ],
      {cwd: appRoot, encoding: 'utf8'},
    );
    assert.notEqual(command.status, 0);
    assert.match(command.stderr, /공개 법률답변 패킷 검증 실패/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

function inspect(packetSet, bundle, bundleRaw) {
  return inspectPublicLegalAnswerPacketSet(packetSet, {
    bundle,
    bundleSha256: sha256Bytes(bundleRaw),
    schema,
    receipt,
    schemaRaw,
  });
}

function validFixture() {
  const packet = structuredClone(packetFixture);
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

function buildKnowledge(packet) {
  const refs = packet.claims.flatMap(claim => claim.authority_refs);
  const sources = uniqueBy(
    refs.map(ref => ({
      coordinate_id: ref.source_coordinate_id,
      source_id: ref.locator.source_id ?? ref.source_coordinate_id,
      source_kind: ref.source_kind === 'statute' ? 'statute' : (
        ['court_adjudication', 'administrative_adjudication'].includes(ref.source_kind)
          ? 'precedent'
          : 'official_document'
      ),
      law_key: ref.locator.law_key,
      law_name_ko: '시험 법령',
      article_no: ref.locator.article_no ? `제${Number(ref.locator.article_no)}조` : undefined,
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
    const readingId = refs.find(ref => ref.authority_binding_id === bindingId)
      .authority_reading_unit_id;
    return {
      binding_id: bindingId,
      from_kind: 'content',
      from_id: firstContentId,
      to_kind: 'authority_reading_unit',
      to_authority_reading_unit_id: readingId,
      anchor_ids: readingById.get(readingId).anchors.map(anchor => anchor.anchor_id),
    };
  });
  return {
    schema: 'rulelink_public_knowledge_index_v1',
    sources,
    rule_cards: packet.retrieval.rule_ids.map(rule_id => ({rule_id})),
    scenario_branches: packet.retrieval.scenario_ids.map(scenario_id => ({scenario_id})),
    content_entries: packet.retrieval.canonical_content_ids.map(content_id => ({content_id})),
    topic_hubs: [],
    concept_cards: packet.retrieval.concept_ids.map(concept_id => ({concept_id})),
    source_authority_units: [],
    source_version_bridges: [],
    authority_reading_units: readings,
    authority_bindings: bindings,
  };
}

function rebindPacketSet(packetSet, bundle, bundleRaw) {
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

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(sortObject(value))}\n`, 'utf8');
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, sortObject(value[key])]),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function exists(filename) {
  try {
    await readFile(filename);
    return true;
  } catch {
    return false;
  }
}
