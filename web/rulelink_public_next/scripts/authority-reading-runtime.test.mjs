import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  authorityRouteParams,
  projectAuthorityReadingUnits,
  resolveAuthorityReadingForEntry,
} from '../src/lib/authority-reading.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function authorityFixture(articleNumbers = ['0025', '0026', '0031', '0032', '0034']) {
  const sources = articleNumbers.map(articleNo => ({
    coordinate_id: `coord.test-${articleNo}`,
    source_id: `test_${articleNo}`,
    source_kind: 'statute',
    law_key: 'test-law',
    law_name_ko: '시험법',
    article_no: articleNo,
    source_snapshot_id: `snapshot-${articleNo}`.padEnd(32, '0'),
    source_version_key: '2026-current',
    official_url: `https://www.law.go.kr/법령/시험법/제${Number(articleNo)}조`,
    last_verified_at: '2026-07-23T00:00:00+09:00',
  }));
  const source_authority_units = articleNumbers.map(articleNo => ({
    source_authority_unit_id: `source-unit.${articleNo}`,
    version_bridge_id: `bridge.${articleNo}`,
    source_coordinate_id: `coord.test-${articleNo}`,
    source_snapshot_id: `snapshot-${articleNo}`.padEnd(32, '0'),
    source_version_key: '2026-current',
    unit_kind: 'article',
    locator: {article_no: articleNo},
    locator_key: 'article',
    ordinal: 1,
    official_text_ko: `시험법 제${Number(articleNo)}조 원문`,
    official_text_hash: `hash-${articleNo}`,
    validation_status: 'verified',
  }));
  const authority_reading_units = articleNumbers.map((articleNo, index) => ({
    authority_reading_unit_id: `authority.test-${articleNo}`,
    title_ko: `시험법 제${Number(articleNo)}조가 답하는 질문`,
    route_key: {law_key: 'test-law', article_no: articleNo},
    source_coordinate_id: `coord.test-${articleNo}`,
    source_snapshot_id: `snapshot-${articleNo}`.padEnd(32, '0'),
    source_version_key: '2026-current',
    time_state: index === 1 ? 'future_effective' : 'current_as_of_review',
    effective_from: index === 1
      ? '2027-01-01T00:00:00+09:00'
      : '2026-01-01T00:00:00+09:00',
    summary_ko: `제${Number(articleNo)}조의 쉬운 답`,
    anchors: [{
      anchor_id: `anchor.${articleNo}`,
      source_authority_unit_id: `source-unit.${articleNo}`,
      locator_key: 'article',
      official_text_hash: `hash-${articleNo}`,
      plain_heading_ko: `제${Number(articleNo)}조 전체`,
      explanation_ko: `제${Number(articleNo)}조 쉬운 설명`,
    }],
    logical_groups: [{
      logical_group_id: `group.${articleNo}`,
      role: 'requirement',
      operator: 'all',
      title_ko: '모두 확인할 요건',
      ordinal: 1,
      anchor_ids: [`anchor.${articleNo}`],
    }],
    explanation_paragraphs: [{
      explanation_paragraph_id: `paragraph.${articleNo}`,
      text_ko: '결론을 바꾸는 사실을 확인합니다.',
      logical_group_id: `group.${articleNo}`,
      anchor_ids: [`anchor.${articleNo}`],
    }],
    citation_edges: [],
    editorial_status: 'approved',
  }));
  const authority_bindings = articleNumbers.slice(0, 2).map(articleNo => ({
    binding_id: `binding.${articleNo}`,
    from_kind: 'content',
    from_id: 'content.test',
    to_kind: 'authority_reading_unit',
    to_authority_reading_unit_id: `authority.test-${articleNo}`,
    anchor_ids: [`anchor.${articleNo}`],
  }));
  return {
    sources,
    source_authority_units,
    source_version_bridges: [],
    authority_reading_units,
    authority_bindings,
    content_entries: [],
    topic_hubs: [],
    rule_cards: [],
    scenario_branches: [],
  };
}

test('승인된 조문 읽기 5개를 정본 순서와 안정 경로로 투영한다', () => {
  const views = projectAuthorityReadingUnits(authorityFixture());
  assert.equal(views.length, 5);
  assert.deepEqual(
    authorityRouteParams(views).map(item => `${item.lawKey}/${item.articleNo}`),
    ['test-law/0025', 'test-law/0026', 'test-law/0031', 'test-law/0032', 'test-law/0034'],
  );
  assert.equal(views[0].cardDomId, 'authority-test-law-0025');
  assert.equal(views[0].anchors[0].domId, 'authority-test-law-0025-article');
  assert.equal(views[0].timeLabelKo, '현행');
  assert.equal(views[1].timeLabelKo, '시행예정 2027-01-01');
});

