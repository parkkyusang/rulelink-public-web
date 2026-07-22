import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {buildKnowledgeHubConnections} from '../src/lib/knowledge-hub-connections.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const bundle = JSON.parse(await readFile(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8'));
const hubPageSource = await readFile(path.join(appRoot, 'app', 'ko', 'hubs', '[slug]', 'page.tsx'), 'utf8');
const globalStyles = await readFile(path.join(appRoot, 'app', 'globals.css'), 'utf8');

function hub(id, contentIds) {
  return {hub_id: `hub.${id}`, slug: id, title_ko: id, description_ko: `${id} 설명`, content_ids: contentIds};
}

function entry(id, relatedContentIds = []) {
  return {content_id: `content.${id}`, title_ko: id, related_content_ids: relatedContentIds};
}

test('한쪽 콘텐츠에만 적힌 연결도 두 허브에서 서로 찾을 수 있다', () => {
  const hubs = [hub('a', ['content.a1']), hub('b', ['content.b1'])];
  const entries = [entry('a1', ['content.b1']), entry('b1')];
  const fromA = buildKnowledgeHubConnections(entries, hubs, hubs[0]);
  const fromB = buildKnowledgeHubConnections(entries, hubs, hubs[1]);
  assert.equal(fromA[0].hub.hub_id, 'hub.b');
  assert.deepEqual(fromA[0].bridgeEntries.map(item => item.content_id), ['content.b1']);
  assert.equal(fromB[0].hub.hub_id, 'hub.a');
  assert.deepEqual(fromB[0].bridgeEntries.map(item => item.content_id), ['content.a1']);
});

test('중복된 양방향 표기는 한 연결로 세고 실제 연결이 많은 허브를 먼저 보여준다', () => {
  const hubs = [
    hub('a', ['content.a1', 'content.a2']),
    hub('b', ['content.b1', 'content.b2']),
    hub('c', ['content.c1']),
  ];
  const entries = [
    entry('a1', ['content.b1', 'content.c1']),
    entry('a2', ['content.b2']),
    entry('b1', ['content.a1']),
    entry('b2'),
    entry('c1'),
  ];
  const result = buildKnowledgeHubConnections(entries, hubs, hubs[0]);
  assert.deepEqual(result.map(item => [item.hub.hub_id, item.connectionStrength]), [
    ['hub.b', 2],
    ['hub.c', 1],
  ]);
});

test('현재 정본의 비교축 연결을 상세 주제에서도 역방향으로 탐색한다', () => {
  const knowledge = bundle.knowledge;
  const laborHub = knowledge.topic_hubs.find(item => item.hub_id === 'hub.labor-wages');
  const comparisonHub = knowledge.topic_hubs.find(item => item.hub_id === 'hub.legal-concept-comparisons');
  assert.ok(laborHub && comparisonHub);
  const connections = buildKnowledgeHubConnections(knowledge.content_entries, knowledge.topic_hubs, laborHub);
  const comparison = connections.find(item => item.hub.hub_id === comparisonHub.hub_id);
  assert.ok(comparison);
  assert.ok(comparison.connectionStrength >= 1);
  assert.ok(comparison.bridgeEntries.length >= 1);
  const connectedHubCount = knowledge.topic_hubs.filter(hubItem => (
    buildKnowledgeHubConnections(knowledge.content_entries, knowledge.topic_hubs, hubItem).length > 0
  )).length;
  assert.ok(connectedHubCount >= 16);
});

test('명시적으로 연결된 상세 글이 없는 허브에는 임의의 유사 주제를 만들지 않는다', () => {
  const hubs = [hub('a', ['content.a1']), hub('b', ['content.b1'])];
  assert.deepEqual(buildKnowledgeHubConnections([entry('a1'), entry('b1')], hubs, hubs[0]), []);
});

test('허브 화면은 연결 근거와 반응형 관련 주제 링크를 실제로 출력한다', () => {
  assert.match(hubPageSource, /connectedKnowledgeHubs\(hub\)/u);
  assert.match(hubPageSource, /connection\.bridgeEntries\.map/u);
  assert.match(hubPageSource, /href=\{`\/ko\/hubs\/\$\{connection\.hub\.slug\}`\}/u);
  assert.match(globalStyles, /\.hubConnectionGrid \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(globalStyles, /\.hubConnectionsIntro, \.hubConnectionGrid \{grid-template-columns: 1fr;\}/u);
});
