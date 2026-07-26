import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  auditPublicationSearchPerformance,
  normalizeSearchText,
  parseGscCsv,
  parseGscJson,
  renderSearchPerformanceMarkdown,
  textSimilarity,
} from './audit-publication-search-performance.mjs';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const currentBundle = JSON.parse(await readFile(
  path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'),
  'utf8',
));

function source(coordinateId = 'coord.test.civil-0750') {
  return {
    coordinate_id: coordinateId,
    source_id: 'civil_act_ko_0750',
    law_name_ko: '민법',
    article_no: '제750조',
    official_url: 'https://www.law.go.kr/법령/민법/제750조',
    source_snapshot_id: '1234567890abcdef1234567890abcdef',
    last_verified_at: '2026-07-01T00:00:00Z',
  };
}

function entry(id, slug, title) {
  return {
    content_id: id,
    content_type: 'doctrine_explainer',
    editorial_status: 'approved',
    reviewed_at: '2026-07-01T00:00:00Z',
    expires_at: '2026-12-31T00:00:00Z',
    slug,
    title_ko: title,
    one_line_answer_ko: '손해가 발생하면 사실관계와 증거를 확인해 배상 범위를 판단합니다.',
    audience_situation_ko: '손해배상 가능성과 준비할 자료를 확인하려는 경우',
    rule_ids: [],
    scenario_ids: [],
    source_coordinate_ids: ['coord.test.civil-0750'],
    hub_ids: ['hub.test'],
    related_content_ids: [],
    key_points_ko: ['손해 발생 사실을 확인합니다.'],
    action_steps_ko: ['자료를 시간순으로 정리합니다.'],
    facts_to_check_ko: ['손해 발생 시점'],
    caution_ko: '구체적인 손해 범위는 사실관계에 따라 달라집니다.',
    search_intents_ko: [title],
    body_sections: [{
      heading_ko: '판단 기준',
      paragraphs_ko: ['손해 발생 경위와 자료를 함께 확인해야 합니다.'],
    }],
  };
}

function fixtureBundle() {
  const first = entry('content.test.one', 'test-one', '손해배상을 받을 수 있나요');
  const second = entry('content.test.two', 'test-two', '손해배상을 받을 수 있나요');
  return {
    schema: 'rulelink_published_bundle_v1',
    snapshot_id: 'snapshot-test',
    built_at: '2026-07-24T00:00:00Z',
    change_briefs: [{
      change_brief_id: 'change.test',
      slug: 'test-change',
      title_ko: '손해배상 법령이 바뀌었습니다',
      summary_ko: '손해배상 절차의 일부가 바뀌었습니다.',
      editorial_status: 'approved',
      reviewed_at: '2026-07-01T00:00:00Z',
      expires_at: '2026-12-31T00:00:00Z',
      affected_audiences: ['손해를 입은 사람'],
      changed_points: ['신청 자료가 달라집니다.', '적용 시점이 달라집니다.'],
      action_checklist: ['시행일을 확인합니다.', '자료를 준비합니다.'],
      assertion_ids: ['assertion.test'],
      source_event_ids: ['event.test'],
      old_snapshot_ids: ['snapshot.old'],
      new_snapshot_ids: ['snapshot.new'],
    }],
    knowledge: {
      sources: [source()],
      topic_hubs: [{
        hub_id: 'hub.test',
        slug: 'test',
        title_ko: '손해배상',
        description_ko: '손해가 발생한 뒤 책임과 배상 범위, 필요한 자료를 단계별로 확인합니다.',
        content_ids: [first.content_id, second.content_id],
      }],
      rule_cards: [],
      scenario_branches: [],
      content_entries: [first, second],
      concept_cards: [],
    },
  };
}

