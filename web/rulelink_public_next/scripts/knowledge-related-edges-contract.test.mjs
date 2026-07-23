import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {buildKnowledgeHubConnections} from '../src/lib/knowledge-hub-connections.ts';
import {
  buildKnowledgeRelatedPresentation,
  KNOWLEDGE_RELATION_TYPES,
  projectKnowledgeEntryCompatibility,
} from '../src/lib/knowledge-relations.ts';
import {assembleKnowledge} from './compose-publication-knowledge.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const fixture = JSON.parse(await readFile(path.join(appRoot, 'scripts', 'fixtures', 'knowledge-related-edges.json'), 'utf8'));

function freshFixture() {
  return structuredClone(fixture);
}

function assemble(value = freshFixture()) {
  return assembleKnowledge(value.manifest, value.topics, value.concept_groups);
}

function sourceEntry(value) {
  return value.topics[0].content_entries[0];
}

test('8개 관계 유형을 content·concept 기존 필드와 결정사실 문구로 투영한다', () => {
  const knowledge = assemble();
  const entry = knowledge.content_entries.find(item => item.content_id === 'content.typed-source');
  assert.deepEqual(entry.related_edges.map(relation => relation.relation_type), KNOWLEDGE_RELATION_TYPES);
  assert.deepEqual(entry.related_content_ids, [
    'content.typed-prerequisite',
    'content.typed-comparison',
    'content.typed-deadline',
    'content.typed-procedure',
    'content.typed-remedy',
    'content.typed-law-change',
    'content.typed-boundary',
  ]);
  assert.deepEqual(entry.concept_ids, ['concept.typed-relations']);
  assert.deepEqual(entry.lawyer_workspace_entry.decision_facts_ko, ['사건의 적용시점']);
});

test('타입 관계와 기존 content·concept 식별자 집합이 다르면 합성을 차단한다', () => {
  for (const [field, value] of [
    ['related_content_ids', ['content.typed-comparison']],
    ['concept_ids', ['concept.mismatch']],
  ]) {
    const input = freshFixture();
    sourceEntry(input)[field] = value;
    assert.throws(() => assemble(input), new RegExp(`${field} 집합이 일치하지 않습니다`, 'u'));
  }
});

test('concierge_entry 역할과 작업공간 연결은 서로를 필수로 한다', () => {
  const missingRole = freshFixture();
  sourceEntry(missingRole).product_roles = ['user_orientation'];
  assert.throws(() => assemble(missingRole), /concierge_entry와 lawyer_workspace_entry 존재 여부/u);

  const missingWorkspace = freshFixture();
  delete sourceEntry(missingWorkspace).lawyer_workspace_entry;
  assert.throws(() => assemble(missingWorkspace), /concierge_entry와 lawyer_workspace_entry 존재 여부/u);
});

test('concierge_entry는 콘텐츠가 가진 실제 시나리오와 고정 자격 게이트만 참조한다', () => {
  const invalidScenario = freshFixture();
  sourceEntry(invalidScenario).lawyer_workspace_entry.decision_scenario_ids = ['scenario.missing'];
  assert.throws(() => assemble(invalidScenario), /콘텐츠 scenario_ids에 없습니다/u);

  const invalidGate = freshFixture();
  sourceEntry(invalidGate).lawyer_workspace_entry.gate_id = 'self_declared_attorney_v1';
  assert.throws(() => assemble(invalidGate), /verified_attorney_v1/u);
});

test('상세 관계는 유형별로 나누고 명시 관계 다음에 같은 허브 fallback을 유지한다', () => {
  const knowledge = assemble();
  const entry = knowledge.content_entries.find(item => item.content_id === 'content.typed-source');
  const fallback = {content_id: 'content.typed-fallback', title_ko: '같은 허브의 다른 글'};
  const presentation = buildKnowledgeRelatedPresentation(
    entry,
    [...knowledge.content_entries, fallback],
    [...knowledge.topic_hubs[0].content_ids, fallback.content_id],
    8,
  );
  assert.deepEqual(presentation.sections.map(section => section.key), [
    'prerequisite',
    'comparison',
    'deadline',
    'procedure',
    'remedy',
    'law_change',
    'concierge_boundary',
    'same_hub',
  ]);
  assert.equal(presentation.related.at(-1).content_id, fallback.content_id);

  const legacy = {
    content_id: 'content.legacy',
    related_content_ids: ['content.typed-comparison'],
  };
  const legacyPresentation = buildKnowledgeRelatedPresentation(
    legacy,
    knowledge.content_entries,
    knowledge.topic_hubs[0].content_ids,
  );
  assert.deepEqual(legacyPresentation.sections, []);
  assert.equal(legacyPresentation.related[0].content_id, 'content.typed-comparison');
});

test('허브 연결은 타입 관계를 표시 정보로 전달하고 기존 무타입 연결도 유지한다', () => {
  const hubs = [
    {hub_id: 'hub.a', title_ko: 'A', content_ids: ['content.a']},
    {hub_id: 'hub.b', title_ko: 'B', content_ids: ['content.b']},
  ];
  const typed = buildKnowledgeHubConnections([
    {
      content_id: 'content.a',
      related_content_ids: ['content.b'],
      related_edges: [{target_kind: 'content', target_id: 'content.b', relation_type: 'deadline'}],
    },
    {content_id: 'content.b', related_content_ids: []},
  ], hubs, hubs[0]);
  assert.deepEqual(typed[0].relationTypes, ['deadline']);

  const legacy = buildKnowledgeHubConnections([
    {content_id: 'content.a', related_content_ids: ['content.b']},
    {content_id: 'content.b', related_content_ids: []},
  ], hubs, hubs[0]);
  assert.deepEqual(legacy[0].relationTypes, []);
});

test('현재 승인 정본의 기존 필드 형식은 snapshot 승격 뒤에도 호환된다', async () => {
  const bundle = JSON.parse(await readFile(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8'));
  const entries = bundle.knowledge.content_entries;
  assert.match(bundle.snapshot_id, /^kr-knowledge-core-\d{8}-\d{3}$/u);
  assert.ok(bundle.knowledge.topic_hubs.length > 0);
  assert.ok(entries.length > 0);
  assert.doesNotThrow(() => {
    const scenarios = new Map(bundle.knowledge.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
    for (const entry of entries) projectKnowledgeEntryCompatibility(entry, scenarios);
  });
});

test('상세·허브 화면은 타입 구획을 사용하되 기존 무타입 문구를 보존한다', async () => {
  const [detailPage, hubPage] = await Promise.all([
    readFile(path.join(appRoot, 'app', 'ko', 'knowledge', '[slug]', 'page.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'app', 'ko', 'hubs', '[slug]', 'page.tsx'), 'utf8'),
  ]);
  assert.match(detailPage, /relatedSections\.length/u);
  assert.match(detailPage, /section\.label_ko/u);
  assert.match(detailPage, /같이 확인할 내용/u);
  assert.match(hubPage, /connection\.relationTypes\.map\(knowledgeRelationTypeLabelKo\)/u);
  assert.match(hubPage, /함께 확인할 주제/u);
});
