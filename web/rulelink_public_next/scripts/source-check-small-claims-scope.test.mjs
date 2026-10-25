import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('사건 복잡성을 소액사건 자동 제외 요건으로 삼지 않는다', () => {
  const topic = JSON.parse(readFileSync(new URL('../../../artifacts/publication/topics/remedy-path-comparisons.json', import.meta.url), 'utf8'));
  const entry = topic.content_entries.find((item) => item.content_id === 'content.small-claims-trial-vs-general-civil-lawsuit');
  const rule = topic.rule_cards.find((item) => item.rule_id === 'rule.remedy-path-comparisons.06');
  assert.ok(entry && rule);
  assert.match(entry.one_line_answer_ko, /복잡하다는 이유만으로 소액사건 적용이 없어지는 것은 아닙니다/);
  assert.match(rule.proposition_ko, /복잡하다는 사정만으로 소액사건 적용이 배제되지는 않습니다/);
  assert.match(rule.norm.conditions_ko, /법정 병합 예외/);
  assert.match(entry.body_sections[1].paragraphs_ko[0], /복잡하다는 사정만으로 일반 민사절차로 바뀌는 것은 아닙니다/);
  assert.doesNotMatch(JSON.stringify({entry, rule}), /범위를 벗어나거나 복잡한 청구는 일반 민사소송/);
});