test('운영 024의 상세·허브·법령변화 범위를 snapshot-bound로 감사하고 입력이 없으면 추정값을 만들지 않는다', () => {
  const first = auditPublicationSearchPerformance(currentBundle);
  const second = auditPublicationSearchPerformance(currentBundle);
  assert.deepEqual(first, second);
  assert.deepEqual(first.coverage, {
    knowledge: 284,
    hub: 28,
    change: 11,
    total: 323,
  });
  assert.equal(first.source.snapshot_id, 'kr-knowledge-core-20260726-024');
  assert.equal(first.data_availability.search_console, 'not_provided');
  assert.equal(first.data_availability.search_volume, 'not_available_and_not_estimated');
  assert.equal(first.data_availability.advertising_rpm, 'not_available_and_not_estimated');
  assert.equal(first.pages.length, 323);
  assert.ok(first.pages.every(page => page.search_console.status === 'not_provided'));
  assert.equal(first.summary.measured_pages, 0);
  assert.equal(first.summary.not_provided_pages, 323);
  assert.deepEqual(first.summary.action_counts, {
    'noindex-review': 0,
    merge: 0,
    improve: 2,
    keep: 321,
  });
  assert.equal(first.summary.orphan_outbound, 0);
  assert.equal(first.summary.orphan_inbound, 0);
  assert.equal(first.summary.weak_internal_link, 0);
  assert.equal(first.summary.verified_official_source_pages, 295);
  assert.equal(first.summary.verified_official_source_links, 747);
  assert.equal(first.summary.knowledge_verified_official_source_links, 724);
  assert.equal(first.summary.change_verified_official_source_links, 23);
  assert.equal(first.summary.direct_knowledge_verified_official_source_links, 659);
  assert.equal(first.summary.knowledge_graph_expanded_source_pages, 19);
  assert.deepEqual(
    first.pages
      .filter(page => page.recommendation === 'improve')
      .map(page => page.id)
      .sort(),
    [
      'content.2026-livelihood-account-protection',
      'content.fraudulent-transfer-before-enforcement',
    ],
  );
  assert.ok(first.pages.filter(page => page.recommendation === 'improve').every(
    page => page.exact_reasons.every(reason => (
      reason.code === 'audience_situation_missing'
      || reason.code === 'search_intent_boilerplate'
    )),
  ));
  const changes = first.pages.filter(page => page.page_type === 'change');
  assert.equal(changes.length, 11);
  assert.ok(changes.every(page => page.recommendation === 'keep'));
  assert.ok(changes.every(page => page.internal_link_evidence.related_knowledge_count > 0));
  assert.ok(changes.every(page => page.internal_link_evidence.verified_official_source_count > 0));
  assert.ok(changes.every(page => !page.exact_reasons.some(item => (
    item.code === 'change_weak_internal_link' || item.code === 'change_verified_official_source_unavailable'
  ))));
  const hubs = first.pages.filter(page => page.page_type === 'hub');
  assert.equal(
    hubs.reduce((total, page) => total + page.internal_link_evidence.journey_count, 0),
    284,
  );
  assert.equal(
    hubs.reduce((total, page) => total + page.internal_link_evidence.decision_path_count, 0),
    254,
  );
  assert.equal(
    hubs.reduce((total, page) => total + page.internal_link_evidence.connected_hub_count, 0),
    86,
  );
});

test('정규화·유사도는 문장부호 차이를 제거하고 서로 다른 질문은 구분한다', () => {
  assert.equal(normalizeSearchText('손해배상, 가능할까요?'), '손해배상 가능할까요');
  assert.equal(textSimilarity('손해배상 받을 수 있나요', '손해배상 받을 수 있나요?'), 1);
  assert.ok(textSimilarity('손해배상 받을 수 있나요', '행정심판 신청 기한') < 0.5);
});

