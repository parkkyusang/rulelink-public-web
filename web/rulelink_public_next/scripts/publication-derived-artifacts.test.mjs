import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  buildMaintenanceIndex,
  buildSourceCheckQueue,
  sha256,
  sha256Canonical,
  validateMaintenanceIndex,
  validateSourceCheckQueue,
  validateSourceTextLibrary,
} from './publication-derived-core.mjs';

test('같은 근거를 쓰는 여러 콘텐츠는 하나의 검토 영수증을 공유한다', () => {
  const bundle = fixtureBundle();
  const sourceTextLibrary = fixtureSourceTextLibrary(bundle);
  const index = buildMaintenanceIndex({
    bundle,
    generatedAt: '2026-07-26T00:00:00.000Z',
    sourceTextLibrary,
  });
  assert.equal(index.source_receipts.length, 2);
  assert.equal(index.content_views.length, 3);
  assert.equal(index.counts.current, 3);
  const [first, second] = index.content_views;
  assert.deepEqual(
    first.source_review_receipt_ids,
    second.source_review_receipt_ids,
    '같은 법률 근거를 사용하는 글은 페이지별 재검토 영수증을 만들지 않습니다.',
  );
  assert.equal(
    first.next_check_at,
    '2027-01-17T00:00:00.000Z',
    '검증된 조문 문언은 근거 확인일 기준 180일 장기점검을 사용합니다.',
  );
  assert.equal(
    first.status,
    'current',
    '과거의 콘텐츠별 expires_at이 아니라 근거 영수증으로 현재 상태를 계산합니다.',
  );
});

test('근거 버전 변경은 역의존 관계로 영향받는 콘텐츠만 무효화한다', () => {
  const before = fixtureBundle();
  const after = structuredClone(before);
  const changed = after.knowledge.sources[0];
  changed.source_snapshot_id = 'snapshot:changed';
  changed.last_verified_at = '2026-07-25T00:00:00.000Z';
  const index = buildMaintenanceIndex({
    bundle: after,
    generatedAt: '2026-07-26T00:00:00.000Z',
    previousBundle: before,
    sourceTextLibrary: fixtureSourceTextLibrary(after),
  });
  const byId = new Map(index.content_views.map(view => [view.content_id, view]));
  assert.equal(byId.get('content.one').status, 'invalidated');
  assert.equal(byId.get('content.two').status, 'invalidated');
  assert.deepEqual(byId.get('content.three').invalidated_by, []);
  assert.equal(byId.get('content.three').status, 'current');
});

test('증분 근거 점검 큐는 출처별 한 작업만 만들고 변경감지에 모델 토큰을 쓰지 않는다', () => {
  const bundle = fixtureBundle();
  const sourceTextLibrary = fixtureSourceTextLibrary(bundle);
  const index = buildMaintenanceIndex({
    bundle,
    generatedAt: '2027-01-01T00:00:00.000Z',
    sourceTextLibrary,
  });
  const queue = buildSourceCheckQueue({
    bundle,
    generatedAt: '2027-01-01T00:00:00.000Z',
    maintenanceIndex: index,
  });
  assert.equal(queue.items.length, 2);
  assert.equal(queue.counts.total, 2);
  assert.ok(queue.items.every(item => (
    item.detection_policy.deterministic_only
    && item.detection_policy.llm_allowed === false
    && item.detection_policy.llm_token_budget === 0
  )));
  const shared = queue.items.find(item => item.coordinate_id === 'coord.one');
  assert.equal(shared.dependency_selector.dependent_content_count, 2);
  assert.deepEqual(validateSourceCheckQueue(queue, index, bundle), []);
});

test('증분 근거 점검 큐는 전체 콘텐츠 ID를 복제하지 않고 선택자와 해시로 역의존성을 넘긴다', () => {
  const bundle = fixtureBundle();
  const sourceTextLibrary = fixtureSourceTextLibrary(bundle);
  const index = buildMaintenanceIndex({
    bundle,
    generatedAt: '2027-01-01T00:00:00.000Z',
    sourceTextLibrary,
  });
  const queue = buildSourceCheckQueue({
    bundle,
    generatedAt: '2027-01-01T00:00:00.000Z',
    maintenanceIndex: index,
  });
  assert.doesNotMatch(JSON.stringify(queue), /dependent_content_ids/u);
  const changed = structuredClone(queue);
  changed.items[0].detection_policy.llm_token_budget = 1;
  assert.match(
    validateSourceCheckQueue(changed, index, bundle).join('\n'),
    /source_check_queue_projection_mismatch|source_check_queue_detection_not_zero_token/u,
  );
});

