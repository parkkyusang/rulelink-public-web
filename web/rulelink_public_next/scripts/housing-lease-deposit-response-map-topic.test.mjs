import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {loadComposition} from './compose-publication-knowledge.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicRelativePath =
  'artifacts/publication/topics/housing-lease-deposit.json';
const topicPath = path.join(repositoryRoot, topicRelativePath);
const manifestPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'topics',
  'manifest.json',
);
const baselineCommit = 'cee162868a0272fc278b2c34365804441f17dfdd';
const newContentId = 'content.deposit-refund-response-map';
const sourceCoordinateId =
  'coord.housing-lease-deposit.housing-lease-ko-0003-03';
const sourceVersionKey =
  'sha256:e7b90dac2690889444482f85c38db5e913a4caba88d7a90c23f5fb46b4fce82a';

const topic = JSON.parse(await readFile(topicPath, 'utf8'));
const baseline = JSON.parse(
  execFileSync(
    'git',
    [
      '-c',
      `safe.directory=${repositoryRoot.replaceAll('\\', '/')}`,
      'show',
      `${baselineCommit}:${topicRelativePath}`,
    ],
    {cwd: repositoryRoot, encoding: 'utf8'},
  ),
);

const expectedSearchIntents = [
  '집주인이 보증금을 안 줘요',
  '전세보증금 못 받았는데 무엇부터 해야 하나요',
  '계약 끝났는데 보증금 일부만 돌려받았어요',
  '보증금 못 받고 이사해야 할 때',
  '임차권등기명령 신청 전에 준비할 서류',
  '임차권등기명령과 보증금 반환소송 차이',
  '보증금 반환 지급명령 조정 소송 중 무엇을 하나요',
  '전세집 경매 시작됐는데 배당요구 해야 하나요',
  '새집 잔금 전에 전세보증금 못 받으면',
  '임대인이 연락을 안 받는데 보증금 청구 절차',
];

const exactAuthorityTextByLocator = new Map([
  ['a3-3', '제3조의3(임차권등기명령)'],
  [
    'a3-3-p1',
    '① 임대차가 끝난 후 보증금이 반환되지 아니한 경우 임차인은 임차주택의 소재지를 관할하는 지방법원ㆍ지방법원지원 또는 시ㆍ군 법원에 임차권등기명령을 신청할 수 있다.',
  ],
  [
    'a3-3-p2',
    '② 임차권등기명령의 신청서에는 다음 각 호의 사항을 적어야 하며, 신청의 이유와 임차권등기의 원인이 된 사실을 소명(疎明)하여야 한다.',
  ],
  [
    'a3-3-p2-i1',
    '1. 신청의 취지 및 이유',
  ],
  [
    'a3-3-p2-i2',
    '2. 임대차의 목적인 주택(임대차의 목적이 주택의 일부분인 경우에는 해당 부분의 도면을 첨부한다)',
  ],
  [
    'a3-3-p2-i3',
    '3. 임차권등기의 원인이 된 사실(임차인이 제3조제1항ㆍ제2항 또는 제3항에 따른 대항력을 취득하였거나 제3조의2제2항에 따른 우선변제권을 취득한 경우에는 그 사실)',
  ],
  [
    'a3-3-p2-i4',
    '4. 그 밖에 대법원규칙으로 정하는 사항',
  ],
  [
    'a3-3-p5',
    '⑤ 임차인은 임차권등기명령의 집행에 따른 임차권등기를 마치면 제3조제1항ㆍ제2항 또는 제3항에 따른 대항력과 제3조의2제2항에 따른 우선변제권을 취득한다. 다만, 임차인이 임차권등기 이전에 이미 대항력이나 우선변제권을 취득한 경우에는 그 대항력이나 우선변제권은 그대로 유지되며, 임차권등기 이후에는 제3조제1항ㆍ제2항 또는 제3항의 대항요건을 상실하더라도 이미 취득한 대항력이나 우선변제권을 상실하지 아니한다.',
  ],
]);

const existingAuthorityBindingByContent = new Map([
  [
    'content.move-before-deposit-refund',
    'binding.housing-lease.3-3.move-before-refund',
  ],
  [
    'content.lease-registration-application-is-not-completion',
    'binding.housing-lease.3-3.application-not-completion',
  ],
  [
    'content.lease-registration-order-requirements',
    'binding.housing-lease.3-3.application-requirements',
  ],
  [
    'content.rights-after-lease-registration',
    'binding.housing-lease.3-3.rights-after-registration',
  ],
]);

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeSearch(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-z가-힣+/]/gu, '');
}

