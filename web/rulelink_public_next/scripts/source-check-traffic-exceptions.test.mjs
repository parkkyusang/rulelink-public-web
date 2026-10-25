import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('처벌불원 특례와 중상해의 보험가입 특례 예외를 분리한다', () => {
  const topic = JSON.parse(readFileSync(new URL('../../../artifacts/publication/topics/auto-accident-insurance.json', import.meta.url), 'utf8'));
  const entry = topic.content_entries.find((item) => item.content_id === 'content.auto-accident-insurance-settlement-criminal-effect');
  assert.ok(entry);
  assert.match(entry.one_line_answer_ko, /제3조의 법정 예외에는 적용되지 않습니다/);
  assert.match(entry.one_line_answer_ko, /중상해가 보험가입 특례에 미치는 영향은 별도로 확인/);
  assert.doesNotMatch(entry.one_line_answer_ko, /법정 예외와 중상해 여부가 있으면/);
});
