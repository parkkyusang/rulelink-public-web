import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir, readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {aggregatePerformanceEvidence} from './performance-evidence.mjs';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const label = readArgument('--label') ?? 'current';
if (!/^[a-z0-9-]+$/u.test(label)) throw new Error(`잘못된 label: ${label}`);
const port = Number(readArgument('--port') ?? '8897');
const runStartedAt = new Date().toISOString();
const runId = `performance-${
  runStartedAt.replace(/[^0-9]/gu, '')
}-${randomUUID()}`;
const evidenceRoot = path.join(
  appRoot,
  'test-results',
  'performance',
  'evidence',
);
const lighthouseRoot = path.join(
  appRoot,
  'test-results',
  'performance',
  'lighthouse',
  runId,
);
await mkdir(path.join(evidenceRoot, 'runs', runId), {recursive: true});
await mkdir(lighthouseRoot, {recursive: true});

const nextCli = path.join(appRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const playwrightCli = path.join(
  appRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
);
const lhciCli = path.join(
  appRoot,
  'node_modules',
  '@lhci',
  'cli',
  'src',
  'cli.js',
);

if (process.env.RULELINK_PERFORMANCE_SKIP_BUILD !== '1') {
  await run(process.execPath, [nextCli, 'build'], process.env);
}
const server = spawn(
  process.execPath,
  [nextCli, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {cwd: appRoot, env: process.env, stdio: 'inherit'},
);
try {
  await waitForServer(`http://127.0.0.1:${port}/publication.json`);
  const sharedEnvironment = {
    ...process.env,
    RULELINK_PERFORMANCE_BASE_URL: `http://127.0.0.1:${port}`,
    RULELINK_PERFORMANCE_EVIDENCE_ROOT: evidenceRoot,
    RULELINK_PERFORMANCE_RUN_ID: runId,
  };
  await run(process.execPath, [
    playwrightCli,
    'test',
    '--config',
    'playwright.performance.config.ts',
  ], sharedEnvironment);
  for (const formFactor of ['mobile', 'desktop']) {
    await run(process.execPath, [
      lhciCli,
      'autorun',
      '--config',
      'lighthouserc.performance.cjs',
    ], {
      ...sharedEnvironment,
      RULELINK_LHCI_FORM_FACTOR: formFactor,
      RULELINK_LHCI_OUTPUT_DIR: path.join(lighthouseRoot, formFactor),
    });
  }
  const bundle = JSON.parse(await readFile(
    path.join(appRoot, 'content', 'bundle.json'),
    'utf8',
  ));
  const lighthouse = await readLighthouseSummaries(lighthouseRoot);
  const baseline = label === 'before'
    ? null
    : await readOptionalJson(
        path.join(evidenceRoot, 'performance-before.json'),
      );
  const output = await aggregatePerformanceEvidence({
    appRoot,
    baseline,
    bundle,
    evidenceRoot,
    label,
    lighthouse,
    runId,
    runStartedAt,
  });
  console.log(
    `성능·검색 렌더링 증거 ${output.caseCount}건 집계 완료: ${label}`,
  );
} finally {
  if (!server.killed) server.kill('SIGTERM');
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

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
      else reject(new Error(`명령 실패(${code}): ${args.join(' ')}`));
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`성능 시험 서버 준비 실패: ${url}`);
}

async function readLighthouseSummaries(root) {
  const summaries = [];
  for (const formFactor of ['mobile', 'desktop']) {
    const directory = path.join(root, formFactor);
    const files = await recursiveFiles(directory);
    for (const file of files.filter(item => item.endsWith('.report.json'))) {
      const report = JSON.parse(await readFile(file, 'utf8'));
      summaries.push({
        formFactor,
        url: report.finalUrl,
        performanceScore: report.categories.performance.score,
        audits: Object.fromEntries([
          'cumulative-layout-shift',
          'first-contentful-paint',
          'largest-contentful-paint',
          'total-blocking-time',
          'total-byte-weight',
        ].map(id => [id, {
          numericValue: report.audits[id]?.numericValue ?? null,
          score: report.audits[id]?.score ?? null,
        }])),
      });
    }
  }
  return summaries.sort((left, right) => (
    `${left.formFactor}|${left.url}`.localeCompare(
      `${right.formFactor}|${right.url}`,
    )
  ));
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

async function readOptionalJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
