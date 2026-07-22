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
  for (const status of ['ready_for_integration', 'needs_rework', 'migration_required', 'blocked']) {
    assert.equal(
      queue.audit_summary[status],
      queue.items.filter(item => item.status === status).length,
      `${status} 요약 수량은 대기열에서 계산한 값과 같아야 합니다.`,
    );
  }
});

test('한 콘텐츠 생산자가 둘 이상의 항목을 동시에 진행하면 실패한다', () => {
  const value = clone(queue);
  value.items.find(item => item.pr_number === 95).status = 'in_progress';
  value.items.find(item => item.pr_number === 97).status = 'in_progress';
  const errors = validateProductionQueue(value);
  assert.ok(errors.some(error => error.includes('동시 진행 항목 2개')));
});

test('대기열에 없는 PR 의존성과 역순 통합을 거부한다', () => {
  const missing = clone(queue);
  missing.items.find(item => item.pr_number === 111).depends_on_prs.push(999);
  assert.ok(validateProductionQueue(missing).some(error => error.includes('의존 PR #999')));

  const reversed = clone(queue);
  reversed.items.find(item => item.pr_number === 100).integration_order = 120;
  assert.ok(validateProductionQueue(reversed).some(error => error.includes('선행 PR #100')));
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
  const item = queue.items.find(value => value.pr_number === 127);
  assert.deepEqual(item.supersedes_prs, [98]);
  assert.equal(item.status, 'ready_for_integration');
  assert.equal(queue.items.some(value => value.pr_number === 98), false);
  assert.deepEqual(validateProductionQueue(queue), []);

  const duplicate = clone(queue);
  duplicate.items.push({...clone(item), queue_id: 'publication-pr-98', pr_number: 98, supersedes_prs: []});
  duplicate.audit_summary.open_content_prs += 1;
  duplicate.audit_summary.ready_for_integration += 1;
  assert.ok(validateProductionQueue(duplicate).some(error => error.includes('활성 대기열에 함께 남을 수 없습니다')));
});

test('상태별 감사 요약이 실제 대기열 수량과 다르면 실패한다', () => {
  const value = clone(queue);
  value.audit_summary.ready_for_integration += 1;
  assert.ok(validateProductionQueue(value).some(error => error.includes('audit_summary.ready_for_integration')));
});
