import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  QUALITY_DEBT_METRICS,
  auditTopicQualityDebt,
  loadPublicationTopics,
  measureTopicQualityDebt,
  normalizeExactContentText,
} from './audit-publication-topic-quality-debt.mjs';

const appRoot = process.cwd();
const baseline = JSON.parse(await readFile(
  path.join(appRoot, 'src', 'lib', 'publication-topic-quality-debt-baseline.json'),
  'utf8',
));

function clone(value) {
  return structuredClone(value);
}

function cleanTopic(topicId = 'hub.quality-clean') {
  return {
    schema: 'rulelink_public_knowledge_topic_v1',
    topic_id: topicId,
    rule_cards: [{
      rule_id: 'rule.quality.clean',
      proposition_ko: '요건을 충족하면 권리를 행사할 수 있는지 판단한다.',
      norm: {legal_effect_ko: '권리를 행사할 수 있다.'},
    }],
    content_entries: [{
      content_id: 'content.quality-clean',
      audience_situation_ko: '권리 행사 요건을 확인하려는 경우',
      related_content_ids: ['content.existing'],
      content_type: 'doctrine_explainer',
      title_ko: '권리 행사 기준',
      slug: 'quality-clean',
      key_points_ko: ['요건을 먼저 확인합니다.'],
      search_intents_ko: ['권리 행사에 필요한 자료'],
      body_sections: [{heading_ko: '판단', paragraphs_ko: ['사실관계를 기준에 대조합니다.']}],
    }],
  };
}

test('최신 main의 26개 주제 품질부채를 기준선과 정확히 고정한다', async () => {
  const topics = await loadPublicationTopics();
  const result = auditTopicQualityDebt({topics, baseline});
  assert.deepEqual(result.errors, []);
  assert.equal(Object.keys(topics).length, 26);
  assert.deepEqual(result.totals, {
    duplicate_rule_copy: 119,
    empty_audience_situation: 71,
    empty_related_content_ids: 74,
    nonstandard_content_type: 8,
    duplicate_key_point_body: 18,
    copied_title_or_slug_search_intent: 99,
  });
  assert.deepEqual(baseline.operating_snapshot_021_audit, {
    rule_cards: 160,
    content_entries: 173,
    duplicate_rule_copy: 119,
    empty_audience_situation: 71,
    empty_related_content_ids: 42,
    nonstandard_content_type: 8,
    duplicate_key_point_body: 0,
    copied_title_or_slug_search_intent: 71,
  });
});

test('새 주제는 여섯 품질부채 지표가 모두 0이어야 한다', () => {
  const clean = cleanTopic();
  assert.deepEqual(measureTopicQualityDebt(clean), Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 0])));
  assert.deepEqual(auditTopicQualityDebt({topics: {'new-topic.json': clean}, baseline: {
    ...clone(baseline), topics: {}, totals: Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 0])),
  }}).errors, []);

  const fixtures = {
    duplicate_rule_copy: topic => { topic.rule_cards[0].proposition_ko = topic.rule_cards[0].norm.legal_effect_ko; },
    empty_audience_situation: topic => { topic.content_entries[0].audience_situation_ko = ''; },
    empty_related_content_ids: topic => { topic.content_entries[0].related_content_ids = []; },
    nonstandard_content_type: topic => { topic.content_entries[0].content_type = 'procedure_guide'; },
    duplicate_key_point_body: topic => { topic.content_entries[0].body_sections[0].paragraphs_ko = ['요건을 먼저 확인합니다!']; },
    copied_title_or_slug_search_intent: topic => { topic.content_entries[0].search_intents_ko = ['quality clean']; },
  };
  for (const [metric, mutate] of Object.entries(fixtures)) {
    const topic = cleanTopic();
    mutate(topic);
    const result = auditTopicQualityDebt({topics: {'new-topic.json': topic}, baseline: {
      ...clone(baseline), topics: {}, totals: Object.fromEntries(QUALITY_DEBT_METRICS.map(key => [key, 0])),
    }});
    assert.ok(result.errors.some(error => error.includes(`new-topic.json.${metric}=1`)), metric);
  }
});

test('완전일치 정규화는 문장부호와 슬러그 구분자만 제거하고 부분일치는 만들지 않는다', () => {
  assert.equal(normalizeExactContentText('지급정지 신청!'), normalizeExactContentText('지급정지  신청.'));
  assert.equal(normalizeExactContentText('voice-phishing-refund'), normalizeExactContentText('voice phishing refund'));
  assert.notEqual(normalizeExactContentText('지급정지 신청'), normalizeExactContentText('지급정지 신청만으로 환급되지 않습니다'));
});

