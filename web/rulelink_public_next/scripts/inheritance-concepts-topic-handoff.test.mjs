import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const conceptPath = path.join(repoRoot, 'artifacts', 'publication', 'concepts', 'inheritance.json');
const manifestPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'manifest.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

const [group, manifest, current] = await Promise.all([
  readJson(conceptPath),
  readJson(manifestPath),
  readJson(currentPath),
]);

test('상속 핵심개념 3건이 주장별 공식 근거로 닫힌다', () => {
  assert.equal(group.schema, 'rulelink_public_concept_group_v1');
  assert.equal(group.concept_group_id, 'concept-group.inheritance');
  assert.deepEqual(
    group.concept_cards.map(card => card.concept_id),
    [
      'concept.kr.inheritance.legal_heir',
      'concept.kr.inheritance.debt_exceeds_assets',
      'concept.kr.inheritance.special_limited_acceptance',
    ],
  );

  const sources = new Map([
    ...current.knowledge.sources.map(source => [source.coordinate_id, source]),
    ...group.sources.map(source => [source.coordinate_id, source]),
  ]);
  for (const card of group.concept_cards) {
    assert.equal(card.editorial_status, 'approved');
    assert.match(card.version, /^\d+\.\d+\.\d+$/);
    assert.ok(card.assertions.length >= 2, `${card.concept_id}: 주장이 부족합니다.`);
    const roles = new Set(card.assertions.map(assertion => assertion.role));
    assert.ok(roles.has('plain_definition'), `${card.concept_id}: 쉬운 설명이 없습니다.`);
    assert.ok(roles.has('legal_definition'), `${card.concept_id}: 법률상 정의가 없습니다.`);
    for (const assertion of card.assertions) {
      assert.ok(assertion.text_ko.trim());
      assert.ok(assertion.source_coordinate_ids.length > 0);
      for (const sourceId of assertion.source_coordinate_ids) {
        assert.ok(sources.has(sourceId), `${card.concept_id}: 근거가 닫히지 않았습니다: ${sourceId}`);
      }
    }
  }
});

test('개념이 기존 법리와 상세 콘텐츠를 실제 식별자로 연결한다', () => {
  const rules = new Set(current.knowledge.rule_cards.map(rule => rule.rule_id));
  const entries = new Set(current.knowledge.content_entries.map(entry => entry.content_id));
  const concepts = new Set(group.concept_cards.map(card => card.concept_id));

  for (const card of group.concept_cards) {
    assert.ok(card.related_rule_ids.length > 0);
    assert.ok(card.related_content_ids.length > 0);
    for (const ruleId of card.related_rule_ids) assert.ok(rules.has(ruleId), `없는 법리: ${ruleId}`);
    for (const contentId of card.related_content_ids) assert.ok(entries.has(contentId), `없는 콘텐츠: ${contentId}`);
    for (const conceptId of card.related_concept_ids) assert.ok(concepts.has(conceptId), `없는 개념: ${conceptId}`);
  }
});

test('추가 공식 근거 좌표는 활성 DB 확인값과 공개 안전계약을 지킨다', () => {
  const expectedSnapshots = new Map([
    ['civil_act_ko_1005', 'snapshot:65acc1ebd49682acb96d642441b89a95'],
    ['precedent_case:194447', 'snapshot:49bf117b990b0a9e2576f7d2209c6d52'],
    ['precedent_case:84315', 'snapshot:fe8a73beddf423ba7ea538718a2e76b3'],
  ]);
  assert.equal(group.sources.length, expectedSnapshots.size);
  for (const source of group.sources) {
    assert.equal(source.source_snapshot_id, expectedSnapshots.get(source.source_id));
    assert.match(source.official_url, /^https:\/\/www\.law\.go\.kr\//);
    assert.ok(!('source_hash' in source), `공개 근거에 source_hash가 남았습니다: ${source.coordinate_id}`);
  }
});

test('인적 저자 표기를 넣지 않고 통합 전후 모두 검증 가능하다', () => {
  const serialized = JSON.stringify(group);
  for (const forbidden of ['author', 'byline', 'reviewer_name', '박규상']) {
    assert.ok(!serialized.includes(forbidden), `인적 표기가 남았습니다: ${forbidden}`);
  }

  const descriptor = (manifest.concepts ?? []).find(item => item.concept_group_id === group.concept_group_id);
  if (descriptor) {
    assert.equal(descriptor.file, 'inheritance.json');
    const published = new Set((current.knowledge.concept_cards ?? []).map(card => card.concept_id));
    for (const card of group.concept_cards) assert.ok(published.has(card.concept_id));
  }
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
