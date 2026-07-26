import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {loadComposition} from './compose-publication-knowledge.mjs';
import {
  validatePublicAuthorityReading,
} from './validate-public-authority-reading.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicRelativePath = 'artifacts/publication/topics/labor-wages.json';
const topicPath = path.join(repositoryRoot, topicRelativePath);
const manifestPath = path.join(
  repositoryRoot,
  'artifacts',
  'publication',
  'topics',
  'manifest.json',
);
const baselineCommit = 'cee162868a0272fc278b2c34365804441f17dfdd';
const targetContentId = 'content.final-wages-after-retirement-14-days';
const targetSourceId = 'coord.labor-wages.labor-standards-ko-0036';
const authorityBindingId = 'binding.final-wages.labor-standards.36';
const officialText =
  '제36조(금품 청산) 사용자는 근로자가 사망 또는 퇴직한 경우에는 그 지급 사유가 발생한 때부터 14일 이내에 임금, 보상금, 그 밖의 모든 금품을 지급하여야 한다. 다만, 특별한 사정이 있을 경우에는 당사자 사이의 합의에 의하여 기일을 연장할 수 있다.';
const officialTextHash =
  '4c92bffe9903efead5eb5c62e30abf45006614e3845a555e9e8fa198cfdb1541';

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
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  ),
);

function byId(values, key) {
  return new Map(values.map(value => [value[key], value]));
}

function normalizeSearch(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-z가-힣]/gu, '');
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function targetEntry(value) {
  return value.content_entries.find(
    entry => entry.content_id === targetContentId,
  );
}

test('퇴직 뒤 14일 전후와 연장합의 유무를 실제 다음 행동으로 연결한다', () => {
  const entry = targetEntry(topic);
  assert.equal(
    entry.audience_situation_ko,
    '퇴직한 지 14일이 지났는데 마지막 급여·수당이 입금되지 않았고, 회사는 다음 급여일이나 자금 사정만 말하는 경우',
  );
  assert.match(entry.one_line_answer_ko, /서면 청구/u);
  assert.match(entry.one_line_answer_ko, /고용노동부 진정/u);
  assert.match(entry.one_line_answer_ko, /민사청구/u);

  assert.deepEqual(
    entry.body_sections.map(section => section.heading_ko),
    [
      '1. 오늘이 14일 전인지 후인지 먼저 가른다',
      '2. 늦게 주기로 합의했는지는 네 가지로 확인한다',
      '3. 미지급액과 증거를 한 묶음으로 만든다',
      '4. 서면 청구 뒤 진정과 민사를 목적에 맞게 나눈다',
    ],
  );

  const actions = entry.action_steps_ko.join('\n');
  const expectedSequence = [
    '퇴직일을 확정',
    '미지급 항목·금액·근거',
    '지급기일 연장',
    '서면을 회사에 보내고',
    '임금체불 진정',
    '민사절차',
  ];
  let cursor = -1;
  for (const phrase of expectedSequence) {
    const next = actions.indexOf(phrase);
    assert.ok(next > cursor, `행동 순서 누락 또는 역전: ${phrase}`);
    cursor = next;
  }

  const body = entry.body_sections
    .flatMap(section => [section.heading_ko, ...section.paragraphs_ko])
    .join('\n');
  for (const phrase of [
    '아직 14일 전이면',
    '14일이 지났고',
    '특별한 사정',
    '근로자의 동의',
    '대상 금액',
    '새 지급일',
    '일부 입금',
    '도달을 확인',
    '집행권원',
  ]) {
    assert.match(body, new RegExp(phrase, 'u'), phrase);
  }
});

test('미지급 증거와 절차 경계를 명시하고 14일 경과만으로 결론을 과장하지 않는다', () => {
  const entry = targetEntry(topic);
  const facts = entry.facts_to_check_ko.join('\n');
  for (const phrase of [
    '근로관계가 끝난 사유와 날짜',
    '미지급 항목별 금액과 계산 근거',
    '임금명세서·근로시간 기록·급여 입금내역',
    '근로자의 동의 여부',
    '서면 청구의 발송일·도달 여부',
    '사업주 또는 법인의 정확한 명칭',
  ]) {
    assert.match(facts, new RegExp(phrase, 'u'), phrase);
  }
  assert.match(entry.caution_ko, /자동 확정되지는 않는다/u);
  assert.match(entry.caution_ko, /민사상 지급명령·판결과 강제집행을 대신하지 않/u);
  assert.doesNotMatch(entry.caution_ko, /반드시 지급받|승소|처벌된다/u);
});

test('검색의도는 축약 키워드가 아니라 사용자의 실제 체불 질문이고 다른 글과 exact 충돌하지 않는다', async () => {
  const entry = targetEntry(topic);
  assert.deepEqual(entry.search_intents_ko, [
    '퇴사한 지 14일이 지났는데 월급이 안 들어왔어요',
    '퇴직 후 마지막 급여를 안 주면 노동청에 언제 신고하나요',
    '회사가 다음 월급날에 준다는데 퇴직 임금 지급기한은 언제인가요',
  ]);
  const normalized = entry.search_intents_ko.map(normalizeSearch);
  assert.equal(new Set(normalized).size, normalized.length);
  assert.ok(normalized.every(value => value.length >= 18));

  const {knowledge} = await loadComposition(manifestPath, {
    snapshotId: 'labor-wages-problem-flow-preview',
  });
  const outside = new Map();
  for (const content of knowledge.content_entries) {
    if (content.content_id === targetContentId) continue;
    for (const query of content.search_intents_ko ?? []) {
      const key = normalizeSearch(query);
      const values = outside.get(key) ?? [];
      values.push(content.content_id);
      outside.set(key, values);
    }
  }
  for (const [index, key] of normalized.entries()) {
    assert.deepEqual(
      outside.get(key) ?? [],
      [],
      entry.search_intents_ko[index],
    );
  }
});

