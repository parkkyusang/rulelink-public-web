export const DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE = 24;

export function initialProgressiveResultLimit(
  total: number,
  batchSize = DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE,
): number {
  return Math.min(normalizeCount(total), normalizeBatchSize(batchSize));
}

export function nextProgressiveResultLimit(
  total: number,
  current: number,
  batchSize = DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE,
): number {
  const normalizedTotal = normalizeCount(total);
  const normalizedBatchSize = normalizeBatchSize(batchSize);
  const normalizedCurrent = normalizeCount(current);
  return Math.min(normalizedTotal, normalizedCurrent + normalizedBatchSize);
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeBatchSize(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : DEFAULT_PROGRESSIVE_RESULT_BATCH_SIZE;
}
