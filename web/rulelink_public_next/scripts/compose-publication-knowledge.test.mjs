import assert from 'node:assert/strict';
import test from 'node:test';

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

function manifest(topics) {
  return {schema: 'rulelink_public_knowledge_manifest_v1', knowledge_schema: 'rulelink_public_knowledge_index_v1', topics};
}

test('manifest 순서대로 주제별 지식을 결정론적으로 합친다', () => {
  const descriptors = [descriptor('hub.first', 'first.json'), descriptor('hub.second', 'second.json')];
  const knowledge = assembleKnowledge(manifest(descriptors), [topic('hub.first', 'first'), topic('hub.second', 'second')]);
  assert.deepEqual(knowledge.topic_hubs.map(item => item.hub_id), ['hub.first', 'hub.second']);
  assert.deepEqual(knowledge.content_entries.map(item => item.content_id), ['content.first', 'content.second']);
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