test('심각한 중복·검색어 복사를 판정하되 같은 허브의 실제 다음 읽기를 고립으로 오인하지 않는다', () => {
  const report = auditPublicationSearchPerformance(fixtureBundle());
  const duplicated = report.pages.filter(page => page.page_type === 'knowledge');
  assert.equal(duplicated.length, 2);
  assert.ok(duplicated.every(page => ['merge', 'noindex-review'].includes(page.recommendation)));
  assert.ok(duplicated.every(page => page.nearest_duplicate.similarity >= 0.94));
  assert.ok(duplicated.every(page => page.exact_reasons.some(reason => reason.code === 'search_intent_boilerplate')));
  assert.ok(duplicated.every(page => !page.exact_reasons.some(reason => reason.code === 'orphan_outbound')));
  assert.ok(duplicated.every(page => !page.exact_reasons.some(reason => reason.code === 'orphan_inbound')));
  assert.ok(duplicated.every(page => page.internal_link_evidence.outbound === 1));
  assert.ok(duplicated.every(page => page.internal_link_evidence.hub_inbound === 1));
  assert.ok(duplicated.every(page => (
    page.internal_link_evidence.projection === 'runtime_related_reading_and_knowledge_detail_graph'
  )));
  assert.equal(report.summary.author_metadata_not_declared, 4);
  assert.equal(report.summary.reviewer_metadata_not_declared, 4);
  assert.equal(report.global_findings[0].code, 'author_reviewer_metadata_schema_gap');
});

test('typed relation과 교차 허브 연결은 런타임 다음 읽기와 같은 방향으로 집계한다', () => {
  const bundle = fixtureBundle();
  const [first, second] = bundle.knowledge.content_entries;
  first.hub_ids = ['hub.first'];
  second.hub_ids = ['hub.second'];
  first.related_edges = [{
    target_kind: 'content',
    target_id: second.content_id,
    relation_type: 'procedure',
    label_ko: '다음 절차',
  }];
  first.related_content_ids = [];
  bundle.knowledge.topic_hubs = [
    {
      hub_id: 'hub.first',
      slug: 'first',
      title_ko: '첫 허브',
      description_ko: '첫 번째 판단에서 확인할 내용과 다음 절차를 단계별로 안내합니다.',
      content_ids: [first.content_id],
    },
    {
      hub_id: 'hub.second',
      slug: 'second',
      title_ko: '둘째 허브',
      description_ko: '첫 판단 이후 이어지는 신청 절차와 필요한 자료를 단계별로 안내합니다.',
      content_ids: [second.content_id],
    },
  ];

  const report = auditPublicationSearchPerformance(bundle);
  const firstPage = report.pages.find(page => page.id === first.content_id);
  const secondPage = report.pages.find(page => page.id === second.content_id);
  assert.equal(firstPage.internal_link_evidence.outbound, 1);
  assert.equal(secondPage.internal_link_evidence.detail_inbound, 1);
  assert.ok(!firstPage.exact_reasons.some(reason => reason.code === 'orphan_outbound'));
  assert.ok(!secondPage.exact_reasons.some(reason => reason.code === 'orphan_inbound'));
  const firstHub = report.pages.find(page => page.id === 'hub.first');
  assert.equal(firstHub.internal_link_evidence.connected_hub_count, 1);
  assert.equal(firstHub.internal_link_evidence.journey_count, 1);
});

test('재검토 기한이 지난 상세과 그 링크는 런타임처럼 공개 투영에서 제외한다', () => {
  const bundle = fixtureBundle();
  const [first, expired] = bundle.knowledge.content_entries;
  const activeSecond = entry('content.test.active-two', 'active-two', '두 번째 손해 자료는 어떻게 준비하나요');
  const activeThird = entry('content.test.active-three', 'active-three', '세 번째 손해 절차는 어떻게 진행하나요');
  first.title_ko = '첫 번째 손해 절차는 무엇인가요';
  first.search_intents_ko = ['첫 손해 절차 확인', '손해 자료 준비 순서', '배상 절차 시작 방법'];
  activeSecond.search_intents_ko = ['두 번째 손해 자료', '손해 증거 정리법', '배상 자료 제출'];
  activeThird.search_intents_ko = ['세 번째 손해 절차', '손해 절차 진행', '배상 후속 절차'];
  expired.expires_at = '2026-07-23T23:59:59Z';
  first.related_content_ids = [expired.content_id, activeSecond.content_id, activeThird.content_id];
  activeSecond.related_content_ids = [first.content_id];
  activeThird.related_content_ids = [first.content_id];
  bundle.knowledge.content_entries.push(activeSecond, activeThird);
  bundle.knowledge.topic_hubs[0].content_ids.push(activeSecond.content_id, activeThird.content_id);

  const report = auditPublicationSearchPerformance(bundle);
  assert.equal(report.coverage.knowledge, 3);
  assert.ok(!report.pages.some(page => page.id === expired.content_id));
  const firstPage = report.pages.find(page => page.id === first.content_id);
  assert.deepEqual(firstPage.internal_link_evidence.hidden, [expired.content_id]);
  assert.ok(firstPage.exact_reasons.some(reason => reason.code === 'hidden_internal_link_target'));
  assert.equal(firstPage.recommendation, 'improve');
  assert.notEqual(firstPage.recommendation, 'merge');
  assert.notEqual(firstPage.recommendation, 'noindex-review');

  const cleanBundle = structuredClone(bundle);
  cleanBundle.knowledge.content_entries.find(entry => entry.content_id === first.content_id)
    .related_content_ids = [activeSecond.content_id, activeThird.content_id];
  const cleanPage = auditPublicationSearchPerformance(cleanBundle).pages
    .find(page => page.id === first.content_id);
  assert.equal(
    cleanPage.axis_scores.internal_links - firstPage.axis_scores.internal_links,
    10,
  );
  assert.equal(cleanPage.recommendation, 'keep');
});

