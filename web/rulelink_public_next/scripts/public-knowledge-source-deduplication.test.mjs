import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {buildKnowledgeSourceDocuments, groupKnowledgeSources} from '../src/lib/knowledge-search.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const bundle = JSON.parse(await readFile(path.join(repoRoot, 'artifacts/publication/current/bundle.json'), 'utf8'));

test('같은 source_id의 주제별 좌표는 하나의 공개 근거로 묶는다', () => {
  const sources = [
    statute('coord.topic-a.civil-0750', 'civil_act_ko_0750'),
    statute('coord.topic-b.civil-0750', 'civil_act_ko_0750'),
  ];
  const groups = groupKnowledgeSources(sources);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].source_coordinate_ids, [
    'coord.topic-a.civil-0750',
    'coord.topic-b.civil-0750',
  ]);
});

test('명시된 종전·현행 좌표는 같은 source_id여도 서로 다른 공개 근거로 보존한다', () => {
  const sources = [
    statute('coord.admin.historical-2025-10-01', 'admin_decree_0016_02'),
    statute('coord.admin.current-2026-06-16', 'admin_decree_0016_02'),
  ];
  const groups = groupKnowledgeSources(sources);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.version_label_ko), [
    '종전 기준 2025-10-01',
    '현행 기준 2026-06-16',
  ]);
});

test('같은 source_id라도 공식 주소가 다르면 임의로 합치지 않는다', () => {
  const first = statute('coord.topic-a.civil-0750', 'civil_act_ko_0750');
  const second = {...statute('coord.topic-b.civil-0750', 'civil_act_ko_0750'), official_url: 'https://example.test/another-version'};
  assert.equal(groupKnowledgeSources([first, second]).length, 2);
});

test('통합된 공개 근거는 모든 좌표의 관련 콘텐츠를 잃지 않는다', () => {
  const sources = [
    statute('coord.topic-a.civil-0750', 'civil_act_ko_0750'),
    statute('coord.topic-b.civil-0750', 'civil_act_ko_0750'),
  ];
  const knowledge = {
    sources,
    topic_hubs: [],
    rule_cards: [],
    scenario_branches: [],
    concept_cards: [],
    content_entries: [
      entry('content.a', '첫 번째 손해배상 안내', sources[0].coordinate_id),
      entry('content.b', '두 번째 손해배상 안내', sources[1].coordinate_id),
    ],
  };
  const documents = buildKnowledgeSourceDocuments(knowledge);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].source_coordinate_ids.length, 2);
  assert.deepEqual(documents[0].entries.map(item => item.content_id), ['content.a', 'content.b']);
  assert.ok(documents[0].search_terms_ko.includes('첫 번째 손해배상 안내'));
  assert.ok(documents[0].search_terms_ko.includes('두 번째 손해배상 안내'));
});

test('현재 승인 정본의 중복 근거를 묶어도 모든 공개 좌표가 보존된다', () => {
  const groups = groupKnowledgeSources(bundle.knowledge.sources);
  const sourceCoordinateIds = bundle.knowledge.sources.map(source => source.coordinate_id);
  const groupedCoordinateIds = groups.flatMap(group => group.source_coordinate_ids);
  assert.ok(groups.length > 0);
  assert.ok(groups.length <= bundle.knowledge.sources.length);
  assert.equal(groupedCoordinateIds.length, bundle.knowledge.sources.length);
  assert.equal(new Set(groupedCoordinateIds).size, bundle.knowledge.sources.length);
  assert.deepEqual(new Set(groupedCoordinateIds), new Set(sourceCoordinateIds));
});

function statute(coordinateId, sourceId) {
  return {
    coordinate_id: coordinateId,
    source_id: sourceId,
    law_name_ko: '민법',
    article_no: '제750조',
    official_url: 'https://www.law.go.kr/법령/민법/제750조',
    source_snapshot_id: `snapshot:${coordinateId}`,
    last_verified_at: '2026-07-23T00:00:00+00:00',
  };
}

function entry(contentId, title, coordinateId) {
  return {
    content_id: contentId,
    content_type: 'doctrine_explainer',
    editorial_status: 'approved',
    reviewed_at: '2026-07-23T00:00:00+00:00',
    expires_at: '2026-10-23T00:00:00+00:00',
    slug: contentId.replace('content.', ''),
    title_ko: title,
    one_line_answer_ko: title,
    audience_situation_ko: '손해배상 책임을 확인하는 경우',
    key_points_ko: [],
    action_steps_ko: [],
    facts_to_check_ko: [],
    caution_ko: '',
    search_intents_ko: [],
    body_sections: [],
    rule_ids: [],
    scenario_ids: [],
    source_coordinate_ids: [coordinateId],
    hub_ids: [],
    related_content_ids: [],
  };
}
