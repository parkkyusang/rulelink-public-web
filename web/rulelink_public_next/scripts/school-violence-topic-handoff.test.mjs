import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'school-violence.json');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');

const [topic, current] = await Promise.all([readJson(topicPath), readJson(currentPath)]);
const sources = new Map(topic.sources.map(source => [source.coordinate_id, source]));
const rules = new Map(topic.rule_cards.map(rule => [rule.rule_id, rule]));
const scenarios = new Map(topic.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
const entries = new Map(topic.content_entries.map(entry => [entry.content_id, entry]));
const currentEntries = new Map(current.knowledge.content_entries.map(entry => [entry.content_id, entry]));
const relatedUniverse = new Set([...entries.keys(), ...currentEntries.keys()]);

test('학교폭력 10개 생활질문의 근거·법리·사실분기를 닫는다', () => {
  assert.equal(topic.schema, 'rulelink_public_knowledge_topic_v1');
  assert.equal(topic.topic_id, 'hub.school-violence');
  assert.equal(topic.sources.length, 12);
  assert.equal(topic.rule_cards.length, 10);
  assert.equal(topic.scenario_branches.length, 10);
  assert.equal(topic.content_entries.length, 10);
  assert.equal(topic.topic_hubs.length, 1);
  assert.deepEqual(topic.topic_hubs[0].content_ids, [...entries.keys()]);

  for (const rule of rules.values()) {
    assert.ok(rule.source_coordinate_ids.length > 0, `${rule.rule_id}: 공식 근거가 없습니다.`);
    assert.notEqual(
      normalize(rule.proposition_ko),
      normalize(rule.norm.legal_effect_ko),
      `${rule.rule_id}: 적용명제와 법률효과가 중복됩니다.`,
    );
    assert.ok(rule.norm.actor_ko.trim() && rule.norm.conditions_ko.trim() && rule.norm.legal_effect_ko.trim());
    for (const sourceId of rule.source_coordinate_ids) {
      assert.ok(sources.has(sourceId), `${rule.rule_id}: 없는 근거 ${sourceId}`);
    }
  }

  for (const scenario of scenarios.values()) {
    assert.ok(scenario.rule_ids.length > 0, `${scenario.scenario_id}: 연결 법리가 없습니다.`);
    assert.ok(scenario.source_coordinate_ids.length > 0, `${scenario.scenario_id}: 연결 근거가 없습니다.`);
    for (const ruleId of scenario.rule_ids) assert.ok(rules.has(ruleId), `${scenario.scenario_id}: 없는 법리 ${ruleId}`);
    for (const sourceId of scenario.source_coordinate_ids) {
      assert.ok(sources.has(sourceId), `${scenario.scenario_id}: 없는 근거 ${sourceId}`);
    }
  }

  for (const entry of entries.values()) {
    assert.equal(entry.editorial_status, 'approved');
    assert.ok(entry.audience_situation_ko.trim(), `${entry.content_id}: 대상 상황이 없습니다.`);
    assert.ok(entry.key_points_ko.length >= 3, `${entry.content_id}: 핵심 요점이 부족합니다.`);
    assert.ok(entry.action_steps_ko.length >= 5, `${entry.content_id}: 행동 단계가 부족합니다.`);
    assert.ok(entry.facts_to_check_ko.length >= 8, `${entry.content_id}: 확인 사실이 부족합니다.`);
    assert.ok(entry.body_sections.length >= 2, `${entry.content_id}: 본문 구성이 부족합니다.`);
    assert.ok(entry.search_intents_ko.length >= 3, `${entry.content_id}: 검색 의도가 부족합니다.`);
    assert.ok(entry.rule_ids.length > 0 && entry.scenario_ids.length > 0 && entry.source_coordinate_ids.length > 0);
    for (const ruleId of entry.rule_ids) assert.ok(rules.has(ruleId), `${entry.content_id}: 없는 법리 ${ruleId}`);
    for (const scenarioId of entry.scenario_ids) {
      assert.ok(scenarios.has(scenarioId), `${entry.content_id}: 없는 분기 ${scenarioId}`);
    }
    for (const sourceId of entry.source_coordinate_ids) {
      assert.ok(sources.has(sourceId), `${entry.content_id}: 없는 근거 ${sourceId}`);
    }
    for (const relatedId of entry.related_content_ids) {
      assert.ok(relatedUniverse.has(relatedId), `${entry.content_id}: 없는 관련 콘텐츠 ${relatedId}`);
    }
  }
});

test('활성 DB에서 확인한 학교폭력예방법 현행 조문 12개의 좌표와 스냅샷을 고정한다', () => {
  const expected = new Map([
    ['law_009620_ko_0002', 'snapshot:e9bbfe4eb86a1c167a7ca3d8e394ac79'],
    ['law_009620_ko_0012', 'snapshot:7003e6bbdcdd8a2809e8ac8013c93221'],
    ['law_009620_ko_0013_02', 'snapshot:cfa4736c9b051b10bd1ce8ee00f24ca7'],
    ['law_009620_ko_0014', 'snapshot:6829b1c6c38fd2faaf7de6945facf9e2'],
    ['law_009620_ko_0016', 'snapshot:2eb4f14a2a498ef6edee45bd1db9bce4'],
    ['law_009620_ko_0016_04', 'snapshot:83d6485781ed1bc0781e55c6f19d5281'],
    ['law_009620_ko_0017', 'snapshot:e4072a5574300cdfb17e013673dc3ea31'],
    ['law_009620_ko_0017_02', 'snapshot:7375cbe46389a58b4bcc678e21612c8d'],
    ['law_009620_ko_0017_03', 'snapshot:7f48eb124dde2c1308e554444e8267db'],
    ['law_009620_ko_0017_04', 'snapshot:36601ce5e9f633dfce50e70dac2db273'],
    ['law_009620_ko_0020', 'snapshot:217c46e33812b9c1891db093bf615132d'],
    ['law_009620_ko_0021', 'snapshot:60b91e43287c22240a813fedfa4926e1'],
  ]);
  assert.equal(expected.size, topic.sources.length);
  for (const source of topic.sources) {
    assert.equal(source.source_snapshot_id, expected.get(source.source_id), source.source_id);
    assert.equal(source.law_name_ko, '학교폭력예방 및 대책에 관한 법률');
    assert.ok(source.official_url.startsWith('https://www.law.go.kr/%EB%B2%95%EB%A0%B9/'));
    assert.ok(!source.official_url.includes('lawView.do'));
  }
});

test('신고·자체해결·피해보호·가해조치·불복의 핵심 법리를 고정한다', () => {
  assert.match(rules.get('rule.school-violence.scope').proposition_ko, /학교 안에서 일어났는지만으로 정하지 않고.*학생을 대상으로/);
  assert.match(rules.get('rule.school-violence.report').norm.legal_effect_ko, /즉시 신고.*불이익/);
  assert.match(rules.get('rule.school-violence.school-resolution').norm.conditions_ko, /2주 이상.*재산피해.*지속성.*보복성/);
  assert.match(rules.get('rule.school-violence.school-resolution').norm.legal_effect_ko, /서면확인.*심의위원회에 보고/);
  assert.match(rules.get('rule.school-violence.victim-protection').norm.legal_effect_ko, /즉시 분리.*7일 이내/);
  assert.match(rules.get('rule.school-violence.cyber-deletion').norm.legal_effect_ko, /국가에 삭제지원.*비용/);
  assert.match(rules.get('rule.school-violence.offender-measures').norm.legal_effect_ko, /서면사과.*퇴학.*보복행위/);
  assert.match(rules.get('rule.school-violence.appeal-lawsuit').norm.legal_effect_ko, /행정심판.*행정소송/);
  assert.match(rules.get('rule.school-violence.stay-separation').norm.legal_effect_ko, /피해학생 측 의견.*분리/);
  assert.match(rules.get('rule.school-violence.confidentiality-records').norm.legal_effect_ko, /비공개.*개인정보를 제외.*공개/);

  assert.match(entries.get('content.school-violence-offender-measures').key_points_ko.join(' '), /의무교육과정 학생에게는 퇴학처분/);
  assert.match(entries.get('content.school-violence-appeal-lawsuit').caution_ko, /초기 조사결과.*최종 조치 처분/);
  assert.match(entries.get('content.school-violence-stay-separation').caution_ko, /본안 처분의 위법 여부.*최종 확정/);
  assert.match(entries.get('content.school-violence-confidentiality-records').caution_ko, /자유롭게 유포할 권리/);
});

test('행정불복 상세 정본으로 실제 외부 연결을 닫는다', () => {
  const appealId = 'content.administrative-appeal-vs-revocation-lawsuit';
  const stayId = 'content.administrative-appeal-suspension-vs-court-suspension';
  assert.ok(currentEntries.has(appealId), `현재 정본에 외부 연결 대상이 없습니다: ${appealId}`);
  assert.ok(currentEntries.has(stayId), `현재 정본에 외부 연결 대상이 없습니다: ${stayId}`);
  assert.deepEqual(entries.get('content.school-violence-appeal-lawsuit').related_content_ids, [appealId]);
  assert.deepEqual(entries.get('content.school-violence-stay-separation').related_content_ids, [stayId]);
});

test('새 식별자는 현재 정본과 충돌하지 않고 인적 표기·잘린 제목을 막는다', () => {
  const currentIds = new Set([
    ...current.knowledge.sources.map(item => item.coordinate_id),
    ...current.knowledge.rule_cards.map(item => item.rule_id),
    ...current.knowledge.scenario_branches.map(item => item.scenario_id),
    ...current.knowledge.content_entries.map(item => item.content_id),
    ...current.knowledge.topic_hubs.map(item => item.hub_id),
  ]);
  const newIds = [
    ...topic.sources.map(item => item.coordinate_id),
    ...topic.rule_cards.map(item => item.rule_id),
    ...topic.scenario_branches.map(item => item.scenario_id),
    ...topic.content_entries.map(item => item.content_id),
    ...topic.topic_hubs.map(item => item.hub_id),
  ];
  assert.equal(new Set(newIds).size, newIds.length);
  for (const id of newIds) assert.ok(!currentIds.has(id), `현재 정본과 식별자 충돌: ${id}`);

  const serialized = JSON.stringify(topic);
  for (const forbidden of ['author', 'byline', 'reviewer_name', '박규상', '동순…']) {
    assert.ok(!serialized.includes(forbidden), `금지 표현이 남았습니다: ${forbidden}`);
  }
  for (const title of [
    topic.topic_hubs[0].title_ko,
    ...topic.rule_cards.map(item => item.title_ko),
    ...topic.content_entries.map(item => item.title_ko),
  ]) assert.ok(!title.includes('…'), `잘린 제목: ${title}`);
});

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
