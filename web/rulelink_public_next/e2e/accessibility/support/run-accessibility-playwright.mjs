import {spawn} from 'node:child_process';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

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
    RULELINK_ACCESSIBILITY_MODE: item.mode,
    RULELINK_ACCESSIBILITY_PORT: item.port,
  });
}
await aggregateEvidence();

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

async function aggregateEvidence() {
  const evidenceRoot = path.join(
    appRoot,
    'test-results',
    'accessibility',
    'evidence',
  );
  const cases = [];
  for (const item of modes) {
    const modeRoot = path.join(evidenceRoot, item.mode);
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
  const output = {
    schema: 'rulelink_wcag_browser_evidence_bundle_v1',
    generatedAt: new Date().toISOString(),
    caseCount: cases.length,
    violationCounts: {
      moderate: countImpact(cases, 'moderate'),
      serious: countImpact(cases, 'serious'),
      critical: countImpact(cases, 'critical'),
    },
    cases,
  };
  await mkdir(evidenceRoot, {recursive: true});
  await writeFile(
    path.join(evidenceRoot, 'rulelink-wcag-evidence.json'),
    `${JSON.stringify(output, null, 2)}\n`,
    'utf8',
  );
}

function countImpact(cases, impact) {
  return cases.reduce(
    (total, item) => total + item.violations
      .filter(violation => violation.impact === impact)
      .length,
    0,
  );
}