test('법리와 사실분기가 추가한 근거도 콘텐츠 의존성에 포함한다', () => {
  const bundle = fixtureBundle();
  bundle.knowledge.content_entries[0].source_coordinate_ids = [];
  const index = buildMaintenanceIndex({
    bundle,
    generatedAt: '2026-07-26T00:00:00.000Z',
    sourceTextLibrary: fixtureSourceTextLibrary(bundle),
  });
  const content = index.content_views.find(view => view.content_id === 'content.one');
  assert.deepEqual(content.source_coordinate_ids, ['coord.one']);
});

test('파생 구조는 번들·스냅샷·원문 해시 변조를 차단한다', () => {
  const bundle = fixtureBundle();
  const sourceTextLibrary = fixtureSourceTextLibrary(bundle);
  const index = buildMaintenanceIndex({
    bundle,
    generatedAt: '2026-07-26T00:00:00.000Z',
    sourceTextLibrary,
  });
  assert.deepEqual(validateSourceTextLibrary(sourceTextLibrary, bundle), []);
  assert.deepEqual(validateMaintenanceIndex(index, bundle, sourceTextLibrary), []);

  const changedText = structuredClone(sourceTextLibrary);
  changedText.texts[0].official_text_ko = '변조된 문언';
  assert.match(
    validateSourceTextLibrary(changedText, bundle).join('\n'),
    /source_text_hash_mismatch/,
  );

  const changedIndex = structuredClone(index);
  changedIndex.publication_bundle_sha256 = '0'.repeat(64);
  assert.match(
    validateMaintenanceIndex(changedIndex, bundle, sourceTextLibrary).join('\n'),
    /maintenance_bundle_hash_mismatch/,
  );

  const missingState = structuredClone(sourceTextLibrary);
  missingState.unresolved = [];
  missingState.coverage.unresolved_statute_coordinates = 0;
  assert.match(
    validateSourceTextLibrary(missingState, bundle).join('\n'),
    /source_text_state_missing:coord\.two/,
  );

  const conflictingState = structuredClone(sourceTextLibrary);
  conflictingState.unresolved.push({
    coordinate_id: 'coord.one',
    reason: 'forced_conflict',
  });
  conflictingState.coverage.unresolved_statute_coordinates = 2;
  assert.match(
    validateSourceTextLibrary(conflictingState, bundle).join('\n'),
    /source_text_state_conflict:coord\.one/,
  );

  const wrongCoverage = structuredClone(sourceTextLibrary);
  wrongCoverage.coverage.bound_statute_coordinates = 2;
  assert.match(
    validateSourceTextLibrary(wrongCoverage, bundle).join('\n'),
    /source_text_coverage_counts_mismatch/,
  );
});

test('증분 점검 큐의 정책값이 비정상이면 예외 대신 명시적 검증 오류로 닫는다', () => {
  const bundle = fixtureBundle();
  const sourceTextLibrary = fixtureSourceTextLibrary(bundle);
  const index = buildMaintenanceIndex({
    bundle,
    generatedAt: '2027-01-01T00:00:00.000Z',
    sourceTextLibrary,
  });
  const queue = buildSourceCheckQueue({
    bundle,
    generatedAt: '2027-01-01T00:00:00.000Z',
    maintenanceIndex: index,
  });
  queue.policy.attention_window_days = 'thirty';
  assert.deepEqual(
    validateSourceCheckQueue(queue, index, bundle),
    ['source_check_queue_attention_window_invalid'],
  );
});