test('공식원문 수는 상세 런타임 그래프와 URL 투영을 함께 재사용해 법리·사실분기·개념 근거까지 계산한다', () => {
  const bundle = fixtureBundle();
  bundle.knowledge.sources[0].official_url =
    'https://www.law.go.kr/LSW/lawView.do?lawId=001692';
  const [first] = bundle.knowledge.content_entries;
  first.rule_ids = ['rule.test'];
  first.scenario_ids = ['scenario.test'];
  bundle.knowledge.rule_cards = [{
    rule_id: 'rule.test',
    source_coordinate_ids: ['coord.test.rule'],
  }];
  bundle.knowledge.scenario_branches = [{
    scenario_id: 'scenario.test',
    rule_ids: ['rule.test'],
    source_coordinate_ids: ['coord.test.scenario'],
  }];
  bundle.knowledge.concept_cards = [{
    concept_id: 'concept.test',
    related_content_ids: [first.content_id],
    source_coordinate_ids: [],
    assertions: [{
      source_coordinate_ids: ['coord.test.concept-assertion'],
    }],
  }];
  bundle.knowledge.sources.push(
    source('coord.test.rule'),
    source('coord.test.scenario'),
    source('coord.test.concept-assertion'),
  );
  const report = auditPublicationSearchPerformance(bundle);
  const knowledgePages = report.pages.filter(page => page.page_type === 'knowledge');
  const firstPage = knowledgePages.find(page => page.id === first.content_id);
  assert.equal(firstPage.internal_link_evidence.direct_source_count, 1);
  assert.equal(firstPage.internal_link_evidence.direct_verified_official_source_count, 1);
  assert.equal(firstPage.internal_link_evidence.ui_visible_source_count, 4);
  assert.equal(firstPage.internal_link_evidence.graph_expanded_source_count, 3);
  assert.equal(firstPage.internal_link_evidence.verified_official_source_count, 4);
  assert.equal(
    firstPage.internal_link_evidence.projection,
    'runtime_related_reading_and_knowledge_detail_graph',
  );
  assert.ok(knowledgePages.every(page => !page.exact_reasons.some(
    reason => reason.code === 'official_source_url_missing',
  )));
});