test('기존 주제는 어느 지표도 기준선보다 증가할 수 없다', () => {
  const topic = cleanTopic('hub.existing');
  const topics = {'existing.json': topic};
  const existingBaseline = {
    schema: baseline.schema,
    totals: Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 0])),
    topics: {
      'existing.json': {topic_id: 'hub.existing', ...Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 0]))},
    },
  };
  topic.content_entries[0].related_content_ids = [];
  const result = auditTopicQualityDebt({topics, baseline: existingBaseline});
  assert.ok(result.errors.some(error => error.includes('기존 주제 품질부채 증가 금지: existing.json.empty_related_content_ids 0 -> 1')));
});

test('기준선 상향은 실패하고 데이터와 함께 낮추는 래칫은 허용한다', () => {
  const previous = {
    schema: baseline.schema,
    totals: Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 1])),
    topics: {
      'existing.json': {
        topic_id: 'hub.existing',
        ...Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 1])),
      },
    },
  };
  const raised = clone(previous);
  raised.topics['existing.json'].duplicate_rule_copy = 2;
  raised.totals.duplicate_rule_copy = 2;
  assert.ok(auditTopicQualityDebt({topics: {'existing.json': cleanTopic('hub.existing')}, baseline: raised, previousBaseline: previous})
    .errors.some(error => error.includes('existing.json.duplicate_rule_copy 1 -> 2')));

  const lowered = clone(previous);
  lowered.topics['existing.json'] = {
    topic_id: 'hub.existing',
    ...Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 0])),
  };
  lowered.totals = Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 0]));
  assert.deepEqual(
    auditTopicQualityDebt({topics: {'existing.json': cleanTopic('hub.existing')}, baseline: lowered, previousBaseline: previous}).errors,
    [],
  );
});

test('이전 기준선에 새 주제를 등록할 때도 여섯 지표 0만 허용한다', () => {
  const previous = {schema: baseline.schema, totals: Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 0])), topics: {}};
  const current = clone(previous);
  current.topics['new-topic.json'] = {
    topic_id: 'hub.quality-clean',
    ...Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 0])),
    empty_related_content_ids: 1,
  };
  current.totals.empty_related_content_ids = 1;
  const result = auditTopicQualityDebt({topics: {'new-topic.json': cleanTopic()}, baseline: current, previousBaseline: previous});
  assert.ok(result.errors.some(error => error.includes('새 주제 기준선은 0이어야 합니다')));
});

test('기준 SHA 실제값 1에서 현재 0으로 개선하면 정적 상한을 바꾸지 않아도 허용한다', () => {
  const baseTopic = cleanTopic('hub.existing');
  baseTopic.content_entries[0].related_content_ids = [];
  const currentTopic = cleanTopic('hub.existing');
  const ceiling = {
    schema: baseline.schema,
    totals: Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, metric === 'empty_related_content_ids' ? 1 : 0])),
    topics: {
      'existing.json': {
        topic_id: 'hub.existing',
        ...Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, metric === 'empty_related_content_ids' ? 1 : 0])),
      },
    },
  };
  const result = auditTopicQualityDebt({
    topics: {'existing.json': currentTopic},
    baseTopics: {'existing.json': baseTopic},
    baseline: ceiling,
  });
  assert.deepEqual(result.errors, []);
});

test('기준 SHA 실제값 0을 다시 1로 악화시키면 정적 상한이 1이어도 실패한다', () => {
  const baseTopic = cleanTopic('hub.existing');
  const currentTopic = cleanTopic('hub.existing');
  currentTopic.content_entries[0].related_content_ids = [];
  const ceiling = {
    schema: baseline.schema,
    totals: Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, metric === 'empty_related_content_ids' ? 1 : 0])),
    topics: {
      'existing.json': {
        topic_id: 'hub.existing',
        ...Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, metric === 'empty_related_content_ids' ? 1 : 0])),
      },
    },
  };
  const result = auditTopicQualityDebt({
    topics: {'existing.json': currentTopic},
    baseTopics: {'existing.json': baseTopic},
    baseline: ceiling,
  });
  assert.ok(result.errors.some(error => error.includes('개선된 품질부채 되돌림 금지: existing.json.empty_related_content_ids 0 -> 1')));
});
