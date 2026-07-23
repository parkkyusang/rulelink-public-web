import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditPublicationTopicQueue,
  loadAndAuditPublicationTopicQueue,
  projectQueuedTopic,
  summarizeContentTypes,
  summarizeKnowledgeRelations,
} from './audit-publication-topic-queue.mjs';

function topic({
  topicId,
  contentId,
  contentType = 'doctrine_explainer',
  slug,
  relatedContentIds = [],
  schema = 'rulelink_public_knowledge_topic_v1',
  extraSource = false,
}) {
  const hubId = topicId.startsWith('topic.') ? topicId.replace(/^topic\./u, 'hub.') : topicId;
  const coordinateId = `coord.${contentId}`;
  return {
    schema,
    topic_id: topicId,
    sources: [
      {
        coordinate_id: coordinateId,
        source_id: `source.${contentId}`,
        law_name_ko: '시험법',
        article_no: '제1조',
        official_url: 'https://www.law.go.kr/법령/시험법',
        source_snapshot_id: `snapshot:${contentId}`,
        source_hash: 'internal-hash',
        last_verified_at: '2026-07-23T00:00:00+09:00',
      },
      ...(extraSource ? [{
        coordinate_id: `coord.unused.${contentId}`,
        source_id: `source.unused.${contentId}`,
        law_name_ko: '시험법',
        article_no: '제2조',
        official_url: 'https://www.law.go.kr/법령/시험법/제2조',
        source_snapshot_id: `snapshot:unused:${contentId}`,
        last_verified_at: '2026-07-23T00:00:00+09:00',
      }] : []),
    ],
    topic_hubs: [{hub_id: hubId, slug: hubId.replace(/^hub\./u, ''), title_ko: '시험 허브', description_ko: '설명', content_ids: [contentId]}],
    rule_cards: [{
      rule_id: `rule.${contentId}`,
      title_ko: '시험 법리',
      proposition_ko: '시험 명제',
      norm: {actor_ko: '당사자', conditions_ko: '조건', legal_effect_ko: '효과'},
      source_coordinate_ids: [coordinateId],
    }],
    scenario_branches: [{
      scenario_id: `scenario.${contentId}`,
      question_ko: '어떤 경우인가요?',
      decision_fact_ko: '판단 사실',
      when_true_ko: '참인 경우',
      when_false_ko: '거짓인 경우',
      rule_ids: [`rule.${contentId}`],
      source_coordinate_ids: [coordinateId],
    }],
    content_entries: [{
      content_id: contentId,
      content_type: contentType,
      slug: slug ?? contentId.replace(/^content\./u, '').replaceAll('.', '-'),
      rule_ids: [`rule.${contentId}`],
      scenario_ids: [`scenario.${contentId}`],
      source_coordinate_ids: [coordinateId],
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

test('인계 스키마는 허브 식별자를 사용하고 내부 근거 필드를 공개 좌표에서 제거한다', () => {
  const projected = projectQueuedTopic(topic({topicId: 'topic.queued', contentId: 'content.queued', schema: 'rulelink_public_topic_handoff_v1'}));
  assert.equal(projected.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(projected.topic_id, 'hub.queued');
  assert.equal('source_hash' in projected.sources[0], false);
});

test('manifest 밖 주제를 포함한 합성 예상본을 만든다', () => {
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

test('합성 예상본의 중복 식별자와 중복 공개 URL을 거부한다', () => {
  assert.throws(() => auditPublicationTopicQueue({
    manifest: manifest(),
    topicFiles: new Map([
      ['listed.json', topic({topicId: 'hub.listed', contentId: 'content.same'})],
      ['queued.json', topic({topicId: 'hub.queued', contentId: 'content.same'})],
    ]),
  }), /중복된 .*_id/u);
  assert.throws(() => auditPublicationTopicQueue({
    manifest: manifest(),
    topicFiles: new Map([
      ['listed.json', topic({topicId: 'hub.listed', contentId: 'content.listed', slug: 'same-slug'})],
      ['queued.json', topic({topicId: 'hub.queued', contentId: 'content.queued', slug: 'same-slug'})],
    ]),
  }), /공개 URL 식별자가 중복/u);
});

test('깨진 rule·scenario·source·hub·related 참조를 모두 거부한다', () => {
  const cases = [
    ['rule_ids', ['rule.missing'], /존재하지 않는 법리/u],
    ['scenario_ids', ['scenario.missing'], /존재하지 않는 사실분기/u],
    ['source_coordinate_ids', ['coord.missing'], /존재하지 않는 근거/u],
    ['hub_ids', ['hub.missing'], /존재하지 않는 허브/u],
    ['related_content_ids', ['content.missing'], /존재하지 않는 관련 콘텐츠/u],
  ];
  for (const [field, value, pattern] of cases) {
    const listed = topic({topicId: 'hub.listed', contentId: 'content.listed'});
    listed.content_entries[0][field] = field === 'hub_ids' ? ['hub.listed', ...value] : value;
    assert.throws(() => auditPublicationTopicQueue({
      manifest: manifest(),
      topicFiles: new Map([['listed.json', listed]]),
    }), pattern);
  }
});

test('선언한 모든 source 좌표는 법리·사실분기·콘텐츠·개념 중 하나에서 역참조되어야 한다', () => {
  assert.throws(() => auditPublicationTopicQueue({
    manifest: manifest(),
    topicFiles: new Map([['listed.json', topic({topicId: 'hub.listed', contentId: 'content.listed', extraSource: true})]]),
  }), /어느 법리·사실분기·콘텐츠·개념에서도 참조하지 않는 근거/u);
});

test('과거 유형 별칭은 표준 유형으로 집계하고 알 수 없는 유형은 차단한다', () => {
  const summary = summarizeContentTypes([
    {content_id: 'content.canonical', content_type: 'procedure_evidence'},
    {content_id: 'content.alias', content_type: 'procedure_guide'},
    {content_id: 'content.unknown', content_type: 'invented_type'},
  ]);
  assert.equal(summary.canonical_counts.procedure_evidence, 2);
  assert.deepEqual(summary.aliases, [{content_id: 'content.alias', content_type: 'procedure_guide', normalized_content_type: 'procedure_evidence'}]);
  assert.deepEqual(summary.unknown, [{content_id: 'content.unknown', content_type: 'invented_type'}]);

  assert.throws(() => auditPublicationTopicQueue({
    manifest: manifest(),
    topicFiles: new Map([['listed.json', topic({topicId: 'hub.listed', contentId: 'content.listed', contentType: 'invented_type'})]]),
  }), /지원하지 않는 콘텐츠 유형/u);
});

test('타입 관계와 컨시어지 제품 역할의 이관 현황을 집계한다', () => {
  assert.deepEqual(summarizeKnowledgeRelations([
    {content_id: 'content.typed', related_edges: [{relation_type: 'procedure'}], product_roles: ['concierge_entry']},
    {content_id: 'content.legacy', related_content_ids: []},
  ]), {
    typed_entries: 1,
    typed_edges: 1,
    legacy_only_entries: 1,
    concierge_entries: 1,
  });
});

test('현재 저장소의 manifest와 모든 주제 원본을 함께 감사한다', async () => {
  const result = await loadAndAuditPublicationTopicQueue();
  assert.equal(result.snapshot_id, 'kr-knowledge-core-20260723-022');
  assert.ok(result.counts.topics >= 17);
  assert.equal(result.counts.topics, result.counts.hubs);
  assert.equal(result.content_types.unknown.length, 0);
});
