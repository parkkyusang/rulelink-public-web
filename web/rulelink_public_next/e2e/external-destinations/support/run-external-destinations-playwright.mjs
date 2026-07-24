import {spawn} from 'node:child_process';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const temporaryRoot = path.join(
  os.tmpdir(),
  `rulelink-external-destinations-${process.pid}`,
);
const temporaryAppRoot = path.join(temporaryRoot, 'app');
const port = 8899;
const nextCli = path.join(
  temporaryAppRoot,
  'node_modules',
  'next',
  'dist',
  'bin',
  'next',
);
const playwrightCli = path.join(
  appRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
);

try {
  await cp(appRoot, temporaryAppRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(appRoot, source);
      if (!relative) return true;
      return !new Set([
        '.next',
        'content',
        'node_modules',
        'playwright-report',
        'test-results',
      ]).has(relative.split(path.sep)[0]);
    },
  });
  await cp(
    path.join(appRoot, 'node_modules'),
    path.join(temporaryAppRoot, 'node_modules'),
    {dereference: true, recursive: true},
  );
  const bundle = JSON.parse(await readFile(path.join(
    repoRoot,
    'artifacts',
    'publication',
    'current',
    'bundle.json',
  ), 'utf8'));
  await mkdir(path.join(temporaryAppRoot, 'content'), {recursive: true});
  await writeFile(
    path.join(temporaryAppRoot, 'content', 'bundle.json'),
    `${JSON.stringify(withEditorialFixture(bundle), null, 2)}\n`,
    'utf8',
  );

  await executeMode('default', defaultEnvironment());
  await rm(path.join(temporaryAppRoot, '.next'), {
    force: true,
    recursive: true,
  });
  await executeMode('configured', configuredEnvironment());
} finally {
  await rm(temporaryRoot, {force: true, recursive: true});
}

async function executeMode(mode, modeEnvironment) {
  const environment = {
    ...process.env,
    ...modeEnvironment,
    NEXT_TELEMETRY_DISABLED: '1',
    RULELINK_EXTERNAL_DESTINATIONS_MODE: mode,
    RULELINK_EXTERNAL_DESTINATIONS_PORT: String(port),
  };
  await run(process.execPath, [nextCli, 'build'], temporaryAppRoot, environment);
  const server = spawn(
    process.execPath,
    [nextCli, 'start', '-H', '127.0.0.1', '-p', String(port)],
    {cwd: temporaryAppRoot, env: environment, stdio: 'inherit'},
  );
  try {
    await waitForServer(server, `http://127.0.0.1:${port}/publication.json`);
    await run(process.execPath, [
      playwrightCli,
      'test',
      '--config',
      'playwright.external-destinations.config.ts',
    ], appRoot, environment);
  } finally {
    if (server.exitCode === null) server.kill('SIGTERM');
    await new Promise(resolve => {
      if (server.exitCode !== null) resolve();
      else server.once('exit', resolve);
      setTimeout(resolve, 5_000);
    });
    if (server.exitCode === null) server.kill('SIGKILL');
  }
}

function defaultEnvironment() {
  return {
    RULELINK_PUBLIC_LAWYER_WORKSPACE_LABEL: '',
    RULELINK_PUBLIC_LAWYER_WORKSPACE_URL: '',
    RULELINK_PUBLIC_TRUST_ENABLED: 'false',
  };
}

function configuredEnvironment() {
  return {
    RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON: JSON.stringify([{
      evidence_url: 'https://reviewer-registry.rulelink.kr/reviewers/bar-001',
      name_ko: '김법률',
      qualification_ko: '대한민국 변호사',
      reviewer_registry_id: 'reviewer.bar-001',
    }]),
    RULELINK_PUBLIC_CONTACT_LABEL: '콘텐츠 오류 제보',
    RULELINK_PUBLIC_CONTACT_URL:
      'mailto:corrections@rulelink.kr?subject=content-correction',
    RULELINK_PUBLIC_LAWYER_WORKSPACE_LABEL:
      '승인된 계정으로 작업공간 열기',
    RULELINK_PUBLIC_LAWYER_WORKSPACE_URL:
      'https://workspace.rulelink.kr/verified',
    RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: '룰링크 정보서비스 운영 주체',
    RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE:
      '검토 자격과 승인 근거를 콘텐츠별로 공개합니다.',
    RULELINK_PUBLIC_TRUST_ENABLED: 'true',
  };
}

function withEditorialFixture(bundle) {
  const next = structuredClone(bundle);
  const entry = next.knowledge?.content_entries?.find(
    item => item.content_id === 'content.legal-heir-order-and-spouse',
  );
  if (!entry) throw new Error('외부 목적지 fixture 대상 콘텐츠가 없습니다.');
  entry.editorial_attribution = {
    author: {
      kind: 'organization',
      name_ko: '룰링크 콘텐츠 운영팀',
      role_ko: '법률정보 작성·편집',
      url: 'https://author-profile.rulelink.kr/team',
    },
    legal_reviewer: {
      reviewed_at: entry.reviewed_at,
      reviewer_registry_id: 'reviewer.bar-001',
      review_areas_ko: ['상속', '가족법'],
    },
  };
  return next;
}

function run(command, args, cwd, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`명령 실패(${code}): ${args.join(' ')}`));
    });
  });
}

async function waitForServer(server, url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next 서버가 일찍 종료됐습니다: ${server.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Next 서버 준비 실패: ${url}`);
}
