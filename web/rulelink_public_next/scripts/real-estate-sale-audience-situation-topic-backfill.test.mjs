import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {buildPublicationExpansionBacklog} from './build-publication-expansion-backlog.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(
  repoRoot,
  'artifacts',
  'publication',
  'topics',
  'real-estate-sale.json',
);
const currentPath = path.join(
  repoRoot,
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);
const coverageManifestPath = path.join(
  repoRoot,
  'artifacts',
  'publication',
  'coverage',
  'coverage-manifest.json',
);

const expectedAudienceById = new Map([
  [
    'content.broker-confirmation-explanation-checklist',
    '공인중개사를 통해 부동산을 계약하기 전, 확인·설명서와 근거자료로 권리관계·이용제한·실제 상태를 점검하려는 경우',
  ],
  [
    'content.earnest-money-rescission-cutoff',
    '부동산 계약금을 실제로 지급한 뒤 계약을 끝내려 하며, 이행착수 여부와 해약금 특약·통보 시점을 확인하려는 경우',
  ],
  [
    'content.hidden-defect-after-purchase',
    '부동산을 산 뒤 누수 등 하자를 발견해, 하자의 원인·발견일·계약 목적에 미치는 영향과 사전 인식 여부를 확인하려는 경우',
  ],
  [
    'content.interim-payment-and-concurrent-closing',
    '중도금을 지급한 부동산 매매의 잔금일을 앞두고, 잔금 지급과 등기서류·권리말소의 이행 순서를 확인하려는 경우',
  ],
  [
    'content.mistake-fraud-in-real-estate-contract',
    '부동산의 면적·용도·개발계획 등에 관한 설명이 사실과 달라, 착오나 기망의 내용과 계약 취소 검토에 필요한 사실을 확인하려는 경우',
  ],
  [
    'content.ownership-changes-only-after-registration',
    '매매대금을 지급했지만 소유권이전등기가 아직 완료되지 않아, 등기 상태와 매도인의 이전 협력 여부를 확인하려는 경우',
  ],
  [
    'content.real-estate-reservation-deposit-meaning',
    '정식 계약서 작성 전 가계약금을 보낸 뒤 거래를 중단하려 하며, 핵심 조건 합의와 반환·몰취 약정 여부를 확인하려는 경우',
  ],
  [
    'content.real-estate-sale-contract-before-signing',
    '부동산 매매 조건에는 합의했지만 계약서에 아직 서명하지 않아, 목적물·대금·체결 의사와 추가 조건을 확인하려는 경우',
  ],
  [
    'content.real-estate-transaction-reporting-30-days',
    '부동산 매매계약을 체결했거나 신고한 계약이 해제·무효·취소되어, 계약일 또는 확정일부터 30일 신고기한과 신고 주체를 확인하려는 경우',
  ],
  [
    'content.seller-does-not-own-property',
    '매도인이 현재 등기명의자가 아닌 사실을 알게 되어, 매도인의 권한·권리 취득 가능성과 자신의 인식 상태를 확인하려는 경우',
  ],
  [
    'content.seller-misses-title-transfer-date',
    '잔금은 준비했지만 매도인이 약정일에 소유권이전을 미루어, 미이행 내용·최고·이행 준비와 거절 여부를 확인하려는 경우',
  ],
]);

const newlyCompletedIds = new Set(
  [...expectedAudienceById.keys()].filter(
    contentId =>
      contentId !== 'content.real-estate-transaction-reporting-30-days',
  ),
);
const approvedNonAudienceDigest =
  '9964db4e17c723c8f5ac9392e2881786398a94a4002ec2332b59a58725d66780';

const readJson = async filePath =>
  JSON.parse(await readFile(filePath, 'utf8'));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function normalizedText(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/gu, '');
}

function topicWithoutNewAudienceFields(topic) {
  const value = structuredClone(topic);
  for (const entry of value.content_entries ?? []) {
    if (newlyCompletedIds.has(entry.content_id)) {
      delete entry.audience_situation_ko;
    }
  }
  return value;
}

function numbersIn(value) {
  return new Set(String(value).match(/\d+(?:\.\d+)?/gu) ?? []);
}

test('승인된 11개 상황 문구만 완성하고 나머지 주제 정본은 그대로 둔다', async () => {
  const topic = await readJson(topicPath);
  const byId = new Map(
    topic.content_entries.map(entry => [entry.content_id, entry]),
  );

  assert.equal(expectedAudienceById.size, 11);
  assert.equal(newlyCompletedIds.size, 10);
  assert.equal(
    digest(topicWithoutNewAudienceFields(topic)),
    approvedNonAudienceDigest,
  );

  for (const [contentId, expectedAudience] of expectedAudienceById) {
    const entry = byId.get(contentId);
    assert.ok(entry, `${contentId}: 콘텐츠가 존재해야 합니다.`);
    assert.equal(entry.audience_situation_ko, expectedAudience, contentId);
    assert.deepEqual(entry.hub_ids, ['hub.real-estate-sale'], contentId);
    assert.equal(entry.rule_ids.length, 1, `${contentId}: Rule`);
    assert.equal(entry.scenario_ids.length, 1, `${contentId}: Scenario`);
    assert.ok(entry.source_coordinate_ids.length > 0, `${contentId}: Source`);
    assert.equal(entry.facts_to_check_ko.length, 4, `${contentId}: facts`);
    assert.equal(entry.action_steps_ko.length, 4, `${contentId}: actions`);
  }

  assert.deepEqual(
    topic.content_entries
      .filter(entry => !entry.audience_situation_ko.trim())
      .map(entry => entry.content_id)
      .sort(),
    [],
  );
});

