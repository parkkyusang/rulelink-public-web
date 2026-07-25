import assert from 'node:assert/strict';
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
    for (const contentId of projection.canonicalContentIds) {
      assert.equal(
        publicLegalAnswerForContent(catalog, contentId)?.packetId,
        projection.packetId,
      );
    }
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

async function withFixture(callback, packetBytes) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-answer-ui-fixture-'),
  );
  try {
    const fixture = validLegalAnswerFixture();
    const bundlePath = path.join(directory, 'bundle.json');
    const packetSetPath = path.join(directory, 'packets.json');
    await writeFile(bundlePath, fixture.bundleRaw);
    await writeFile(
      packetSetPath,
      packetBytes
        ? packetBytes(fixture)
        : canonicalBytes(fixture.packetSet),
    );
    const catalog = await loadPublicLegalAnswerCatalog({
      appRoot,
      bundlePath,
      packetSetPath,
    });
    return await callback({catalog, fixture});
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
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