function byId(values, key) {
  return new Map(values.map(value => [value[key], value]));
}

function normalizeTargetSource(value) {
  const copy = structuredClone(value);
  delete copy.source_kind;
  delete copy.law_key;
  delete copy.official_url_http_status;
  delete copy.source_version_key;
  if (copy.source_snapshot_id === '1c35b925f8d04acba8a9a1b0c9796e07') {
    copy.source_snapshot_id = 'snapshot:1c35b925f8d04acba8a9a1b0c9796e07';
  }
  return copy;
}

test('기존 주택임대차 법리ㆍ수치ㆍ기한과 비대상 객체는 그대로 보존된다', () => {
  assert.deepEqual(topic.rule_cards, baseline.rule_cards);
  assert.deepEqual(topic.scenario_branches, baseline.scenario_branches);

  const currentEntries = byId(topic.content_entries, 'content_id');
  const baselineEntries = byId(baseline.content_entries, 'content_id');
  assert.equal(currentEntries.size, baselineEntries.size + 1);
  for (const [contentId, entry] of baselineEntries) {
    const current = structuredClone(currentEntries.get(contentId));
    const bindingId = existingAuthorityBindingByContent.get(contentId);
    if (bindingId) {
      assert.deepEqual(current.authority_binding_ids, [bindingId]);
      delete current.authority_binding_ids;
    }
    assert.deepEqual(current, entry, contentId);
  }

  const currentSources = byId(topic.sources, 'coordinate_id');
  const baselineSources = byId(baseline.sources, 'coordinate_id');
  assert.equal(currentSources.size, baselineSources.size);
  for (const [coordinateId, source] of baselineSources) {
    const current = currentSources.get(coordinateId);
    if (coordinateId === sourceCoordinateId) {
      assert.deepEqual(normalizeTargetSource(current), source);
    } else {
      assert.deepEqual(current, source, coordinateId);
    }
  }

  const baselineHub = structuredClone(baseline.topic_hubs[0]);
  const currentHub = structuredClone(topic.topic_hubs[0]);
  assert.equal(currentHub.content_ids.pop(), newContentId);
  assert.deepEqual(currentHub, baselineHub);
});

test('보증금 미반환 대표 페이지는 사실분기부터 행동까지 한 흐름으로 닫힌다', () => {
  const entry = topic.content_entries.find(
    value => value.content_id === newContentId,
  );
  assert.ok(entry);
  assert.equal(entry.content_type, 'procedure_evidence');
  assert.equal(entry.audience_situation_ko.includes('보증금'), true);
  assert.deepEqual(
    entry.body_sections.map(section => section.heading_ko),
    [
      '1. 먼저 사실을 네 갈래로 나눕니다',
      '2. 이사 전 권리 보전과 반환청구 수단을 구분합니다',
      '3. 결론을 바꾸는 자료부터 모읍니다',
      '4. 기한은 하나가 아니라 절차별로 확인합니다',
      '5. 지금 할 행동을 순서대로 정합니다',
    ],
  );
  assert.equal(entry.facts_to_check_ko.length, 10);
  assert.equal(entry.action_steps_ko.length, 6);
  assert.equal(entry.rule_ids.length, 5);
  assert.equal(entry.scenario_ids.length, 5);
  assert.equal(entry.source_coordinate_ids.length, 4);
  assert.equal(entry.related_edges.length, 9);
  assert.deepEqual(entry.related_content_ids, entry.related_edges.map(
    edge => edge.target_id,
  ));
  assert.match(entry.caution_ko, /신청서 제출, 임차권등기 완료, 실제 배당요구/);
});

test('대표 검색질문은 자연어로 고정되고 다른 공개 글과 exact 충돌하지 않는다', async () => {
  const entry = topic.content_entries.find(
    value => value.content_id === newContentId,
  );
  assert.deepEqual(entry.search_intents_ko, expectedSearchIntents);
  const normalized = entry.search_intents_ko.map(normalizeSearch);
  assert.equal(new Set(normalized).size, normalized.length);
  assert.equal(normalized.every(value => value.length >= 10), true);

  const {knowledge} = await loadComposition(manifestPath, {
    snapshotId: 'kr-knowledge-core-20260723-023',
  });
  const outside = new Map();
  for (const other of knowledge.content_entries) {
    if (other.content_id === newContentId) continue;
    for (const query of other.search_intents_ko ?? []) {
      const key = normalizeSearch(query);
      const ids = outside.get(key) ?? [];
      ids.push(other.content_id);
      outside.set(key, ids);
    }
  }
  for (const query of normalized) {
    assert.deepEqual(outside.get(query) ?? [], [], query);
  }
});