test('사용자 화면은 내부 스냅샷·패킷 용어 대신 검증된 조문 문언을 표시한다', async () => {
  const [component, authority, page, publication, sync] = await Promise.all([
    readFile(new URL('../src/components/knowledge-source-evidence.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/authority-reading-section.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/ko/knowledge/[slug]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/publication.ts', import.meta.url), 'utf8'),
    readFile(new URL('./sync-publication.mjs', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(component, /출판 원문본|별도 답변 패킷|패킷 검증 상태|저장된 공식 원문/u);
  assert.doesNotMatch(component, /source\.source_snapshot_id/u);
  assert.match(component, /확인한 조문 문언/u);
  assert.match(component, /<p>\{sourceText\}<\/p>/u);
  assert.match(component, /data-source-text-state="verified_text"/u);
  assert.match(component, /data-source-text-state="link_only"/u);
  assert.match(component, /공식 사이트에서 원문 보기/u);
  assert.match(authority, /이 글의 판단에 사용한 조문을 항·호별로 확인합니다/u);
  assert.doesNotMatch(authority, /결박|패킷|스냅샷|원장 식별자/u);
  assert.match(page, /maintenance\?\.next_check_at/u);
  assert.match(page, /다음 점검기한/u);
  assert.doesNotMatch(page, /<b>근거 점검<\/b>/u);
  assert.match(page, /sourceTexts=\{publicSourceTexts\}/u);
  assert.match(publication, /visibleKnowledgeEntriesForBundle/u);
  assert.match(sync, /source-text-library\.json/u);
  assert.match(sync, /maintenance-index\.json/u);
  assert.doesNotMatch(sync, /source-check-queue\.json/u);
});

test('공식 원문 링크는 시각적으로 외부 링크 아이콘을 쓰고 새 탭 의미는 접근성 이름에 보존한다', async () => {
  const [evidence, authority, library, icon] = await Promise.all([
    readFile(new URL('../src/components/knowledge-source-evidence.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/authority-reading-card.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/knowledge-source-library.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/external-link-icon.tsx', import.meta.url), 'utf8'),
  ]);
  for (const component of [evidence, authority, library]) {
    assert.match(component, /<ExternalLinkIcon \/>/u);
    assert.match(component, /aria-label=.*새 탭으로 열기/u);
    assert.doesNotMatch(component, />\(새 탭\)</u);
  }
  assert.match(icon, /aria-hidden="true"/u);
  assert.match(icon, /focusable="false"/u);
});

function fixtureBundle() {
  return {
    schema: 'rulelink_published_bundle_v1',
    snapshot_id: 'snapshot.fixture',
    built_at: '2026-07-26T00:00:00.000Z',
    source_snapshot_id: 'source.fixture',
    cards: [],
    assertions: [],
    change_briefs: [],
    file_hashes: {},
    knowledge: {
      schema: 'rulelink_public_knowledge_index_v1',
      sources: [
        {
          coordinate_id: 'coord.one',
          source_id: 'law_ko_0001',
          law_name_ko: '시험법',
          article_no: '제1조',
          official_url: 'https://www.law.go.kr/법령/시험법/제1조',
          source_snapshot_id: 'snapshot:one',
          last_verified_at: '2026-07-21T00:00:00.000Z',
        },
        {
          coordinate_id: 'coord.two',
          source_id: 'law_ko_0002',
          law_name_ko: '시험법',
          article_no: '제2조',
          official_url: 'https://www.law.go.kr/법령/시험법/제2조',
          source_snapshot_id: 'snapshot:two',
          last_verified_at: '2026-07-21T00:00:00.000Z',
        },
      ],
      rule_cards: [
        {
          rule_id: 'rule.one',
          source_coordinate_ids: ['coord.one'],
        },
        {
          rule_id: 'rule.two',
          source_coordinate_ids: ['coord.two'],
        },
      ],
      scenario_branches: [
        {
          scenario_id: 'scenario.one',
          rule_ids: ['rule.one'],
          source_coordinate_ids: [],
        },
      ],
      concept_cards: [],
      topic_hubs: [],
      content_entries: [
        content('content.one', ['rule.one'], ['scenario.one'], []),
        content('content.two', ['rule.one'], [], ['coord.one']),
        content('content.three', ['rule.two'], [], ['coord.two']),
      ],
    },
  };
}

function content(contentId, ruleIds, scenarioIds, sourceIds) {
  return {
    content_id: contentId,
    reviewed_at: '2026-07-22T00:00:00.000Z',
    expires_at: '2026-07-23T00:00:00.000Z',
    rule_ids: ruleIds,
    scenario_ids: scenarioIds,
    concept_ids: [],
    source_coordinate_ids: sourceIds,
  };
}

function fixtureSourceTextLibrary(bundle) {
  const text = '제1조 시험 문언';
  const sourceHash = `sha256:${sha256(text)}`;
  const textId = `text.${sourceHash.slice('sha256:'.length)}`;
  bundle.knowledge.sources[0].source_snapshot_id =
    `snapshot:${sourceHash.slice('sha256:'.length, 'sha256:'.length + 32)}`;
  const library = {
    schema: 'rulelink_public_source_text_library_v1',
    generated_at: bundle.built_at,
    publication_snapshot_id: bundle.snapshot_id,
    publication_bundle_sha256: sha256Canonical(bundle),
    source_ledger: {
      kind: 'active_sqlite_export',
      database_sha256: '1'.repeat(64),
      exported_at: bundle.built_at,
    },
    coverage: {
      publication_statute_coordinates: 2,
      bound_statute_coordinates: 1,
      unique_verified_texts: 1,
      unresolved_statute_coordinates: 1,
    },
    texts: [{
      text_id: textId,
      source_id: 'law_ko_0001',
      source_hash: sourceHash,
      law_name_ko: '시험법',
      article_no: '제1조',
      article_title_ko: '',
      official_text_ko: text,
      effective_date: null,
      retrieved_at: '2026-07-20T00:00:00.000Z',
    }],
    bindings: [{
      coordinate_id: 'coord.one',
      public_source_snapshot_id: bundle.knowledge.sources[0].source_snapshot_id,
      text_id: textId,
      match_method: 'source_id',
      bound_at: bundle.knowledge.sources[0].last_verified_at,
    }],
    unresolved: [{
      coordinate_id: 'coord.two',
      reason: 'ledger_article_missing',
    }],
  };
  return library;
}
