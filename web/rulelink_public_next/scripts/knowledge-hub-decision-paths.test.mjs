import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [bundle, hubPage, publicationSource] = await Promise.all([
  readFile(path.resolve(root, '..', '..', 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8').then(JSON.parse),
  readFile(path.join(root, 'app', 'ko', 'hubs', '[slug]', 'page.tsx'), 'utf8'),
  readFile(path.join(root, 'src', 'lib', 'publication.ts'), 'utf8'),
]);

test('모든 공개 주제 허브는 결론을 가르는 사실 질문을 통해 상세 글로 연결된다', () => {
  const knowledge = bundle.knowledge;
  assert(knowledge, '공개 지식 색인이 필요합니다.');
  const entryById = new Map(knowledge.content_entries.map(entry => [entry.content_id, entry]));
  const scenarioIds = new Set(knowledge.scenario_branches.map(scenario => scenario.scenario_id));

  for (const hub of knowledge.topic_hubs) {
    const entries = hub.content_ids.map(contentId => entryById.get(contentId)).filter(Boolean);
    const linkedScenarioIds = new Set(entries.flatMap(entry => entry.scenario_ids));
    assert(linkedScenarioIds.size > 0, `허브에 판단 질문이 없습니다: ${hub.hub_id}`);
    for (const scenarioId of linkedScenarioIds) {
      assert(scenarioIds.has(scenarioId), `존재하지 않는 판단 질문 참조: ${hub.hub_id} -> ${scenarioId}`);
    }
  }
});

test('허브 화면은 판단 질문과 연결된 글의 사실분기 위치를 노출한다', () => {
  assert.match(publicationSource, /export async function decisionPathsForKnowledgeHub/);
  assert.match(hubPage, /결론을 가르는 질문/);
  assert.match(hubPage, /어떤 사실부터 확인해야 하나요/);
  assert.match(hubPage, /#scenarios/);
  assert.match(hubPage, /hubDecisionLinks/);
});