test('제3조의3 공식문언은 로컬 원장 버전과 해시로 정확히 결박된다', () => {
  assert.equal(topic.source_version_bridges.length, 1);
  assert.equal(topic.source_authority_units.length, 8);
  assert.equal(topic.authority_reading_units.length, 1);
  assert.equal(topic.authority_bindings.length, 5);

  const source = topic.sources.find(
    value => value.coordinate_id === sourceCoordinateId,
  );
  assert.equal(source.source_kind, 'statute');
  assert.equal(source.law_key, 'housing_lease');
  assert.equal(source.source_version_key, sourceVersionKey);
  assert.equal(source.official_url_http_status, 200);

  const bridge = topic.source_version_bridges[0];
  assert.equal(bridge.source_coordinate_id, sourceCoordinateId);
  assert.equal(bridge.source_snapshot_id, source.source_snapshot_id);
  assert.equal(bridge.source_version_key, sourceVersionKey);

  const unitById = byId(
    topic.source_authority_units,
    'source_authority_unit_id',
  );
  for (const unit of unitById.values()) {
    assert.equal(unit.source_coordinate_id, sourceCoordinateId);
    assert.equal(unit.source_snapshot_id, source.source_snapshot_id);
    assert.equal(unit.source_version_key, sourceVersionKey);
    assert.equal(unit.official_text_ko, exactAuthorityTextByLocator.get(
      unit.locator_key,
    ));
    assert.equal(unit.official_text_hash, sha256(unit.official_text_ko));
    if (unit.parent_source_authority_unit_id) {
      assert.equal(unitById.has(unit.parent_source_authority_unit_id), true);
    }
  }

  const reading = topic.authority_reading_units[0];
  const anchorById = byId(reading.anchors, 'anchor_id');
  assert.equal(anchorById.size, unitById.size);
  for (const anchor of anchorById.values()) {
    const unit = unitById.get(anchor.source_authority_unit_id);
    assert.ok(unit);
    assert.equal(anchor.locator_key, unit.locator_key);
    assert.equal(anchor.official_text_hash, unit.official_text_hash);
    if (anchor.parent_anchor_id) {
      assert.equal(anchorById.has(anchor.parent_anchor_id), true);
    }
  }
  for (const group of reading.logical_groups) {
    assert.equal(group.anchor_ids.every(id => anchorById.has(id)), true);
  }
  for (const paragraph of reading.explanation_paragraphs) {
    assert.equal(paragraph.anchor_ids.every(id => anchorById.has(id)), true);
  }

  const newBinding = topic.authority_bindings.find(
    value => value.from_id === newContentId,
  );
  assert.ok(newBinding);
  assert.equal(newBinding.anchor_ids.length, 7);
  assert.equal(newBinding.anchor_ids.every(id => anchorById.has(id)), true);
});

test('새 관계와 ruleㆍscenarioㆍsourceㆍauthority 참조는 전체 정본에서 닫힌다', async () => {
  const {knowledge} = await loadComposition(manifestPath, {
    snapshotId: 'kr-knowledge-core-20260723-023',
  });
  const contentIds = new Set(
    knowledge.content_entries.map(entry => entry.content_id),
  );
  const ruleIds = new Set(knowledge.rule_cards.map(rule => rule.rule_id));
  const scenarioIds = new Set(
    knowledge.scenario_branches.map(scenario => scenario.scenario_id),
  );
  const sourceIds = new Set(
    knowledge.sources.map(source => source.coordinate_id),
  );
  const entry = knowledge.content_entries.find(
    value => value.content_id === newContentId,
  );
  assert.ok(entry);
  assert.equal(entry.rule_ids.every(id => ruleIds.has(id)), true);
  assert.equal(entry.scenario_ids.every(id => scenarioIds.has(id)), true);
  assert.equal(
    entry.source_coordinate_ids.every(id => sourceIds.has(id)),
    true,
  );
  assert.equal(
    entry.related_edges.every(
      edge => edge.target_kind !== 'content' || contentIds.has(edge.target_id),
    ),
    true,
  );
  assert.equal(
    topic.authority_bindings.every(binding =>
      contentIds.has(binding.from_id)),
    true,
  );
});