test('로컬 원장으로 확인한 근로기준법 제36조 원문이 source unit에서 reading과 content binding까지 닫힌다', async () => {
  assert.equal(sha256(officialText), officialTextHash);
  const source = topic.sources.find(
    value => value.coordinate_id === targetSourceId,
  );
  assert.deepEqual(source, {
    coordinate_id: targetSourceId,
    source_id: 'labor_standards_ko_0036',
    source_kind: 'statute',
    law_key: 'labor-standards-act',
    law_name_ko: '근로기준법',
    article_no: '제36조',
    official_url:
      'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B7%BC%EB%A1%9C%EA%B8%B0%EC%A4%80%EB%B2%95/%EC%A0%9C36%EC%A1%B0',
    official_url_http_status: 200,
    source_snapshot_id: '1a407952c492676358a540b100de3c04',
    source_version_key: `sha256:${officialTextHash}`,
    last_verified_at: '2026-07-21T08:15:00+00:00',
  });

  assert.deepEqual(topic.source_version_bridges, [{
    bridge_id: 'bridge.labor-standards.36.v1',
    source_coordinate_id: targetSourceId,
    source_snapshot_id: '1a407952c492676358a540b100de3c04',
    source_version_key: `sha256:${officialTextHash}`,
    validation_status: 'verified',
  }]);
  assert.equal(topic.source_authority_units.length, 1);
  assert.equal(
    topic.source_authority_units[0].official_text_ko,
    officialText,
  );
  assert.equal(
    topic.source_authority_units[0].official_text_hash,
    officialTextHash,
  );
  assert.deepEqual(
    targetEntry(topic).authority_binding_ids,
    [authorityBindingId],
  );
  assert.equal(topic.authority_reading_units.length, 1);
  assert.match(
    topic.authority_reading_units[0].explanation_paragraphs[0].text_ko,
    /이 문언만으로 개별 금액이나 근로자성이 확정된다고 과장하지 않습니다/u,
  );
  assert.deepEqual(topic.authority_bindings, [{
    binding_id: authorityBindingId,
    from_kind: 'content',
    from_id: targetContentId,
    to_kind: 'authority_reading_unit',
    to_authority_reading_unit_id: 'authority.labor-standards.36.v1',
    anchor_ids: ['anchor.labor-standards.36.article'],
  }]);

  const {knowledge} = await loadComposition(manifestPath, {
    snapshotId: 'labor-wages-authority-preview',
  });
  const result = validatePublicAuthorityReading({
    schema: 'rulelink_editorial_preview_bundle_v1',
    generated_at: '2026-07-26T12:00:00.000Z',
    knowledge,
  });
  assert.ok(
    result.activeAuthorityReadingUnitIds.includes(
      'authority.labor-standards.36.v1',
    ),
  );
});

test('비대상 법리·숫자·행동·관계와 기존 주제 구조는 기준 커밋과 동일하다', () => {
  assert.equal(topic.content_entries.length, baseline.content_entries.length);
  assert.deepEqual(topic.rule_cards, baseline.rule_cards);
  assert.deepEqual(topic.scenario_branches, baseline.scenario_branches);
  assert.deepEqual(topic.hubs, baseline.hubs);

  const currentContents = byId(topic.content_entries, 'content_id');
  const baselineContents = byId(baseline.content_entries, 'content_id');
  for (const [contentId, entry] of currentContents) {
    if (contentId === targetContentId) continue;
    assert.deepEqual(entry, baselineContents.get(contentId), contentId);
  }

  const currentSources = byId(topic.sources, 'coordinate_id');
  const baselineSources = byId(baseline.sources, 'coordinate_id');
  for (const [coordinateId, source] of currentSources) {
    if (coordinateId === targetSourceId) continue;
    assert.deepEqual(source, baselineSources.get(coordinateId), coordinateId);
  }

  const current = targetEntry(topic);
  const before = targetEntry(baseline);
  for (const field of [
    'content_id',
    'content_type',
    'editorial_status',
    'reviewed_at',
    'expires_at',
    'slug',
    'rule_ids',
    'scenario_ids',
    'source_coordinate_ids',
    'hub_ids',
    'related_content_ids',
    'related_edges',
  ]) {
    assert.deepEqual(current[field], before[field], field);
  }

  const baselineTop = structuredClone(baseline);
  const currentTop = structuredClone(topic);
  for (const value of [baselineTop, currentTop]) {
    delete value.sources;
    delete value.content_entries;
    delete value.source_version_bridges;
    delete value.source_authority_units;
    delete value.authority_reading_units;
    delete value.authority_bindings;
  }
  assert.deepEqual(currentTop, baselineTop);
});
