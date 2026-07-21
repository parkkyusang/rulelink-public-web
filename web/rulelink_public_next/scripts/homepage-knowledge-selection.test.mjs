import assert from 'node:assert/strict';
import test from 'node:test';

import {selectHomepageKnowledge} from '../src/lib/homepage-knowledge-selection.ts';

function entry(content_id, reviewed_at, hub_ids, title_ko = content_id) {
  return {content_id, reviewed_at, hub_ids, title_ko};
}

test('홈 대표 지식은 최신순 안에서 주제의 폭을 먼저 확보한다', () => {
  const entries = [
    entry('hub-a-old', '2026-07-20T00:00:00Z', ['hub-a']),
    entry('without-hub-newest', '2026-07-24T00:00:00Z', []),
    entry('hub-a-new', '2026-07-23T00:00:00Z', ['hub-a']),
    entry('hub-b-new', '2026-07-22T00:00:00Z', ['hub-b']),
    entry('hub-c-new', '2026-07-21T00:00:00Z', ['hub-c']),
  ];

  assert.deepEqual(
    selectHomepageKnowledge(entries, 3).map(item => item.content_id),
    ['hub-a-new', 'hub-b-new', 'hub-c-new'],
  );
  assert.deepEqual(
    selectHomepageKnowledge(entries, 4).map(item => item.content_id),
    ['hub-a-new', 'hub-b-new', 'hub-c-new', 'without-hub-newest'],
  );
});

test('홈 대표 지식 선택은 원본 순서를 바꾸지 않고 제한값을 지킨다', () => {
  const entries = [
    entry('older', '2026-07-20T00:00:00Z', ['hub-a']),
    entry('newer', '2026-07-21T00:00:00Z', ['hub-a']),
  ];
  const originalOrder = entries.map(item => item.content_id);

  assert.deepEqual(selectHomepageKnowledge(entries, 1).map(item => item.content_id), ['newer']);
  assert.deepEqual(entries.map(item => item.content_id), originalOrder);
  assert.deepEqual(selectHomepageKnowledge(entries, 0), []);
});
