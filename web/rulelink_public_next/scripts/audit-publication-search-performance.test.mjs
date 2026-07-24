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

test('운영 023의 상세·허브·법령변화 범위를 정확히 감사하고 입력이 없으면 추정값을 만들지 않는다', () => {
  const first = auditPublicationSearchPerformance(currentBundle);
  const second = auditPublicationSearchPerformance(currentBundle);
  assert.deepEqual(first, second);
  assert.deepEqual(first.coverage, {
    knowledge: 284,
    hub: 28,
    change: 11,
    total: 323,
  });
  assert.equal(first.source.snapshot_id, 'kr-knowledge-core-20260723-023');
  assert.equal(first.data_availability.search_console, 'not_provided');
  assert.equal(first.data_availability.search_volume, 'not_available_and_not_estimated');
  assert.equal(first.data_availability.advertising_rpm, 'not_available_and_not_estimated');
  assert.equal(first.pages.length, 323);
  assert.ok(first.pages.every(page => page.search_console.status === 'not_provided'));
});

test('정규화·유사도는 문장부호 차이를 제거하고 서로 다른 질문은 구분한다', () => {
  assert.equal(normalizeSearchText('손해배상, 가능할까요?'), '손해배상 가능할까요');
  assert.equal(textSimilarity('손해배상 받을 수 있나요', '손해배상 받을 수 있나요?'), 1);
  assert.ok(textSimilarity('손해배상 받을 수 있나요', '행정심판 신청 기한') < 0.5);
});

test('심각한 중복·검색어 복사·고립 링크를 정확한 근거와 함께 판정한다', () => {
  const report = auditPublicationSearchPerformance(fixtureBundle());
  const duplicated = report.pages.filter(page => page.page_type === 'knowledge');
  assert.equal(duplicated.length, 2);
  assert.ok(duplicated.every(page => ['merge', 'noindex-review'].includes(page.recommendation)));
  assert.ok(duplicated.every(page => page.nearest_duplicate.similarity >= 0.94));
  assert.ok(duplicated.every(page => page.exact_reasons.some(reason => reason.code === 'search_intent_boilerplate')));
  assert.ok(duplicated.every(page => page.exact_reasons.some(reason => reason.code === 'orphan_outbound')));
  assert.ok(duplicated.every(page => page.exact_reasons.some(reason => reason.code === 'orphan_inbound')));
  assert.equal(report.summary.author_metadata_not_declared, 4);
  assert.equal(report.summary.reviewer_metadata_not_declared, 4);
  assert.equal(report.global_findings[0].code, 'author_reviewer_metadata_schema_gap');
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
  assert.equal(report.query_cannibalization.find(item => item.source === 'gsc').pages.length, 2);
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
  assert.match(markdown, /검색량: 데이터 없음, 추정하지 않음/u);
  assert.match(markdown, /광고 RPM: 데이터 없음, 추정하지 않음/u);
  assert.match(markdown, /noindex-review.*자동 색인 제외가 아니라/u);
});
