import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const topicPath = path.join(repoRoot, 'artifacts', 'publication', 'topics', 'family-inheritance.json');
const topic = JSON.parse(await readFile(topicPath, 'utf8'));

test('상속 법리카드는 제목·핵심 법리·법적 효과를 중복 없이 구분한다', () => {
  assert.ok(topic.rule_cards.length > 0);

  for (const rule of topic.rule_cards) {
    assert.ok(!rule.title_ko.includes('…'), `${rule.rule_id}: 제목이 말줄임표로 잘렸습니다.`);
    assert.notEqual(
      normalize(rule.proposition_ko),
      normalize(rule.norm.legal_effect_ko),
      `${rule.rule_id}: 핵심 법리와 법적 효과가 같은 문장입니다.`,
    );
  }
});

test('법정상속 순위 카드는 순위 기준과 실제 효과를 나누어 설명한다', () => {
  const rule = topic.rule_cards.find(candidate => candidate.rule_id === 'rule.family-inheritance.rule-inheritance-order');
  assert.ok(rule);
  assert.equal(rule.title_ko, '법정상속인의 순위');
  assert.match(rule.proposition_ko, /직계비속.*직계존속.*형제자매.*4촌 이내 방계혈족/);
  assert.match(rule.norm.legal_effect_ko, /선순위 상속인.*후순위 혈족.*공동상속인/);
});

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}
