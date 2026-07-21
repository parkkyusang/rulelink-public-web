import assert from 'node:assert/strict';
import test from 'node:test';

import './law-change-topic-handoff.test.mjs';

import {applyKnowledgeComposition, assembleKnowledge, contentReceipt} from './compose-publication-knowledge.mjs';

function descriptor(topicId, file) { return {topic_id: topicId, file}; }

function topic(topicId, suffix) {
  const contentId = `content.${suffix}`;
  return {
    schema: 'rulelink_public_knowledge_topic_v1',
    topic_id: topicId,
    sources: [{coordinate_id: `source.${suffix}`}],
    topic_hubs: [{hub_id: topicId, content_ids: [contentId]}],
    rule_cards: [{rule_id: `rule.${suffix}`}],
    scenario_branches: [{scenario_id: `scenario.${suffix}`}],
    content_entries: [{content_id: contentId, hub_ids: [topicId]}],
  };
}

function manifest(topics, contentEntryOrder = null) {
  return {
    schema: 'rulelink_public_knowledge_manifest_v1',
    knowledge_schema: 'rulelink_public_knowledge_index_v1',
    topics,
    ...(contentEntryOrder ? {content_entry_topic_order: contentEntryOrder} : {}),
  };
}

test('manifest 순서대로 주제별 지식을 결정론적으로 합친다', () => {
  const descriptors = [descriptor('hub.first', 'first.json'), descriptor('hub.second', 'second.json')];
  const knowledge = assembleKnowledge(manifest(descriptors), [topic('hub.first', 'first'), topic('hub.second', 'second')]);
  assert.deepEqual(knowledge.topic_hubs.map(item => item.hub_id), ['hub.first', 'hub.second']);
  assert.deepEqual(knowledge.content_entries.map(item => item.content_id), ['content.first', 'content.second']);
});

test('콘텐츠 배열만 명시한 주제 순서를 사용할 수 있다', () => {
  const descriptors = [descriptor('hub.first', 'first.json'), descriptor('hub.second', 'second.json')];
  const knowledge = assembleKnowledge(
    manifest(descriptors, ['hub.second', 'hub.first']),
    [topic('hub.first', 'first'), topic('hub.second', 'second')],
  );
  assert.deepEqual(knowledge.topic_hubs.map(item => item.hub_id), ['hub.first', 'hub.second']);
  assert.deepEqual(knowledge.content_entries.map(item => item.content_id), ['content.second', 'content.first']);
});

test('주제 사이의 중복 식별자를 거부한다', () => {
  assert.throws(
    () => assembleKnowledge(
      manifest([descriptor('hub.first', 'first.json'), descriptor('hub.second', 'second.json')]),
      [topic('hub.first', 'same'), topic('hub.second', 'same')],
    ),
    /중복된 coordinate_id/,
  );
});

test('합성 결과에서 공개 지식 해시 영수증을 다시 만든다', () => {
  const knowledge = assembleKnowledge(manifest([descriptor('hub.first', 'first.json')]), [topic('hub.first', 'first')]);
  const bundle = applyKnowledgeComposition({file_hashes: {
    'knowledge:content.old': 'stale',
    'knowledge-index:rulelink_public_knowledge_index_v1': 'stale',
    'approval:kept': 'kept',
  }}, knowledge);
  assert.equal(bundle.file_hashes['approval:kept'], 'kept');
  assert.equal(bundle.file_hashes['knowledge:content.old'], undefined);
  assert.equal(bundle.file_hashes['knowledge:content.first'], contentReceipt(knowledge.content_entries[0]));
  assert.equal(bundle.file_hashes['knowledge-index:rulelink_public_knowledge_index_v1'], contentReceipt(knowledge));
});


test('공개 주제는 일반인 사건 컨시어지 연결을 거부한다', () => {
  const invalid = topic('hub.first', 'first');
  invalid.content_entries[0].concierge_entry = {
    question_ko: '사건을 검토할까요?',
    decision_facts_ko: ['구체 사실'],
    href: 'https://liale-review.lolphysical.xyz',
  };
  assert.throws(
    () => assembleKnowledge(manifest([descriptor('hub.first', 'first.json')]), [invalid]),
    /금지된 concierge_entry/,
  );
});

test('변호사 작업공간 연결은 내부 설명 게이트와 확인 대상이 고정되어야 한다', () => {
  const valid = topic('hub.first', 'first');
  valid.content_entries[0].lawyer_workspace_entry = {
    question_ko: '변호사 전용 도구에서 이어서 검토할까요?',
    decision_facts_ko: ['구체 사실'],
    href: '/ko/lawyer-workspace',
    audience: 'verified_attorney',
  };
  assert.doesNotThrow(
    () => assembleKnowledge(manifest([descriptor('hub.first', 'first.json')]), [valid]),
  );
  valid.content_entries[0].lawyer_workspace_entry.href = 'https://liale-review.lolphysical.xyz';
  assert.throws(
    () => assembleKnowledge(manifest([descriptor('hub.first', 'first.json')]), [valid]),
    /변호사 전용 게이트 계약/,
  );
});
