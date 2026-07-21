import assert from 'node:assert/strict';
import test from 'node:test';

import {buildConciergeNewMatterUrl, buildConciergeReviewDraft} from '../src/lib/concierge-handoff.ts';

test('컨시어지 새 사건 주소는 허용된 호스트에 new=1만 추가한다', () => {
  assert.equal(
    buildConciergeNewMatterUrl('https://liale-review.lolphysical.xyz'),
    'https://liale-review.lolphysical.xyz/?new=1',
  );
  assert.throws(
    () => buildConciergeNewMatterUrl('https://example.com'),
    /허용되지 않은 컨시어지 주소/,
  );
});

test('공개 안내와 확인 상태를 사용자 편집용 검토요청 초안으로 만든다', () => {
  const draft = buildConciergeReviewDraft({
    actionSteps: ['계약서 확보', '상대방에게 통지'],
    checkedActionIndexes: [0, 99],
    checkedFactIndexes: [1],
    decisionFacts: ['계약일', '계약일', '지급일'],
    factsToCheck: ['계약서', '입금내역'],
    question: '대금을 돌려받을 수 있나요?',
    reviewedAt: '2026-07-21T08:30:00+00:00',
    sourceUrl: 'https://rulelink.lolphysical.xyz/ko/knowledge/sample',
    title: '샘플 안내',
  });

  assert.match(draft, /제목: 샘플 안내/);
  assert.match(draft, /기준 확인일: 2026-07-21/);
  assert.match(draft, /계약일: \[내용 입력\]/);
  assert.equal((draft.match(/계약일: \[내용 입력\]/g) ?? []).length, 1);
  assert.match(draft, /현재 준비하거나 확인했다고 표시한 사실\n- 입금내역/);
  assert.match(draft, /아직 확인 표시하지 않은 사실\n- 계약서/);
  assert.match(draft, /현재 완료했다고 표시한 행동\n- 계약서 확보/);
  assert.doesNotMatch(draft, /99/);
});
