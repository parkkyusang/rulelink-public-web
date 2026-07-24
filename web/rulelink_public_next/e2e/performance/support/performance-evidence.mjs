import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {brotliCompressSync, gzipSync} from 'node:zlib';

import {
  expectedPerformanceCases,
  performanceCaseKey,
  resolvePerformanceCases,
} from './performance-cases.mjs';

export const performanceBudgets = {
  cls: 0.05,
  cssTransferredBytes: 20_000,
  initialHtmlBytes: 145_000,
  jsTransferredBytes: 220_000,
  lcpApproxMs: 1_200,
  longTaskDurationMs: 300,
  requestCount: 20,
  searchIndexBytes: 390_000,
  searchQueryReadyMs: 1_500,
  totalTransferredBytes: 650_000,
};

export async function aggregatePerformanceEvidence({
  appRoot,
  baseline,
  bundle,
  evidenceRoot,
  label,
  lighthouse,
  provenance,
  runId,
  runStartedAt,
}) {
  const runRoot = path.join(evidenceRoot, 'runs', runId);
  const files = (await readdir(runRoot))
    .filter(filename => filename.endsWith('.json'))
    .sort();
  const cases = await Promise.all(files.map(async filename => (
    JSON.parse(await readFile(path.join(runRoot, filename), 'utf8'))
  )));
  const expected = expectedPerformanceCases(bundle);
  const validated = validatePerformanceCases({
    cases,
    expected,
    runId,
    runStartedAt,
  });
  const workload = resolvePerformanceWorkload(bundle);
  validateCaseWorkload(validated, workload);
  const browserVersions = [
    ...new Set(validated.map(item => item.browserVersion)),
  ];
  if (browserVersions.length !== 1 || !browserVersions[0]) {
    throw new Error(`브라우저 버전이 단일값이 아닙니다: ${browserVersions}`);
  }
  const validatedLighthouse = validateLighthouseSummaries(lighthouse);
  const buildAssets = await readBuildAssets(appRoot, validated);
  const completeProvenance = {
    ...provenance,
    browserVersion: browserVersions[0],
    buildAssetHash: buildAssets.hash,
  };
  validateProvenance(completeProvenance);
  const output = {
    schema: 'rulelink_public_performance_evidence_v1',
    generatedAt: new Date().toISOString(),
    runId,
    runStartedAt,
    label,
    caseCount: validated.length,
    expectedCaseCount: expected.length,
    budgets: performanceBudgets,
    comparisonPolicy: {
      requiresEqual: [
        'publicationSnapshotId',
        'publicationBundleSha256',
        'nextVersion',
        'nodeVersion',
        'browserVersion',
        'producerHash',
        'workload',
        'budgets',
      ],
      permitsDifference: ['commitSha', 'buildId', 'buildAssetHash'],
    },
    workload,
    provenance: completeProvenance,
    buildAssets,
    lighthouse: validatedLighthouse,
    cases: validated,
  };
  output.comparisonToBefore = baseline
    ? compareEvidence(baseline, output, expected)
    : null;
  await mkdir(evidenceRoot, {recursive: true});
  const finalPath = path.join(evidenceRoot, `performance-${label}.json`);
  const temporaryPath = `${finalPath}.${runId}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, finalPath);
  return output;
}

export function compareEvidence(before, after, expected) {
  validateComparableBaseline(before, after, expected);
  const beforeByKey = new Map(
    before.cases.map(item => [performanceCaseKey(item), item]),
  );
  const metrics = [
    'initialHtmlBytes',
    'jsTransferredBytes',
    'cssTransferredBytes',
    'totalTransferredBytes',
    'requestCount',
    'searchQueryReadyMs',
    'longTaskDurationMs',
    'cls',
    'lcpApproxMs',
  ];
  return {
    baselineRunId: before.runId,
    cases: after.cases.map(item => {
      const previous = beforeByKey.get(performanceCaseKey(item));
      if (!previous) {
        throw new Error(
          `before 증거에 비교 사례가 없습니다: ${performanceCaseKey(item)}`,
        );
      }
      return {
        key: performanceCaseKey(item),
        deltas: {
          ...Object.fromEntries(metrics.map(metric => [
            metric,
            item[metric] - previous[metric],
          ])),
          searchIndexBytes: (
            (item.searchIndex?.bytes ?? 0)
            - (previous.searchIndex?.bytes ?? 0)
          ),
          searchIndexRequests: (
            (item.searchIndex?.requests ?? 0)
            - (previous.searchIndex?.requests ?? 0)
          ),
        },
      };
    }),
  };
}

export function extractBuildAssetPaths(html) {
  const assets = new Set();
  const pattern = /(?:src|href)=["']([^"']+)["']/giu;
  for (const match of html.matchAll(pattern)) {
    const value = match[1].replaceAll('&amp;', '&');
    let pathname;
    try {
      pathname = new URL(value, 'https://performance.invalid').pathname;
    } catch {
      continue;
    }
    if (
      pathname.startsWith('/_next/')
      && /\.(?:css|js)$/u.test(pathname)
    ) assets.add(pathname);
  }
  return [...assets].sort();
}

export function validatePerformanceCases({
  cases,
  expected,
  runId,
  runStartedAt,
}) {
  const expectedKeys = new Set(expected.map(performanceCaseKey));
  const actualKeys = new Set();
  const startedAt = Date.parse(runStartedAt);
  for (const item of cases) {
    if (item.runId !== runId) {
      throw new Error(`다른 실행의 성능 증거입니다: ${item.runId}`);
    }
    if (Date.parse(item.generatedAt) < startedAt) {
      throw new Error(`실행 시작 전 성능 증거입니다: ${item.generatedAt}`);
    }
    validateCaseMetrics(item);
    const key = performanceCaseKey(item);
    if (actualKeys.has(key)) throw new Error(`중복 성능 증거입니다: ${key}`);
    actualKeys.add(key);
  }
  const missing = [...expectedKeys].filter(key => !actualKeys.has(key));
  const extra = [...actualKeys].filter(key => !expectedKeys.has(key));
  if (missing.length || extra.length) {
    throw new Error([
      '성능 증거 집합이 기대 사례와 다릅니다.',
      `누락: ${missing.join(', ') || '없음'}`,
      `초과: ${extra.join(', ') || '없음'}`,
    ].join('\n'));
  }
  return [...cases].sort(
    (left, right) => performanceCaseKey(left)
      .localeCompare(performanceCaseKey(right)),
  );
}

export function validateLighthouseSummaries(items) {
  const requiredAuditIds = [
    'cumulative-layout-shift',
    'first-contentful-paint',
    'largest-contentful-paint',
    'total-blocking-time',
    'total-byte-weight',
  ];
  const expected = new Set([
    'desktop|/',
    'desktop|/ko/search',
    'mobile|/',
    'mobile|/ko/search',
  ]);
  const actual = new Set();
  for (const item of items) {
    const key = `${item.formFactor}|${new URL(item.url).pathname}`;
    if (actual.has(key)) throw new Error(`중복 Lighthouse 증거입니다: ${key}`);
    actual.add(key);
    if (!Number.isFinite(item.performanceScore)) {
      throw new Error(`Lighthouse 점수가 유효하지 않습니다: ${key}`);
    }
    for (const auditId of requiredAuditIds) {
      const audit = item.audits?.[auditId];
      if (!Number.isFinite(audit?.numericValue)) {
        throw new Error(`Lighthouse audit 값이 없습니다: ${key}|${auditId}`);
      }
    }
  }
  const missing = [...expected].filter(key => !actual.has(key));
  const extra = [...actual].filter(key => !expected.has(key));
  if (missing.length || extra.length) {
    throw new Error(
      `Lighthouse 4건이 정확하지 않습니다. 누락=${missing} 초과=${extra}`,
    );
  }
  return [...items].sort((left, right) => (
    `${left.formFactor}|${left.url}`.localeCompare(
      `${right.formFactor}|${right.url}`,
    )
  ));
}

async function readBuildAssets(appRoot, cases) {
  const buildRoot = path.join(appRoot, '.next');
  const caseAssets = [];
  const inventory = new Map();
  for (const item of cases) {
    const assets = [];
    for (const publicPath of item.documentAssets) {
      const relativePath = publicPath.replace(/^\/_next\//u, '');
      const assetPath = path.join(buildRoot, relativePath);
      const bytes = await readFile(assetPath);
      const fileStat = await stat(assetPath);
      const asset = {
        path: publicPath,
        rawBytes: fileStat.size,
        gzipBytes: gzipSync(bytes).byteLength,
        brotliBytes: brotliCompressSync(bytes).byteLength,
        sha256: sha256(bytes),
      };
      assets.push(asset);
      const existing = inventory.get(publicPath);
      if (existing && existing.sha256 !== asset.sha256) {
        throw new Error(`동일 자산 경로의 해시가 다릅니다: ${publicPath}`);
      }
      inventory.set(publicPath, asset);
    }
    if (assets.length === 0) {
      throw new Error(`초기 HTML 참조 자산이 없습니다: ${performanceCaseKey(item)}`);
    }
    caseAssets.push({
      key: performanceCaseKey(item),
      assets,
    });
  }
  const assets = [...inventory.values()].sort(
    (left, right) => left.path.localeCompare(right.path),
  );
  const hash = sha256(JSON.stringify(assets));
  return {
    source: 'initial-html-script-and-stylesheet-references',
    hash,
    assetCount: assets.length,
    totalRawBytes: assets.reduce((sum, asset) => sum + asset.rawBytes, 0),
    totalGzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
    totalBrotliBytes: assets.reduce((sum, asset) => sum + asset.brotliBytes, 0),
    assets,
    cases: caseAssets,
  };
}

function validateComparableBaseline(before, after, expected) {
  if (before.schema !== 'rulelink_public_performance_evidence_v1') {
    throw new Error(`before 증거 스키마가 다릅니다: ${before.schema}`);
  }
  if (before.label !== 'before') {
    throw new Error(`before 증거 label이 아닙니다: ${before.label}`);
  }
  if (!before.runId || !Number.isFinite(Date.parse(before.runStartedAt))) {
    throw new Error('before 실행 식별자나 시각이 유효하지 않습니다.');
  }
  validatePerformanceCases({
    cases: before.cases,
    expected,
    runId: before.runId,
    runStartedAt: before.runStartedAt,
  });
  validateLighthouseSummaries(before.lighthouse);
  validateCaseWorkload(before.cases, before.workload);
  if (before.caseCount !== expected.length || before.expectedCaseCount !== expected.length) {
    throw new Error('before 사례 수가 기대값과 다릅니다.');
  }
  validateProvenance(before.provenance);
  const exactFields = [
    'publicationSnapshotId',
    'publicationBundleSha256',
    'nextVersion',
    'nodeVersion',
    'browserVersion',
    'producerHash',
  ];
  for (const field of exactFields) {
    if (before.provenance?.[field] !== after.provenance?.[field]) {
      throw new Error(`before/after provenance가 다릅니다: ${field}`);
    }
  }
  if (JSON.stringify(before.workload) !== JSON.stringify(after.workload)) {
    throw new Error('before/after workload가 다릅니다.');
  }
  if (JSON.stringify(before.budgets) !== JSON.stringify(after.budgets)) {
    throw new Error('before/after budget 계약이 다릅니다.');
  }
  if (
    JSON.stringify(before.comparisonPolicy)
    !== JSON.stringify(after.comparisonPolicy)
  ) {
    throw new Error('before/after 비교 정책이 다릅니다.');
  }
  if (
    !/^[0-9a-f]{64}$/u.test(before.buildAssets?.hash ?? '')
    || before.buildAssets?.cases?.length !== expected.length
    || !Array.isArray(before.buildAssets?.assets)
  ) {
    throw new Error('before build asset 증거가 불완전합니다.');
  }
}

function validateProvenance(provenance) {
  for (const field of [
    'publicationBundleSha256',
    'producerHash',
    'buildAssetHash',
  ]) {
    if (!/^[0-9a-f]{64}$/u.test(provenance?.[field] ?? '')) {
      throw new Error(`성능 provenance 해시가 유효하지 않습니다: ${field}`);
    }
  }
  if (!/^[0-9a-f]{40}$/u.test(provenance?.commitSha ?? '')) {
    throw new Error('성능 provenance commit SHA가 유효하지 않습니다.');
  }
  for (const field of [
    'publicationSnapshotId',
    'nextVersion',
    'nodeVersion',
    'browserVersion',
    'buildId',
  ]) {
    if (typeof provenance?.[field] !== 'string' || !provenance[field].trim()) {
      throw new Error(`성능 provenance 값이 없습니다: ${field}`);
    }
  }
}

function validateCaseMetrics(item) {
  const metrics = [
    'cls',
    'cssTransferredBytes',
    'firstContentfulPaintMs',
    'initialHtmlBytes',
    'jsTransferredBytes',
    'lcpApproxMs',
    'longTaskCount',
    'longTaskDurationMs',
    'navigationTransferredBytes',
    'requestCount',
    'searchQueryReadyMs',
    'totalTransferredBytes',
  ];
  for (const metric of metrics) {
    if (!Number.isFinite(item[metric]) || item[metric] < 0) {
      throw new Error(`유효하지 않은 성능 지표입니다: ${metric}`);
    }
  }
  if (!Array.isArray(item.documentAssets) || item.documentAssets.length === 0) {
    throw new Error('초기 HTML 자산 목록이 없습니다.');
  }
}

function resolvePerformanceWorkload(bundle) {
  return resolvePerformanceCases(bundle).workload;
}

function validateCaseWorkload(cases, workload) {
  for (const item of cases) {
    const expectedQuery = item.id === 'search-query' ? workload.query : null;
    if (item.searchQuery !== expectedQuery) {
      throw new Error(
        `성능 사례의 검색 workload가 다릅니다: ${performanceCaseKey(item)}`,
      );
    }
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
