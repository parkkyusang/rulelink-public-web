import assert from 'node:assert/strict';
import {
  createHash,
  generateKeyPairSync,
  sign as signBytes,
} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

import {
  loadPublicLegalAnswerCatalog,
  loadPublicLegalAnswerForContent,
  publicLegalAnswerForContent,
} from '../src/lib/public-legal-answer-loader.ts';
import {
  canonicalBytes,
  escapeRegExp,
  rebindPacketSet,
  validLegalAnswerFixture,
} from './legal-answer-test-fixture.mjs';

const appRoot = path.resolve(import.meta.dirname, '..');
const packetReceiptSigningKey = generateKeyPairSync('ed25519');
const packetReceiptPublicKeyPem =
  packetReceiptSigningKey.publicKey.export({
    format: 'pem',
    type: 'spki',
  });

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

test('상세 화면은 사실분기 선택과 claim별 근거·자료·행동을 같은 식별자로 연결한다', async () => {
  const componentSource = await readFile(
    path.join(appRoot, 'src', 'components', 'verified-legal-answer-card.tsx'),
    'utf8',
  );
  const pageSource = await readFile(
    path.join(appRoot, 'app', 'ko', 'knowledge', '[slug]', 'page.tsx'),
    'utf8',
  );
  assert.match(componentSource, /['"]use client['"]/u);
  assert.match(componentSource, /data-verified-legal-answer/u);
  assert.match(componentSource, /<time dateTime=\{answer\.asOf\}>/u);
  assert.match(componentSource, /href="#scenarios"/u);
  assert.match(componentSource, /'#statute-reading' : '#sources'/u);
  assert.match(componentSource, /href="#actions"/u);
  assert.match(componentSource, /KNOWLEDGE_SCENARIO_CHANGE_EVENT/u);
  assert.match(componentSource, /data-active-claim-id/u);
  assert.match(componentSource, /data-claim-authority-id/u);
  assert.match(componentSource, /data-claim-evidence-id/u);
  assert.match(componentSource, /data-claim-action-id/u);
  assert.match(componentSource, /data-claim-deadline-id/u);
  assert.match(
    pageSource,
    /loadPublicLegalAnswerForContent\(entry\.content_id\)/u,
  );
  assert.match(pageSource, /\{verifiedAnswer \? \(/u);
  assert.doesNotMatch(pageSource, /\/ko\/answers/u);
});

test('검증 답변 카드는 무JS에서 조건부 답과 정적 anchor를 모두 보존한다', async () => {
  await withFixture(async ({catalog}) => {
    const projection = catalog.projections[0];
    const {VerifiedLegalAnswerCard} = await compileServerComponent();
    const html = renderToStaticMarkup(
      createElement(VerifiedLegalAnswerCard, {
        answer: projection,
        contentId: projection.targetContentId,
        hasAuthorityReading: true,
        hasScenarios: true,
        revisionKey: projection.asOf,
      }),
    );
    assert.match(html, /<section[^>]*data-verified-legal-answer/u);
    assert.match(html, /<h2 id="verified-legal-answer-heading">/u);
    assert.match(html, /data-static-conditional-answer/u);
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
  signedReceiptMutator,
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
    const packetTrustPolicyPath = path.join(
      directory,
      'packet-set-trust-policy.json',
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
      signing: {
        algorithm: 'Ed25519',
        issuer: 'rulelink-test-legal-answer-producer',
        key_id: 'test-key-20260725',
      },
    };
    receiptMutator?.(verificationReceipt, original);
    verificationReceipt.signing.signature = signBytes(
      null,
      canonicalPacketBytes(verificationReceipt),
      packetReceiptSigningKey.privateKey,
    ).toString('base64');
    signedReceiptMutator?.(verificationReceipt, original);
    const trustPolicy = {
      schema: 'rulelink_legal_answer_packet_set_trust_policy_v1',
      status: 'active',
      issuer: verificationReceipt.signing.issuer,
      producer_commit: producerReceipt.producer_commit,
      keys: [
        {
          algorithm: 'Ed25519',
          key_id: verificationReceipt.signing.key_id,
          public_key_pem: packetReceiptPublicKeyPem,
        },
      ],
    };
    await writeFile(
      packetReceiptPath,
      canonicalBytes(verificationReceipt),
    );
    await writeFile(
      packetTrustPolicyPath,
      canonicalBytes(trustPolicy),
    );
    const catalog = await loadPublicLegalAnswerCatalog({
      appRoot,
      bundlePath,
      packetReceiptPath,
      packetSetPath,
      packetTrustPolicyPath,
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
  const journeyState = await import('../src/lib/legal-answer-journey-state.ts');
  const scenarioState = await import('../src/lib/knowledge-scenario-state.ts');
  const requireWithAliases = specifier => {
    if (specifier === '@/lib/legal-answer-journey-state') return journeyState;
    if (specifier === '@/lib/knowledge-scenario-state') return scenarioState;
    return localRequire(specifier);
  };
  new Function('require', 'module', 'exports', output)(
    requireWithAliases,
    module,
    module.exports,
  );
  return module.exports;
}

async function compileKnowledgePage({catalog, fixture}) {
  const source = await readFile(
    path.join(appRoot, 'app', 'ko', 'knowledge', '[slug]', 'page.tsx'),
    'utf8',
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: 'app/ko/knowledge/[slug]/page.tsx',
  }).outputText;
  const packet = fixture.packetSet.packets[0];
  const sources = fixture.bundle.knowledge.sources;
  const entries = packet.retrieval.canonical_content_ids.map(
    (contentId, index) => ({
      content_id: contentId,
      slug: index === 0 ? 'answer-target' : 'answer-related',
      title_ko: index === 0 ? '답변 대상 질문' : '관련 질문',
      one_line_answer_ko: '검증된 한 줄 답변입니다.',
      audience_situation_ko: '이 절차를 확인하려는 사람',
      search_intents_ko: ['절차 확인'],
      content_type: 'procedure',
      reviewed_at: '2026-07-25',
      expires_at: '2027-07-25',
      key_points_ko: ['핵심 판단'],
      body_sections: [
        {heading_ko: '판단 구조', paragraphs_ko: ['근거와 사실을 확인합니다.']},
      ],
      facts_to_check_ko: ['결정 사실'],
      action_steps_ko: ['다음 행동'],
      caution_ko: '사실관계에 따라 달라질 수 있습니다.',
    }),
  );
  const rules = packet.retrieval.rule_ids.map(ruleId => ({
    rule_id: ruleId,
    title_ko: '적용 법리',
    proposition_ko: '요건을 충족하면 법률효과가 발생합니다.',
    norm: {
      actor_ko: '신청인',
      conditions_ko: '법정 요건을 충족한 경우',
      legal_effect_ko: '법률효과가 발생합니다.',
    },
  }));
  const scenarios = packet.retrieval.scenario_ids.map(scenarioId => ({
    scenario_id: scenarioId,
    decision_fact_ko: '결론을 가르는 사실',
    question_ko: '요건을 충족했나요?',
    when_true_ko: '해당 절차를 진행할 수 있습니다.',
    when_false_ko: '다른 절차를 확인해야 합니다.',
  }));
  const entryBySlug = new Map(entries.map(entry => [entry.slug, entry]));
  const {VerifiedLegalAnswerCard} = await compileServerComponent();
  const jsxRuntime = await import('react/jsx-runtime');
  const passthrough = ({children}) => children ?? null;
  const nullComponent = () => null;
  const componentMocks = {
    '@/components/authority-reading-section': {
      AuthorityReadingSection: ({views}) =>
        jsxRuntime.jsx('section', {
          'data-authority-view-count': views.length,
          id: 'statute-reading',
        }),
    },
    '@/components/editorial-attribution': {
      EditorialAttribution: nullComponent,
    },
    '@/components/knowledge-action-workspace': {
      KnowledgeActionWorkspace: () =>
        jsxRuntime.jsx('div', {'data-action-workspace': true}),
    },
    '@/components/knowledge-follow-up-questions': {
      KnowledgeFollowUpQuestions: nullComponent,
    },
    '@/components/knowledge-reading-depth-nav': {
      KnowledgeReadingDepthNav: nullComponent,
    },
    '@/components/knowledge-reading-path': {
      KnowledgeReadingPath: nullComponent,
    },
    '@/components/knowledge-scenario-decision': {
      KnowledgeScenarioDecision: ({scenarioId}) =>
        jsxRuntime.jsx('div', {'data-scenario-id': scenarioId}),
    },
    '@/components/knowledge-source-evidence': {
      KnowledgeSourceEvidence: nullComponent,
    },
    '@/components/legal-concept-text': {
      LegalConceptLayer: passthrough,
      LegalConceptText: ({text}) => text,
    },
    '@/components/official-source-jump': {
      OfficialSourceJump: nullComponent,
    },
    '@/components/public-advertising-placeholder': {
      PublicAdvertisingPlaceholder: nullComponent,
    },
    '@/components/scenario-handoff-focus': {
      ScenarioHandoffFocus: nullComponent,
    },
    '@/components/scenario-rule-links': {
      ScenarioRuleLinks: nullComponent,
    },
    '@/components/verified-legal-answer-card': {
      VerifiedLegalAnswerCard,
    },
  };
  const libraryMocks = {
    '@/lib/change-lifecycle': {changeLifecycleLabel: value => value},
    '@/lib/content-labels': {knowledgeContentTypeLabel: value => value},
    '@/lib/legal-date': {formatKoreanLegalDate: value => value},
    '@/lib/knowledge-launch-journey': {
      buildKnowledgeLaunchJourney: ({actionSteps, factsToCheck}) => ({
        actionItems: actionSteps.map(label => ({label})),
        deadlines: [],
        evidenceItems: [],
        factsToCheck,
      }),
    },
    '@/lib/official-source-url': {
      browserOfficialSourceUrl: sourceItem => sourceItem.official_url,
    },
    '@/lib/public-legal-answer-loader': {
      loadPublicLegalAnswerForContent: contentId =>
        publicLegalAnswerForContent(catalog, contentId),
    },
    '@/lib/publication': {
      findKnowledgeEntry: slug => entryBySlug.get(slug) ?? null,
      knowledgeDetail: () => ({
        authorityAsOf: packet.as_of,
        authorityReadingUnits: [{}],
        concepts: [],
        hubs: [],
        readingPathSections: [],
        rules,
        scenarioRules: Object.fromEntries(
          scenarios.map(scenario => [scenario.scenario_id, rules]),
        ),
        scenarios,
        sources,
      }),
      listKnowledgeEntries: () => entries,
      relatedChangeBriefsForKnowledgeEntry: () => [],
    },
    '@/lib/public-rule-presentation': {
      shouldShowPublicRuleProposition: () => true,
    },
    '@/lib/public-structured-data': {
      buildKnowledgePageStructuredData: () => ({}),
    },
    '@/lib/public-trust': {
      resolveApprovedEditorialAttribution: () => null,
      resolvePublicTrustConfig: () => null,
    },
    '@/lib/site': {
      site: {name: 'RuleLink', url: 'https://example.test'},
    },
    '@/lib/structured-data': {
      serializeStructuredData: value => JSON.stringify(value),
    },
  };
  const localRequire = createRequire(import.meta.url);
  const module = {exports: {}};
  const pageRequire = request => {
    if (request === 'react/jsx-runtime') return jsxRuntime;
    if (request === 'next/navigation') {
      return {notFound: () => {
        throw new Error('not_found');
      }};
    }
    if (request.endsWith('.module.css')) {
      return new Proxy({}, {get: (_, key) => String(key)});
    }
    if (componentMocks[request]) return componentMocks[request];
    if (libraryMocks[request]) return libraryMocks[request];
    return localRequire(request);
  };
  new Function('require', 'module', 'exports', output)(
    pageRequire,
    module,
    module.exports,
  );
  return {KnowledgePage: module.exports.default, entries, sources};
}

test('생산자 검증 영수증이 packet bytes와 대상 content를 exact 결박한다', async () => {
  await assert.rejects(
    () =>
      withFixture(
        () => assert.fail('서명 뒤 바뀐 영수증이 승인되었습니다'),
        undefined,
        undefined,
        undefined,
        receipt => {
          receipt.packets[0].packet_sha256 = 'f'.repeat(64);
        },
      ),
    /packet_receipt_signature_invalid/u,
  );

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

test('실제 KnowledgePage는 대상 페이지에만 답변과 근거·분기·행동 앵커를 렌더한다', async () => {
  await withFixture(async ({catalog, fixture}) => {
    const {KnowledgePage, entries, sources} = await compileKnowledgePage({
      catalog,
      fixture,
    });
    const targetHtml = renderToStaticMarkup(
      await KnowledgePage({
        params: Promise.resolve({slug: entries[0].slug}),
      }),
    );
    assert.match(targetHtml, /data-verified-legal-answer/u);
    for (const anchor of ['scenarios', 'actions', 'sources', 'statute-reading']) {
      assert.match(targetHtml, new RegExp(`id="${anchor}"`, 'u'));
    }
    assert.match(targetHtml, /data-authority-view-count/u);

    const relatedHtml = renderToStaticMarkup(
      await KnowledgePage({
        params: Promise.resolve({slug: entries[1].slug}),
      }),
    );
    assert.doesNotMatch(relatedHtml, /data-verified-legal-answer/u);
  });
});
