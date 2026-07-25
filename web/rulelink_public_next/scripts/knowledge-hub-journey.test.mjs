import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {buildKnowledgeHubJourneys} from '../src/lib/knowledge-hub-journey.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(await readFile(
  path.resolve(appRoot, '..', '..', 'artifacts/publication/current/bundle.json'),
  'utf8',
));
const hub = bundle.knowledge.topic_hubs.find(
  candidate => candidate.slug === 'family-inheritance',
);
const entryById = new Map(
  bundle.knowledge.content_entries.map(entry => [entry.content_id, entry]),
);
const hubEntries = hub.content_ids.map(contentId => entryById.get(contentId));

test('허브 세로 경로는 hub.content_ids 순서와 실제 필드를 그대로 보존한다', () => {
  const journeys = buildKnowledgeHubJourneys(hubEntries);
  assert.deepEqual(
    journeys.map(journey => journey.content_id),
    hub.content_ids,
  );
  for (const [index, journey] of journeys.entries()) {
    const entry = hubEntries[index];
    assert.deepEqual(
      journey.stages.map(stage => stage.key),
      ['problem', 'judgment', 'evidence', 'action'],
    );
    assert.deepEqual(journey.stages[0].items_ko, [entry.audience_situation_ko]);
    assert.deepEqual(journey.stages[1].items_ko, [entry.one_line_answer_ko]);
    assert.deepEqual(journey.stages[2].items_ko, entry.facts_to_check_ko);
    assert.deepEqual(journey.stages[3].items_ko, entry.action_steps_ko);
    assert.equal(journey.source_count, entry.source_coordinate_ids.length);
  }
});

test('없는 단계는 추론하거나 빈 자리로 만들지 않는다', () => {
  const [journey] = buildKnowledgeHubJourneys([{
    content_id: 'content.fixture',
    content_type: 'legal_explainer',
    slug: 'fixture',
    title_ko: '시험 글',
    reviewed_at: '2026-07-24T00:00:00+09:00',
    audience_situation_ko: '확인할 상황',
    one_line_answer_ko: '',
    facts_to_check_ko: [],
    action_steps_ko: ['공식자료 확인'],
    source_coordinate_ids: [],
  }]);
  assert.deepEqual(journey.stages.map(stage => stage.key), ['problem', 'action']);
});

test('허브 화면은 공용 세로 경로를 쓰고 판단질문·typed 연결 구획은 보존한다', async () => {
  const [page, component] = await Promise.all([
    readFile(path.join(appRoot, 'app', 'ko', 'hubs', '[slug]', 'page.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src', 'components', 'knowledge-hub-journey.tsx'), 'utf8'),
  ]);
  assert.match(page, /<KnowledgeHubJourney entries=\{entries\}/u);
  assert.match(page, /decisionPaths\.map/u);
  assert.match(page, /connections\.map/u);
  assert.match(page, /관계 유형이 없는 기존 연결은 ‘함께 확인할 주제’/u);
  assert.match(component, /href=\{`\/ko\/knowledge\/\$\{journey\.slug\}`\}/u);
  assert.match(component, /data-hub-stage=\{stage\.key\}/u);
});
