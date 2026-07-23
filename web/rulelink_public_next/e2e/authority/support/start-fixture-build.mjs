import {spawn} from 'node:child_process';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const fixturePath = path.resolve(
  supportRoot,
  '..',
  'fixtures',
  'authority-multiversion-bundle.json',
);
const port = argument('--port') ?? '8891';
const temporaryRoot = path.join(
  os.tmpdir(),
  `rulelink-authority-browser-${process.pid}`,
);
const temporaryAppRoot = path.join(temporaryRoot, 'app');
const childEnvironment = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  RULELINK_PUBLICATION_NOW: '2026-07-24T00:00:00+09:00',
};
let server = null;

try {
  const [baseBundle, fixture] = await Promise.all([
    readJson(path.join(
      repoRoot,
      'artifacts',
      'publication',
      'snapshots',
      'kr-knowledge-core-20260723-023',
      'bundle.json',
    )),
    readJson(fixturePath),
  ]);
  if (baseBundle.snapshot_id !== fixture.base_snapshot_id) {
    throw new Error(
      `authority fixture의 기준 snapshot이 다릅니다: `
      + `${baseBundle.snapshot_id} != ${fixture.base_snapshot_id}`,
    );
  }

  await cp(appRoot, temporaryAppRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(appRoot, source);
      if (!relative) return true;
      const first = relative.split(path.sep)[0];
      return !new Set([
        '.next',
        'content',
        'node_modules',
        'playwright-report',
        'test-results',
      ]).has(first);
    },
  });
  await cp(
    path.join(appRoot, 'node_modules'),
    path.join(temporaryAppRoot, 'node_modules'),
    {dereference: true, recursive: true},
  );
  await mkdir(path.join(temporaryAppRoot, 'content'), {recursive: true});
  await writeFile(
    path.join(temporaryAppRoot, 'content', 'bundle.json'),
    `${JSON.stringify(mergeFixture(baseBundle, fixture), null, 2)}\n`,
    'utf8',
  );

  const nextCli = path.join(
    temporaryAppRoot,
    'node_modules',
    'next',
    'dist',
    'bin',
    'next',
  );
  await run(process.execPath, [nextCli, 'build'], temporaryAppRoot);
  server = spawn(
    process.execPath,
    [nextCli, 'start', '-H', '127.0.0.1', '-p', port],
    {
      cwd: temporaryAppRoot,
      env: childEnvironment,
      stdio: 'inherit',
    },
  );
  installSignalForwarding(server);
  const exitCode = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', code => resolve(code ?? 0));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await rm(temporaryRoot, {recursive: true, force: true});
}

function mergeFixture(baseBundle, fixture) {
  const next = structuredClone(baseBundle);
  next.snapshot_id = fixture.fixture_snapshot_id;
  next.built_at = '2026-07-24T00:00:00+09:00';
  next.knowledge ??= {};
  for (const [collection, additions] of Object.entries(fixture.knowledge)) {
    const current = Array.isArray(next.knowledge[collection])
      ? next.knowledge[collection]
      : [];
    next.knowledge[collection] = [...current, ...additions];
  }
  return next;
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

async function run(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: childEnvironment,
    stdio: 'inherit',
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 0));
  });
  if (exitCode !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(' ')} 실패: ${exitCode}`);
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function installSignalForwarding(child) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
}
