import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyKnowledgeComposition,
  assembleChangeBriefSets,
  assembleKnowledge,
  contentReceipt,
  loadComposition,
} from './compose-publication-knowledge.mjs';

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

test('레거시 개념 정체성 예외는 명시적인 snapshot 022 합성에만 적용한다', async () => {
  await assert.rejects(
    () => loadComposition(),
    /별도 canonical concept 정체성/,
  );
  await assert.doesNotReject(
    () => loadComposition(undefined, {snapshotId: 'kr-knowledge-core-20260723-022'}),
  );
  await assert.rejects(
    () => loadComposition(undefined, {snapshotId: 'kr-knowledge-core-20260724-023'}),
    /별도 canonical concept 정체성/,
  );
});

test('독립 법령변화 묶음을 공개 콘텐츠 참조와 함께 결정론적으로 합친다', () => {
  const baseManifest = manifest([descriptor('hub.first', 'first.json')]);
  const knowledge = assembleKnowledge(baseManifest, [topic('hub.first', 'first')]);
  const changeManifest = {
    ...baseManifest,
    change_brief_sets: [{change_brief_set_id: 'changes.one', file: 'changes-one.json'}],
  };
  const changeComposition = assembleChangeBriefSets(changeManifest, [{
    schema: 'rulelink_public_change_brief_set_v1',
    assertions: [{assertion_id: 'assertion.change.one'}],
    change_briefs: [{
      change_brief_id: 'change.one',
      assertion_ids: ['assertion.change.one'],
      related_content_ids: ['content.first'],
    }],
  }], knowledge);
  assert.deepEqual(changeComposition.assertions.map(item => item.assertion_id), ['assertion.change.one']);
  assert.deepEqual(changeComposition.change_briefs.map(item => item.change_brief_id), ['change.one']);

  const bundle = applyKnowledgeComposition({file_hashes: {}}, knowledge, changeComposition);
  assert.equal(bundle.assertions[0].assertion_id, 'assertion.change.one');
  assert.equal(bundle.file_hashes['change-brief:change.one'], contentReceipt(changeComposition.change_briefs[0]));
  assert.equal(
    bundle.file_hashes['change-index:rulelink_public_change_composition_v1'],
    contentReceipt(changeComposition),
  );
});

test('법령변화 묶음의 끊어진 공개 콘텐츠 참조를 거부한다', () => {
  const baseManifest = manifest([descriptor('hub.first', 'first.json')]);
  const knowledge = assembleKnowledge(baseManifest, [topic('hub.first', 'first')]);
  assert.throws(
    () => assembleChangeBriefSets(
      {...baseManifest, change_brief_sets: [{change_brief_set_id: 'changes.one', file: 'changes-one.json'}]},
      [{
        schema: 'rulelink_public_change_brief_set_v1',
        assertions: [{assertion_id: 'assertion.change.one'}],
        change_briefs: [{
          change_brief_id: 'change.one',
          assertion_ids: ['assertion.change.one'],
          related_content_ids: ['content.missing'],
        }],
      }],
      knowledge,
    ),
    /존재하지 않는 공개 콘텐츠/,
  );
});

test('독립 개념 묶음을 지식 그래프에 합치고 영수증을 만든다', () => {
  const descriptors = [descriptor('hub.first', 'first.json')];
  const concept = {
    concept_id: 'concept.one',
    slug: 'concept-one',
    preferred_term_ko: '검증개념',
  };
  const knowledge = assembleKnowledge(
    {...manifest(descriptors), concepts: [{concept_group_id: 'concept-group.one', file: 'one.json'}]},
    [topic('hub.first', 'first')],
    [{
      schema: 'rulelink_public_concept_group_v1',
      concept_group_id: 'concept-group.one',
      sources: [{coordinate_id: 'source.concept'}],
      concept_cards: [concept],
    }],
  );
  assert.deepEqual(knowledge.concept_cards, [concept]);
  assert.ok(knowledge.sources.some(source => source.coordinate_id === 'source.concept'));

  const bundle = applyKnowledgeComposition({file_hashes: {}}, knowledge);
  assert.equal(bundle.file_hashes['knowledge-concept:concept.one'], contentReceipt(concept));
});

test('신규 개념 묶음은 별도 정체성 용어를 검색 별칭으로 합칠 수 없다', () => {
  const descriptors = [descriptor('hub.first', 'first.json')];
  assert.throws(
    () => assembleKnowledge(
      {...manifest(descriptors), concepts: [{concept_group_id: 'concept-group.labor', file: 'labor.json'}]},
      [topic('hub.first', 'first')],
      [{
        schema: 'rulelink_public_concept_group_v1',
        concept_group_id: 'concept-group.labor',
        sources: [],
        concept_cards: [{
          concept_id: 'concept.labor.wage',
          preferred_term_ko: '임금',
          aliases_ko: ['급여', '퇴직금'],
        }],
      }],
    ),
    /별도 canonical concept 정체성/,
  );
});

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