test('콘텐츠의 명시 binding만 사용하고 binding 순서와 anchor 강조를 보존한다', () => {
  const knowledge = authorityFixture();
  const entry = {
    content_id: 'content.test',
    authority_binding_ids: ['binding.0026', 'binding.0025'],
  };
  const views = resolveAuthorityReadingForEntry(knowledge, entry);
  assert.deepEqual(
    views.map(view => view.authorityReadingUnitId),
    ['authority.test-0026', 'authority.test-0025'],
  );
  assert.equal(views[0].anchors[0].isBound, true);
  assert.equal(views[1].anchors[0].isBound, true);
  assert.deepEqual(
    resolveAuthorityReadingForEntry(knowledge, {content_id: 'content.test'}),
    [],
    '명시 binding이 없으면 source나 조문번호로 추측하지 않습니다.',
  );
});

test('같은 조문의 현행·시행예정판을 함께 결박해도 카드와 항·호 DOM ID가 모두 고유하다', () => {
  const knowledge = authorityFixture(['0025']);
  knowledge.sources.push({
    ...knowledge.sources[0],
    coordinate_id: 'coord.test-0025-future',
    source_id: 'test_0025_future',
    source_snapshot_id: 'snapshot-0025-future'.padEnd(32, '0'),
    source_version_key: '2027-future',
  });
  knowledge.source_authority_units.push({
    ...knowledge.source_authority_units[0],
    source_authority_unit_id: 'source-unit.0025-future',
    source_coordinate_id: 'coord.test-0025-future',
    source_snapshot_id: 'snapshot-0025-future'.padEnd(32, '0'),
    source_version_key: '2027-future',
    version_bridge_id: 'bridge.0025-future',
  });
  knowledge.authority_reading_units.push({
    ...knowledge.authority_reading_units[0],
    authority_reading_unit_id: 'authority.test-0025-future',
    source_coordinate_id: 'coord.test-0025-future',
    source_snapshot_id: 'snapshot-0025-future'.padEnd(32, '0'),
    source_version_key: '2027-future',
    time_state: 'future_effective',
    effective_from: '2027-01-01T00:00:00+09:00',
    anchors: [{
      ...knowledge.authority_reading_units[0].anchors[0],
      anchor_id: 'anchor.0025-future',
      source_authority_unit_id: 'source-unit.0025-future',
    }],
    logical_groups: [{
      ...knowledge.authority_reading_units[0].logical_groups[0],
      logical_group_id: 'group.0025-future',
      anchor_ids: ['anchor.0025-future'],
    }],
    explanation_paragraphs: [{
      ...knowledge.authority_reading_units[0].explanation_paragraphs[0],
      explanation_paragraph_id: 'paragraph.0025-future',
      logical_group_id: 'group.0025-future',
      anchor_ids: ['anchor.0025-future'],
    }],
  });
  knowledge.authority_bindings.push({
    binding_id: 'binding.0025-future',
    from_kind: 'content',
    from_id: 'content.test',
    to_kind: 'authority_reading_unit',
    to_authority_reading_unit_id: 'authority.test-0025-future',
    anchor_ids: ['anchor.0025-future'],
  });
  const entry = {
    content_id: 'content.test',
    authority_binding_ids: ['binding.0025', 'binding.0025-future'],
  };
  const views = resolveAuthorityReadingForEntry(knowledge, entry);
  const allDomIds = views.flatMap(view => [
    view.cardDomId,
    view.cardDetailsId,
    ...view.anchors.flatMap(anchor => [anchor.domId, anchor.detailsId]),
  ]);
  assert.equal(views.length, 2);
  assert.equal(new Set(allDomIds).size, allDomIds.length);
  assert.ok(views.every(view => view.cardDomId.includes('-version-')));
  assert.notEqual(views[0].anchors[0].domId, views[1].anchors[0].domId);
});

test('상세 화면은 조문 근거와 typed 다음 읽기를 별도 구역으로 렌더한다', async () => {
  const [page, section, card] = await Promise.all([
    readFile(path.join(appRoot, 'app', 'ko', 'knowledge', '[slug]', 'page.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src', 'components', 'authority-reading-section.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src', 'components', 'authority-reading-card.tsx'), 'utf8'),
  ]);
  const authorityIndex = page.indexOf('<AuthorityReadingSection');
  const readingPathIndex = page.indexOf('<KnowledgeReadingPath');
  assert.ok(authorityIndex > 0 && readingPathIndex > authorityIndex);
  assert.match(section, /data-authority-reading-root/);
  assert.match(section, /id="statute-reading"/);
  assert.match(card, /data-source-kind="statute"/);
  assert.match(card, /data-authority-official-link/);
  assert.match(card, /target="_blank"/);
  assert.doesNotMatch(card, /KnowledgeReadingPath|data-reading-section/);
});
