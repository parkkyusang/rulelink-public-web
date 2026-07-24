import {mkdir, readFile, readdir, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  expectedPerformanceCases,
  performanceCaseKey,
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
  totalTransferredBytes: 650_000,
};

export async function aggregatePerformanceEvidence({
  appRoot,
  baseline,
  bundle,
  evidenceRoot,
  label,
  lighthouse,
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
  const output = {
    schema: 'rulelink_public_performance_evidence_v1',
    generatedAt: new Date().toISOString(),
    runId,
    runStartedAt,
    label,
    caseCount: validated.length,
    expectedCaseCount: expected.length,
    budgets: performanceBudgets,
    buildAssets: await readBuildAssets(appRoot),
    lighthouse,
    cases: validated,
  };
  output.comparisonToBefore = baseline
    ? compareEvidence(baseline, output)
    : null;
  await mkdir(evidenceRoot, {recursive: true});
  const finalPath = path.join(evidenceRoot, `performance-${label}.json`);
  const temporaryPath = `${finalPath}.${runId}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, finalPath);
  return output;
}

export function compareEvidence(before, after) {
  const beforeByKey = new Map(
    before.cases.map(item => [performanceCaseKey(item), item]),
  );
  const metrics = [
    'initialHtmlBytes',
    'jsTransferredBytes',
    'cssTransferredBytes',
    'totalTransferredBytes',
    'requestCount',
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

async function readBuildAssets(appRoot) {
  const buildRoot = path.join(appRoot, '.next');
  const allFiles = await recursiveFiles(buildRoot);
  const manifestPaths = allFiles.filter(file => (
    file.endsWith('build-manifest.json')
  ));
  const referencedFiles = [];
  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    referencedFiles.push(
      ...Object.values(manifest.pages ?? {}).flat(),
      ...(manifest.polyfillFiles ?? []),
      ...(manifest.rootMainFiles ?? []),
    );
  }
  const files = [...new Set(referencedFiles)]
    .filter(file => /\.(?:css|js)$/u.test(file))
    .sort();
  const assets = [];
  for (const file of files) {
    const assetPath = path.join(buildRoot, file);
    const fileStat = await stat(assetPath);
    assets.push({file, bytes: fileStat.size});
  }
  return {
    manifests: manifestPaths.map(file => path.relative(buildRoot, file)),
    assetCount: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    assets,
  };
}

async function recursiveFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await recursiveFiles(target));
    else files.push(target);
  }
  return files;
}
