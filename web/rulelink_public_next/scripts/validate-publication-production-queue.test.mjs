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
  assert.equal(queue.items.filter(item => item.status === 'ready_for_integration').length, 11);
  assert.equal(queue.items.filter(item => item.status === 'needs_rework').length, 6);
  assert.equal(queue.items.filter(item => item.status === 'migration_required').length, 2);
  assert.equal(queue.items.filter(item => item.status === 'blocked').length, 1);
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
  reversed.items.find(item => item.pr_number === 104).integration_order = 120;
  assert.ok(validateProductionQueue(reversed).some(error => error.includes('선행 PR #104')));
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
