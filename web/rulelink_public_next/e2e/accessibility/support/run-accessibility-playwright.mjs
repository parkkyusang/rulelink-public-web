import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {aggregateEvidence} from './accessibility-evidence-bundle.mjs';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const playwrightCli = path.join(
  appRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
);
const modes = [
  {grep: 'default public build', mode: 'default', port: '8894'},
  {grep: 'trust on', mode: 'trust', port: '8895'},
  {grep: 'native authority details', mode: 'authority', port: '8896'},
];
const widths = [320, 390, 768, 1440];
const runStartedAt = new Date().toISOString();
const runId = `wcag-${runStartedAt.replace(/[^0-9]/gu, '')}-${randomUUID()}`;
const evidenceRoot = path.join(
  appRoot,
  'test-results',
  'accessibility',
  'evidence',
);
await mkdir(path.join(evidenceRoot, 'runs', runId), {recursive: true});

for (const item of modes) {
  await run(process.execPath, [
    playwrightCli,
    'test',
    '--config',
    'playwright.accessibility.config.ts',
    '--grep',
    item.grep,
  ], {
    ...process.env,
    RULELINK_ACCESSIBILITY_EVIDENCE_ROOT: evidenceRoot,
    RULELINK_ACCESSIBILITY_MODE: item.mode,
    RULELINK_ACCESSIBILITY_PORT: item.port,
    RULELINK_ACCESSIBILITY_RUN_ID: runId,
  });
}
const output = await aggregateEvidence({
  evidenceRoot,
  expectedCases: expectedEvidenceCases(),
  modes: modes.map(item => item.mode),
  runId,
  runStartedAt,
});
console.log(
  `WCAG 자동 회귀 증거 ${output.caseCount}건 집계 완료 `
  + `(minor ${output.violationCounts.minor}, `
  + `moderate ${output.violationCounts.moderate}, `
  + `serious ${output.violationCounts.serious}, `
  + `critical ${output.violationCounts.critical})`,
);

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(
        `접근성 브라우저 시험 실패: ${env.RULELINK_ACCESSIBILITY_MODE} (${code})`,
      ));
    });
  });
}

function expectedEvidenceCases() {
  const defaultReadyRoutes = [
    ['home', '/'],
    ['search-empty-query', '/ko/search'],
    ['hub', '/ko/hubs/debt-enforcement'],
    ['knowledge-typed', '/ko/knowledge/legal-heir-order-and-spouse'],
    [
      'knowledge-fallback',
      '/ko/knowledge/administrative-appeal-appointed-representative-documents-change',
    ],
    [
      'change-detail',
      '/ko/changes/administrative-appeals-state-representative-documents',
    ],
  ];
  const expected = defaultReadyRoutes.flatMap(([id, route]) => widths.map(
    width => ({id, mode: 'default', route, state: 'ready', width}),
  ));
  for (const width of widths) {
    expected.push(
      {
        id: 'search-loading',
        mode: 'default',
        route: '/ko/search',
        state: 'loading',
        width,
      },
      {
        id: 'search-query',
        mode: 'default',
        route: '/ko/search?q=집주인이%20보증금을%20안%20줘요',
        state: 'query',
        width,
      },
      {
        id: 'search-zero',
        mode: 'default',
        route: '/ko/search?q=존재하지않는법률정보검색어',
        state: 'zero',
        width,
      },
      {
        id: 'trust-off-404',
        mode: 'default',
        route: '/ko/trust',
        state: 'disabled',
        width,
      },
      {
        id: 'authority-zero-state',
        mode: 'default',
        route: '/ko/knowledge/legal-heir-order-and-spouse',
        state: 'zero',
        width,
      },
      {
        id: 'trust-on',
        mode: 'trust',
        route: '/ko/trust',
        state: 'ready',
        width,
      },
      {
        id: 'trust-editorial-knowledge',
        mode: 'trust',
        route: '/ko/knowledge/legal-heir-order-and-spouse',
        state: 'ready',
        width,
      },
      {
        id: 'authority-native-details',
        mode: 'authority',
        route: '/ko/authorities/test-law/0025',
        state: 'closed',
        width,
      },
    );
  }
  return expected;
}