test('Search Console CSV는 따옴표·퍼센트·쉼표 숫자를 읽고 URL별 실측치를 합산한다', () => {
  const rows = parseGscCsv([
    'Query,Page,Clicks,Impressions,CTR,Position',
    '"손해배상, 신청",https://rulelink.lolphysical.xyz/ko/knowledge/test-one?utm_source=export,"1,200","12,000",10%,3.5',
    '손해배상 신청,https://rulelink.lolphysical.xyz/ko/knowledge/test-two,30,300,10%,5',
  ].join('\n'));
  assert.deepEqual(rows[0], {
    query: '손해배상, 신청',
    page: 'https://rulelink.lolphysical.xyz/ko/knowledge/test-one?utm_source=export',
    clicks: 1200,
    impressions: 12000,
    ctr: 0.1,
    position: 3.5,
  });
  const report = auditPublicationSearchPerformance(fixtureBundle(), {gscRows: rows});
  const first = report.pages.find(page => page.id === 'content.test.one');
  assert.equal(first.search_console.status, 'measured');
  assert.equal(first.search_console.impressions, 12000);
  assert.equal(first.search_console.clicks, 1200);
  assert.equal(first.search_console.ctr, 0.1);
  assert.equal(report.summary.measured_query_cannibalization, 1);
  assert.equal(report.summary.measured_pages, 2);
  assert.equal(report.summary.not_provided_pages, 2);
  assert.equal(report.query_cannibalization.find(item => item.source === 'gsc').pages.length, 2);
});

test('Search Console 부분 coverage는 실제 URL 매칭 페이지 하나만 measured로 표시한다', () => {
  const firstEntry = currentBundle.knowledge.content_entries[0];
  const matchedUrl = `https://rulelink.lolphysical.xyz/ko/knowledge/${firstEntry.slug}`;
  const report = auditPublicationSearchPerformance(currentBundle, {gscRows: [{
    query: '부분 coverage 검색',
    page: matchedUrl,
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
  }]});
  assert.equal(report.summary.measured_pages, 1);
  assert.equal(report.summary.not_provided_pages, 322);
  assert.equal(report.pages.filter(page => page.search_console.status === 'measured').length, 1);
  const measured = report.pages.find(page => page.id === firstEntry.content_id);
  assert.equal(measured.search_console.status, 'measured');
  assert.equal(measured.search_console.matched_rows, 1);
  assert.equal(measured.search_console.clicks, 0);
  assert.equal(measured.search_console.impressions, 0);
});

test('전부 unmatched인 Search Console 입력은 페이지 실측값을 만들지 않고 unmatched만 남긴다', () => {
  const report = auditPublicationSearchPerformance(currentBundle, {gscRows: [{
    query: '없는 주소',
    page: 'https://rulelink.lolphysical.xyz/not-in-publication',
    clicks: 10,
    impressions: 100,
    ctr: 0.1,
    position: 2,
  }]});
  assert.equal(report.data_availability.search_console, 'provided');
  assert.equal(report.data_availability.unmatched_search_console_rows, 1);
  assert.equal(report.summary.measured_pages, 0);
  assert.equal(report.summary.not_provided_pages, 323);
  assert.ok(report.pages.every(page => page.search_console.status === 'not_provided'));
});

test('Search Console API 응답의 query/page 차원 순서가 달라도 URL을 식별한다', () => {
  const rows = parseGscJson({
    rows: [{
      keys: ['https://rulelink.lolphysical.xyz/ko/knowledge/test-one', '손해배상 준비'],
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      position: 4.2,
    }],
  });
  assert.deepEqual(rows[0], {
    query: '손해배상 준비',
    page: 'https://rulelink.lolphysical.xyz/ko/knowledge/test-one',
    clicks: 2,
    impressions: 20,
    ctr: 0.1,
    position: 4.2,
  });
});

test('한국어 Markdown은 실행 후보와 데이터 부재·비추정 원칙을 함께 기록한다', () => {
  const report = auditPublicationSearchPerformance(fixtureBundle());
  const markdown = renderSearchPerformanceMarkdown(report, {limit: 2});
  assert.match(markdown, /우선 실행 대상 2개/u);
  assert.match(markdown, /검색콘솔: 입력 없음/u);
  assert.match(markdown, /검색콘솔 URL 결합: 실측 0개 \/ 미입력 4개/u);
  assert.match(markdown, /검색량: 데이터 없음, 추정하지 않음/u);
  assert.match(markdown, /광고 RPM: 데이터 없음, 추정하지 않음/u);
  assert.match(markdown, /검증된 공식원문: 2개 페이지 \/ 2개 링크/u);
  assert.match(markdown, /noindex-review.*자동 색인 제외가 아니라/u);
});
