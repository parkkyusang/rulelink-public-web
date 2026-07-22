import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditPublicationTopicQueue,
  loadAndAuditPublicationTopicQueue,
  projectQueuedTopic,
  summarizeContentTypes,
} from './audit-publication-topic-queue.mjs';

function topic({topicId, contentId, contentType = 'doctrine_explainer', relatedContentIds = [], schema = 'rulelink_public_knowledge_topic_v1'}) {
  const hubId = topicId.startsWith('topic.') ? topicId.replace(/^topic\./u, 'hub.') : topicId;
  return {
    schema,
    topic_id: topicId,
    sources: [{
      coordinate_id: `coord.${contentId}`,
      source_id: `source.${contentId}`,
      law_name_ko: '시험법',
      article_no: '제1조',
      official_url: 'https://www.law.go.kr/법령/시험법',
      source_snapshot_id: `snapshot:${contentId}`,
      source_hash: 'internal-hash',
      source_cluster_id: 'internal-cluster',
      last_verified_at: '2026-07-22T00:00:00+00:00',
    }],
    topic_hubs: [{hub_id: hubId, slug: hubId.replace(/^hub\./u, ''), title_ko: '시험 허브', description_ko: '설명', content_ids: [contentId]}],
    rule_cards: [{
      rule_id: `rule.${contentId}`,
      title_ko: '시험 법리',
      proposition_ko: '시험 명제',
      norm: {legal_effect_ko: '시험 효과'},
      source_coordinate_ids: [`coord.${contentId}`],
    }],
    scenario_branches: [{
      scenario_id: `scenario.${contentId}`,
      question_ko: '어떤 경우인가요?',
      decision_fact_ko: '판단 사실',
      when_true_ko: '참인 경우',
      when_false_ko: '거짓인 경우',
      rule_ids: [`rule.${contentId}`],
      source_coordinate_ids: [`coord.${contentId}`],
    }],
    content_entries: [{
      content_id: contentId,
      content_type: contentType,
      slug: contentId.replace(/^content\./u, ''),
      rule_ids: [`rule.${contentId}`],
      scenario_ids: [`scenario.${contentId}`],
      source_coordinate_ids: [`coord.${contentId}`],
      hub_ids: [hubId],
      related_content_ids: relatedContentIds,
    }],
  };
}

function manifest() {
  return {
    schema: 'rulelink_public_knowledge_manifest_v1',
    knowledge_schema: 'rulelink_public_knowledge_index_v1',
    topics: [{topic_id: 'hub.listed', file: 'listed.json'}],
    content_entry_topic_order: ['hub.listed'],
  };
}

test('인계 스키마는 공개 허브 식별자를 사용하고 내부 근거 필드를 제거한다', () => {
  const projected = projectQueuedTopic(topic({
    topicId: 'topic.queued',
    contentId: 'content.queued',
    schema: 'rulelink_public_topic_handoff_v1',
  }));
  assert.equal(projected.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(projected.topic_id, 'hub.queued');
  assert.equal('source_hash' in projected.sources[0], false);
  assert.equal('source_cluster_id' in projected.sources[0], false);
  assert.deepEqual(Object.keys(projected.sources[0]), [
    'coordinate_id', 'source_id', 'law_name_ko', 'article_no', 'official_url',
    'source_snapshot_id', 'last_verified_at',
  ]);
});

test('manifest 밖 주제를 함께 합성해 예상 정본 수량을 계산한다', () => {
  const result = auditPublicationTopicQueue({
    manifest: manifest(),
    topicFiles: new Map([
      ['listed.json', topic({topicId: 'hub.listed', contentId: 'content.listed'})],
      ['queued.json', topic({topicId: 'hub.queued', contentId: 'content.queued', relatedContentIds: ['content.listed']})],
    ]),
  });
  assert.deepEqual(result.queued_files, ['queued.json']);
  assert.deepEqual(result.counts, {topics: 2, sources: 2, hubs: 2, rules: 2, scenarios: 2, content: 2, concepts: 0});
});

test('대기열 전체에서 깨진 관련 콘텐츠와 중복 식별자를 거부한다', () => {
  assert.throws(() => auditPublicationTopicQueue({
    manifest: manifest(),
    topicFiles: new Map([
      ['listed.json', topic({topicId: 'hub.listed', contentId: 'content.listed'})],
      ['queued.json', topic({topicId: 'hub.queued', contentId: 'content.queued', relatedContentIds: ['content.missing']})],
    ]),
  }), /존재하지 않는 관련 콘텐츠/u);

  assert.throws(() => auditPublicationTopicQueue({
    manifest: manifest(),
    topicFiles: new Map([
      ['listed.json', topic({topicId: 'hub.listed', contentId: 'content.same'})],
      ['queued.json', topic({topicId: 'hub.queued', contentId: 'content.same'})],
    ]),
  }), /중복된 .*_id/u);
});

test('현재 저장소의 공개 정본과 주제 원본 대기열을 함께 감사한다', async () => {
  const result = await loadAndAuditPublicationTopicQueue();
  assert.ok(result.counts.topics >= 17);
  assert.ok(result.counts.content >= 173);
  assert.equal(result.counts.topics, result.counts.hubs);
  assert.equal(result.content_types.unknown.length, 0);
});

test('과거 유형 별칭은 표준 유형으로 집계하고 알 수 없는 유형은 거부한다', () => {
  const summary = summarizeContentTypes([
    {content_id: 'content.canonical', content_type: 'procedure_evidence'},
    {content_id: 'content.alias', content_type: 'procedure_guide'},
    {content_id: 'content.unknown', content_type: 'invented_type'},
  ]);
  assert.equal(summary.canonical_counts.procedure_evidence, 2);
  assert.deepEqual(summary.aliases, [{
    content_id: 'content.alias',
    content_type: 'procedure_guide',
    normalized_content_type: 'procedure_evidence',
  }]);
  assert.deepEqual(summary.unknown, [{content_id: 'content.unknown', content_type: 'invented_type'}]);

  assert.throws(() => auditPublicationTopicQueue({
    manifest: manifest(),
    topicFiles: new Map([
      ['listed.json', topic({topicId: 'hub.listed', contentId: 'content.listed'})],
      ['queued.json', topic({topicId: 'hub.queued', contentId: 'content.queued', contentType: 'invented_type'})],
    ]),
  }), /지원하지 않는 콘텐츠 유형/u);
});
