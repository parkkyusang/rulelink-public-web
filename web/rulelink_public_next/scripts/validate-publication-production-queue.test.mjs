import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {validateProductionQueue} from './validate-publication-production-queue.mjs';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const queuePath = path.join(repoRoot, 'artifacts', 'publication', 'production-queue.json');
const queue = JSON.parse(await readFile(queuePath, 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('현재 공개 콘텐츠 생산 대기열은 역할·중복·의존성 계약을 만족한다', () => {
  assert.deepEqual(validateProductionQueue(queue), []);
  assert.equal(queue.items.length, 20);
  for (const status of ['ready_for_integration', 'needs_rework', 'migration_required', 'blocked', 'integrated']) {
    assert.equal(
      queue.audit_summary[status],
      queue.items.filter(item => item.status === status).length,
      `${status} 요약 수량은 대기열에서 계산한 값과 같아야 합니다.`,
    );
  }
  assert.equal(
    queue.audit_summary.semantic_overlap_decisions,
    queue.items.reduce((sum, item) => sum + (item.overlap_decisions?.length || 0), 0),
    '의미중복 판정 요약은 현재 대기열에서 다시 계산되어야 합니다.',
  );
});

test('한 콘텐츠 생산자가 둘 이상의 항목을 동시에 진행하면 실패한다', () => {
  const value = clone(queue);
  value.items.find(item => item.pr_number === 103).status = 'in_progress';
  value.items.find(item => item.pr_number === 105).status = 'in_progress';
  const errors = validateProductionQueue(value);
  assert.ok(errors.some(error => error.includes('동시 진행 항목 2개')));
});

test('대기열에 없는 PR 의존성과 역순 통합을 거부한다', () => {
  const missing = clone(queue);
  missing.items.find(item => item.pr_number === 105).depends_on_prs.push(999);
  assert.ok(validateProductionQueue(missing).some(error => error.includes('의존 PR #999')));

  const reversed = clone(queue);
  reversed.items.find(item => item.pr_number === 105).depends_on_prs.push(103);
  reversed.items.find(item => item.pr_number === 103).integration_order = 120;
  assert.ok(validateProductionQueue(reversed).some(error => error.includes('선행 PR #103')));
});

test('기존 주제 개정은 topic-only 직접 통합 상태가 될 수 없다', () => {
  const value = clone(queue);
  const revision = value.items.find(item => item.pr_number === 85);
  revision.status = 'ready_for_integration';
  revision.integration_order = 1;
  assert.ok(validateProductionQueue(value).some(error => error.includes('기존 주제 개정은 topic-only 직접 통합 상태가 될 수 없습니다')));
});

test('중복 PR은 명시적인 분리·병합 판정과 한글 근거를 가져야 한다', () => {
  const value = clone(queue);
  value.items.find(item => item.pr_number === 88).overlap_decisions[0].rationale_ko = '';
  assert.ok(validateProductionQueue(value).some(error => error.includes('overlap 근거가 필요합니다')));
});

test('재작업 대체 PR은 이전 PR을 활성 대기열에서 제거하고 대체 관계를 기록한다', () => {
  const replacements = new Map([
    [139, {head: '04a49462d8577c880b5788b298fa4c15dd5ca63d', supersedes: [113]}],
    [141, {head: '7c6f7139bf31c8de36e3c807db0a2b0e74ba4849', supersedes: [107]}],
    [143, {head: '5b85f91e2d18c0a904a9b1cea3ecbdb50cd6bdde', supersedes: [104]}],
    [142, {head: '9d50227816a590d576205b361e74057ec24fceb3', supersedes: [95]}],
    [131, {head: 'ffe8386933b5f3b058e2a13355baa1a774d82c4e', supersedes: [111]}],
    [147, {head: '83cca31e3e2b05001140683eadc67d0f01aa4a19', supersedes: [97]}],
    [144, {head: 'e7cbb16050d099c5c121cf9a56653d11cc1c94d8', supersedes: [98, 127, 140]}],
    [148, {head: '247431a867ed79a284b4feb6a31b31903886dfd8', supersedes: [100]}],
    [152, {head: 'd7fda7a18da2b7058d95d4dacfa126dc5ccf05fd', supersedes: [101]}],
  ]);
  for (const [pr, expected] of replacements) {
    const item = queue.items.find(value => value.pr_number === pr);
    assert.ok(item, `대체 PR #${pr}이 대기열에 없습니다.`);
    assert.equal(item.status, 'integrated', `대체 PR #${pr}은 main 병합 상태여야 합니다.`);
    assert.equal(item.head_sha, expected.head, `대체 PR #${pr} head가 다릅니다.`);
    assert.deepEqual(item.supersedes_prs, expected.supersedes, `대체 PR #${pr}의 구본 기록이 다릅니다.`);
  }
  for (const oldPr of [95, 97, 98, 100, 101, 104, 107, 111, 113, 127, 140]) {
    assert.equal(queue.items.some(value => value.pr_number === oldPr), false, `구본 #${oldPr}이 활성 대기열에 남았습니다.`);
  }
  assert.match(queue.items.find(value => value.pr_number === 142).integration_checks.join(' '), /#145/);
  assert.deepEqual(queue.items.find(value => value.pr_number === 131).depends_on_prs, [141, 143]);
  assert.deepEqual(queue.items.find(value => value.pr_number === 109).depends_on_prs, [89, 147]);
  assert.deepEqual(queue.items.find(value => value.pr_number === 152).depends_on_prs, [148]);
  assert.deepEqual(
    queue.items
      .filter(value => value.status === 'ready_for_integration')
      .sort((a, b) => a.integration_order - b.integration_order)
      .map(value => value.pr_number),
    [103, 105],
  );
  assert.deepEqual(validateProductionQueue(queue), []);

  const duplicate = clone(queue);
  const item = queue.items.find(value => value.pr_number === 144);
  duplicate.items.push({...clone(item), queue_id: 'publication-pr-98', pr_number: 98, supersedes_prs: []});
  duplicate.audit_summary.open_content_prs += 1;
  duplicate.audit_summary.integrated += 1;
  assert.ok(validateProductionQueue(duplicate).some(error => error.includes('활성 대기열에 함께 남을 수 없습니다')));
});

test('상태별 감사 요약이 실제 대기열 수량과 다르면 실패한다', () => {
  const value = clone(queue);
  value.audit_summary.ready_for_integration += 1;
  assert.ok(validateProductionQueue(value).some(error => error.includes('audit_summary.ready_for_integration')));

  const staleIntegrated = clone(queue);
  staleIntegrated.audit_summary.integrated -= 1;
  assert.ok(
    validateProductionQueue(staleIntegrated).some(error => error.includes('audit_summary.integrated')),
    '운영 검증기는 오래된 integrated 요약을 차단해야 합니다.',
  );
});
