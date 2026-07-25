import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

import {
  loadPublicLegalAnswerCatalog,
  loadPublicLegalAnswerForContent,
  publicLegalAnswerForContent,
} from '../src/lib/public-legal-answer-loader.ts';
import {
  canonicalBytes,
  rebindPacketSet,
  validLegalAnswerFixture,
} from './legal-answer-test-fixture.mjs';

const appRoot = path.resolve(import.meta.dirname, '..');

test('023에 답변 sidecar가 없으면 기존 상세 화면의 zero state를 유지한다', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-answer-ui-absent-'),
  );
  try {
    const catalog = await loadPublicLegalAnswerCatalog({
      appRoot,
      packetSetPath: path.join(directory, 'missing.json'),
    });
    assert.equal(catalog.state, 'absent');
    assert.deepEqual(catalog.projections, []);
    assert.equal(
      publicLegalAnswerForContent(catalog, 'content.anything'),
      null,
    );
    assert.equal(await loadPublicLegalAnswerForContent('content.anything'), null);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('검증된 canonical packet만 content ID exact mapping으로 투영한다', async () => {
  await withFixture(async ({catalog, fixture}) => {
    assert.equal(catalog.state, 'validated');
    assert.equal(catalog.projections.length, 1);
    const projection = catalog.projections[0];
    assert.equal(projection.quickAnswer.length, 1);
    assert.deepEqual(
      projection.canonicalContentIds,
      fixture.packetSet.packets[0].retrieval.canonical_content_ids,
    );
    assert.equal(
      projection.targetContentId,
      fixture.packetSet.packets[0].retrieval.receipts[0].rehydrated_ids[0],
    );
    assert.equal(
      publicLegalAnswerForContent(catalog, projection.targetContentId)
        ?.packetId,
      projection.packetId,
    );
    assert.equal(
      publicLegalAnswerForContent(
        catalog,
        projection.canonicalContentIds[1],
      ),
      null,
      '검색 후보인 관련 글에는 같은 답변을 표시하지 않는다',
    );
    assert.equal(
      publicLegalAnswerForContent(catalog, 'compensation-order-eligible-damages'),
      null,
      'slug나 부분 문자열을 content ID 대신 사용하지 않는다',
    );
    assert.equal(
      publicLegalAnswerForContent(catalog, 'content.compensation-order'),
      null,
      'prefix 일치도 허용하지 않는다',
    );
  });
});

test('존재하는 sidecar의 JSON 손상, stale hash, private packet은 fail-closed다', async () => {
  const attacks = [
    {
      label: 'corrupt',
      mutate(_fixture) {
        return Buffer.from('{', 'utf8');
      },
      expected: /legal_answer_packet_set_json_invalid/u,
    },
    {
      label: 'stale',
      mutate(fixture) {
        fixture.packetSet.publication_bundle_sha256 = 'f'.repeat(64);
        return canonicalBytes(fixture.packetSet);
      },
      expected: /legal_answer_packet_set_bundle_sha256_mismatch/u,
    },
    {
      label: 'private',
      mutate(fixture) {
        const packet = fixture.packetSet.packets[0];
        packet.packet_kind = 'personalized_ephemeral';
        packet.visibility = 'private_noindex';
        packet.request.query_kind = 'user_query';
        packet.privacy = {
          robots: 'noindex_nofollow',
          cache: 'private_no_store',
          retention: 'session_ttl',
          contains_user_data: true,
          expires_at: '2026-07-25T01:00:00Z',
        };
        return canonicalBytes(fixture.packetSet);
      },
      expected: /canonical_public_(?:identity|privacy)_invalid/u,
    },
  ];
  for (const attack of attacks) {
    await assert.rejects(
      () =>
        withFixture(
          () => {
            assert.fail(`${attack.label} packet이 투영되었습니다`);
          },
          attack.mutate,
        ),
      attack.expected,
    );
  }
});

test('존재하지만 비었거나 같은 content를 중복 점유한 sidecar는 실패한다', async () => {
  await assert.rejects(
    () =>
      withFixture(
        () => assert.fail('빈 packet set이 투영되었습니다'),
        fixture => {
          fixture.packetSet.packets = [];
          return canonicalBytes(fixture.packetSet);
        },
      ),
    /public_legal_answer_packet_set_present_but_empty/u,
  );
  await assert.rejects(
    () =>
      withFixture(
        () => assert.fail('중복 content mapping이 투영되었습니다'),
        fixture => {
          const duplicate = structuredClone(fixture.packetSet.packets[0]);
          duplicate.packet_id = 'answer.compensation-order.duplicate';
          fixture.packetSet.packets.push(duplicate);
          return canonicalBytes(fixture.packetSet);
        },
      ),
    /public_legal_answer_content_mapping_duplicate/u,
  );
});

test('상세 화면은 서버 정적 카드와 기존 질문·근거·행동 anchor만 연결한다', async () => {
  const componentSource = await readFile(
    path.join(appRoot, 'src', 'components', 'verified-legal-answer-card.tsx'),
    'utf8',
  );
  const pageSource = await readFile(
    path.join(appRoot, 'app', 'ko', 'knowledge', '[slug]', 'page.tsx'),
    'utf8',
  );
  assert.doesNotMatch(componentSource, /['"]use client['"]/u);
  assert.match(componentSource, /data-verified-legal-answer/u);
  assert.match(componentSource, /<time dateTime=\{answer\.asOf\}>/u);
  assert.match(componentSource, /href="#scenarios"/u);
  assert.match(componentSource, /'#statute-reading' : '#sources'/u);
  assert.match(componentSource, /href="#actions"/u);
  assert.match(
    pageSource,
    /loadPublicLegalAnswerForContent\(entry\.content_id\)/u,
  );
  assert.match(pageSource, /\{verifiedAnswer \? \(/u);
  assert.doesNotMatch(pageSource, /\/ko\/answers/u);
});

test('검증 답변 카드는 자바스크립트 없이 읽히는 의미 구조와 정적 anchor를 가진다', async () => {
  await withFixture(async ({catalog}) => {
    const projection = catalog.projections[0];
    const {VerifiedLegalAnswerCard} = await compileServerComponent();
    const html = renderToStaticMarkup(
      VerifiedLegalAnswerCard({
        answer: projection,
        hasAuthorityReading: true,
        hasScenarios: true,
      }),
    );
    assert.match(html, /<section[^>]*data-verified-legal-answer/u);
    assert.match(
      html,
      /<h2 id="verified-legal-answer-heading">[^<]+<\/h2>/u,
    );
    assert.match(
      html,
      new RegExp(`<time dateTime="${projection.asOf}">`, 'u'),
    );
    assert.match(html, /href="#scenarios"/u);
    assert.match(html, /href="#statute-reading"/u);
    assert.match(html, /href="#actions"/u);
    assert.doesNotMatch(html, /<(?:script|button|input)\b/u);
  });
});

async function withFixture(
  callback,
  packetBytes,
  receiptMutator,
  bundleMutator,
) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-answer-ui-fixture-'),
  );
  try {
    const fixture = validLegalAnswerFixture();
    const original = {
      packetSet: structuredClone(fixture.packetSet),
      packetSetBytes: canonicalBytes(fixture.packetSet),
    };
    bundleMutator?.(fixture);
    if (bundleMutator) {
      fixture.bundleRaw = canonicalBytes(fixture.bundle);
      rebindPacketSet(
        fixture.packetSet,
        fixture.bundle,
        fixture.bundleRaw,
      );
    }
    const bundlePath = path.join(directory, 'bundle.json');
    const packetSetPath = path.join(directory, 'packets.json');
    const packetReceiptPath = path.join(
      directory,
      'packet-set-verification-receipt.json',
    );
    await writeFile(
      bundlePath,
      fixture.bundleRaw,
    );
    const actualPacketBytes = packetBytes
      ? packetBytes(fixture)
      : canonicalBytes(fixture.packetSet);
    await writeFile(packetSetPath, actualPacketBytes);
    const producerReceiptRaw = await readFile(
      path.join(
        appRoot,
        'contracts',
        'legal-answer-packet',
        'producer-receipt.json',
      ),
    );
    const producerReceipt = JSON.parse(producerReceiptRaw.toString('utf8'));
    const verificationReceipt = {
      schema:
        'rulelink_legal_answer_packet_set_verification_receipt_v1',
      producer_commit: producerReceipt.producer_commit,
      schema_source_commit: producerReceipt.schema_source_commit,
      schema_sha256: producerReceipt.schema_sha256,
      producer_receipt_sha256: sha256(producerReceiptRaw),
      packet_set_sha256: sha256(actualPacketBytes),
      packets: fixture.packetSet.packets.map(packet => ({
        packet_id: packet.packet_id,
        packet_sha256: sha256(canonicalPacketBytes(packet)),
        target_content_id:
          packet.retrieval.receipts.flatMap(
            receipt => receipt.rehydrated_ids,
          )[0],
        verifier_version: packet.verification.verifier_version,
      })),
    };
    receiptMutator?.(verificationReceipt, original);
    await writeFile(
      packetReceiptPath,
      canonicalBytes(verificationReceipt),
    );
    const catalog = await loadPublicLegalAnswerCatalog({
      appRoot,
      bundlePath,
      packetReceiptPath,
      packetSetPath,
    });
    return await callback({catalog, fixture});
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalPacketBytes(value) {
  const bytes = canonicalBytes(value);
  return bytes.subarray(0, bytes.length - 1);
}

async function compileServerComponent() {
  const source = await readFile(
    path.join(appRoot, 'src', 'components', 'verified-legal-answer-card.tsx'),
    'utf8',
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: 'verified-legal-answer-card.tsx',
  }).outputText;
  const module = {exports: {}};
  const localRequire = createRequire(import.meta.url);
  new Function('require', 'module', 'exports', output)(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}

test('생산자 검증 영수증이 packet bytes와 대상 content를 exact 결박한다', async () => {
  await assert.rejects(
    () =>
      withFixture(
        () => assert.fail('생산자 정본과 다른 영수증이 승인되었습니다'),
        undefined,
        receipt => {
          receipt.producer_receipt_sha256 = 'f'.repeat(64);
        },
      ),
    /packet_receipt_binding_invalid/u,
  );

  await assert.rejects(
    () =>
      withFixture(
        () => assert.fail('영수증과 다른 답변 문장이 표시되었습니다'),
        fixture => {
          fixture.packetSet.packets[0].answer.units[0].text_ko +=
            ' 임의 문장';
          return canonicalBytes(fixture.packetSet);
        },
        (receipt, original) => {
          receipt.packet_set_sha256 = sha256(original.packetSetBytes);
          receipt.packets[0].packet_sha256 = sha256(
            canonicalPacketBytes(original.packetSet.packets[0]),
          );
        },
      ),
    /packet_receipt_binding_invalid|packet_receipt_verification_mismatch/u,
  );

  await assert.rejects(
    () =>
      withFixture(
        () => assert.fail('다른 페이지 대상 영수증이 표시되었습니다'),
        undefined,
        receipt => {
          receipt.packets[0].target_content_id =
            'content.compensation-order-application-deadline';
        },
      ),
    /target_(?:content_invalid|binding_mismatch)/u,
  );
});

test('빠른 답은 claim과 대상 페이지의 rule·scenario·source·binding에 닫혀야 한다', async () => {
  await assert.rejects(
    () =>
      withFixture(
        () => assert.fail('claim 없는 빠른 답이 표시되었습니다'),
        fixture => {
          fixture.packetSet.packets[0].answer.units[0].claim_ids = [];
          return canonicalBytes(fixture.packetSet);
        },
      ),
    /quick_answer_claim_required/u,
  );

  await assert.rejects(
    () =>
      withFixture(
        () => assert.fail('페이지에 없는 근거가 표시되었습니다'),
        undefined,
        undefined,
        fixture => {
          fixture.bundle.knowledge.content_entries[0].source_coordinate_ids =
            [];
          for (const rule of fixture.bundle.knowledge.rule_cards) {
            rule.source_coordinate_ids = [];
          }
          for (const scenario of fixture.bundle.knowledge.scenario_branches) {
            scenario.source_coordinate_ids = [];
          }
        },
      ),
    /target_source_missing/u,
  );
});
