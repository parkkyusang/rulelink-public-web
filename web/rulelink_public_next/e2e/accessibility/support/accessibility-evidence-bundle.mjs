import {mkdir, readFile, readdir, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';

export function evidenceCaseKey(item) {
  return [
    item.mode,
    item.id,
    item.state,
    item.width,
    item.route,
  ].join('|');
}

export function validateEvidenceCases({
  cases,
  expectedCases,
  runId,
  runStartedAt,
}) {
  const expectedKeys = new Set(expectedCases.map(evidenceCaseKey));
  const actualKeys = new Set();
  const earliestAllowed = Date.parse(runStartedAt);

  for (const item of cases) {
    if (item.runId !== runId) {
      throw new Error(
        `다른 실행의 접근성 증거가 섞였습니다: ${item.runId ?? 'runId 없음'}`,
      );
    }
    const generatedAt = Date.parse(item.generatedAt);
    if (!Number.isFinite(generatedAt) || generatedAt < earliestAllowed) {
      throw new Error(
        `현재 실행보다 오래된 접근성 증거입니다: ${item.generatedAt ?? '시각 없음'}`,
      );
    }
    const key = evidenceCaseKey(item);
    if (actualKeys.has(key)) {
      throw new Error(`중복 접근성 증거입니다: ${key}`);
    }
    actualKeys.add(key);
  }

  const missing = [...expectedKeys].filter(key => !actualKeys.has(key));
  const extra = [...actualKeys].filter(key => !expectedKeys.has(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error([
      '현재 실행의 접근성 증거 집합이 기대 목록과 다릅니다.',
      `누락: ${missing.join(', ') || '없음'}`,
      `잔류·초과: ${extra.join(', ') || '없음'}`,
    ].join('\n'));
  }
  return [...cases].sort(
    (left, right) => evidenceCaseKey(left).localeCompare(evidenceCaseKey(right)),
  );
}

export async function aggregateEvidence({
  evidenceRoot,
  expectedCases,
  modes,
  runId,
  runStartedAt,
}) {
  const runRoot = path.join(evidenceRoot, 'runs', runId);
  const cases = [];
  for (const mode of modes) {
    const modeRoot = path.join(runRoot, mode);
    const filenames = (await readdir(modeRoot))
      .filter(filename => filename.endsWith('.json'))
      .sort();
    for (const filename of filenames) {
      cases.push(JSON.parse(await readFile(
        path.join(modeRoot, filename),
        'utf8',
      )));
    }
  }
  const validatedCases = validateEvidenceCases({
    cases,
    expectedCases,
    runId,
    runStartedAt,
  });
  const output = {
    schema: 'rulelink_wcag_browser_evidence_bundle_v1',
    generatedAt: new Date().toISOString(),
    runId,
    runStartedAt,
    caseCount: validatedCases.length,
    expectedCaseCount: expectedCases.length,
    failurePolicy: {
      failingImpacts: ['moderate', 'serious', 'critical'],
      preservedNonFailingImpacts: ['minor'],
    },
    violationCounts: {
      minor: countImpact(validatedCases, 'minor'),
      moderate: countImpact(validatedCases, 'moderate'),
      serious: countImpact(validatedCases, 'serious'),
      critical: countImpact(validatedCases, 'critical'),
    },
    cases: validatedCases,
  };
  await mkdir(evidenceRoot, {recursive: true});
  const finalPath = path.join(evidenceRoot, 'rulelink-wcag-evidence.json');
  const temporaryPath = `${finalPath}.${runId}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, finalPath);
  return output;
}

function countImpact(cases, impact) {
  return cases.reduce(
    (total, item) => total + item.violations
      .filter(violation => violation.impact === impact)
      .length,
    0,
  );
}