test('상황 문구는 제목·slug·검색어 복사가 아니며 새 숫자를 만들지 않는다', async () => {
  const topic = await readJson(topicPath);
  const byId = new Map(
    topic.content_entries.map(entry => [entry.content_id, entry]),
  );
  const normalizedAudiences = new Set();
  const scenarioById = new Map(
    topic.scenario_branches.map(scenario => [scenario.scenario_id, scenario]),
  );

  for (const contentId of expectedAudienceById.keys()) {
    const entry = byId.get(contentId);
    const audience = normalizedText(entry.audience_situation_ko);
    const copiedValues = [
      entry.title_ko,
      entry.slug,
      ...entry.search_intents_ko,
    ].map(normalizedText);
    assert.ok(!copiedValues.includes(audience), `${contentId}: 검색 문구 복사`);
    assert.ok(!normalizedAudiences.has(audience), `${contentId}: 상황 문구 중복`);
    normalizedAudiences.add(audience);

    const supportText = [
      entry.title_ko,
      entry.one_line_answer_ko,
      ...entry.facts_to_check_ko,
      ...entry.search_intents_ko,
      ...entry.scenario_ids.flatMap(scenarioId => {
        const scenario = scenarioById.get(scenarioId);
        return scenario
          ? [
              scenario.question_ko,
              scenario.decision_fact_ko,
              scenario.when_true_ko,
              scenario.when_false_ko,
            ]
          : [];
      }),
    ].join(' ');
    const supportedNumbers = numbersIn(supportText);
    for (const number of numbersIn(entry.audience_situation_ko)) {
      assert.ok(
        supportedNumbers.has(number),
        `${contentId}: 근거 필드에 없는 숫자 ${number}`,
      );
    }
  }
});

test('Rule·Scenario·Source·Hub·관계 변조는 비상황 정본 digest를 통과하지 못한다', async () => {
  const topic = await readJson(topicPath);
  const targetId = 'content.real-estate-sale-contract-before-signing';
  const mutations = [
    value => value.content_entries.find(entry => entry.content_id === targetId)
      .rule_ids.push('rule.invalid'),
    value => value.content_entries.find(entry => entry.content_id === targetId)
      .scenario_ids.splice(0),
    value => value.content_entries.find(entry => entry.content_id === targetId)
      .source_coordinate_ids.push('coord.invalid'),
    value => value.content_entries.find(entry => entry.content_id === targetId)
      .hub_ids.splice(0),
    value => value.content_entries.find(entry => entry.content_id === targetId)
      .related_content_ids.reverse(),
  ];

  for (const mutate of mutations) {
    const value = structuredClone(topic);
    mutate(value);
    assert.notEqual(
      digest(topicWithoutNewAudienceFields(value)),
      approvedNonAudienceDigest,
    );
  }
});

test('11개 완성 뒤 backlog 수치는 요청한 구조 개선만 반영한다', async () => {
  const tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'rulelink-real-estate-audience-'),
  );
  try {
    const topic = await readJson(topicPath);
    const audienceById = new Map(
      topic.content_entries.map(entry => [
        entry.content_id,
        entry.audience_situation_ko,
      ]),
    );
    const bundle = await readJson(currentPath);
    for (const entry of bundle.knowledge.content_entries) {
      if (expectedAudienceById.has(entry.content_id)) {
        entry.audience_situation_ko = audienceById.get(entry.content_id);
      }
    }
    const bundleText = `${JSON.stringify(bundle, null, 2)}\n`;
    const bundlePath = path.join(tempDirectory, 'bundle.json');
    await writeFile(bundlePath, bundleText, 'utf8');

    const manifest = await readJson(coverageManifestPath);
    manifest.base_bundle_sha256 = createHash('sha256')
      .update(bundleText)
      .digest('hex');
    const manifestPath = path.join(tempDirectory, 'coverage-manifest.json');
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    const backlog = await buildPublicationExpansionBacklog({
      bundlePath,
      manifestPath,
    });
    assert.deepEqual(backlog.summary, {
      coverage_declared: 5,
      coverage_unmapped: 279,
      declared_incomplete: 5,
      graph_ready_unmapped: 231,
      structure_incomplete: 48,
      verified_release: 0,
    });
    assert.equal(
      backlog.entries.filter(entry =>
        entry.readiness_state === 'structure_incomplete'
        && entry.gap_codes.includes('audience_situation_missing'),
      ).length,
      44,
    );
    assert.equal(
      backlog.entries.filter(entry =>
        entry.gap_codes.includes('audience_situation_missing'),
      ).length,
      47,
    );
    assert.equal(
      backlog.entries.filter(entry =>
        entry.gap_codes.includes('scenario_missing'),
      ).length,
      8,
    );
  } finally {
    await rm(tempDirectory, {recursive: true, force: true});
  }
});
