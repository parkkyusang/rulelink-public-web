import {spawn} from 'node:child_process';
import {cp, mkdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const temporaryRoot = path.join(
  os.tmpdir(),
  `rulelink-privacy-browser-${process.pid}`,
);
const temporaryAppRoot = path.join(temporaryRoot, 'app');
const port = 8898;
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
  await mkdir(path.join(temporaryAppRoot, 'content'), {recursive: true});
  await cp(
    path.join(
      repoRoot,
      'artifacts',
      'publication',
      'current',
      'bundle.json',
    ),
    path.join(temporaryAppRoot, 'content', 'bundle.json'),
  );
  const evidenceRoot = path.join(
    appRoot,
    'test-results',
    'privacy',
    'evidence',
  );
  await rm(evidenceRoot, {recursive: true, force: true});
  await mkdir(evidenceRoot, {recursive: true});

  await executeMode('default', defaultEnvironment());
  await rm(path.join(temporaryAppRoot, '.next'), {
    recursive: true,
    force: true,
  });
  await executeMode('enabled', enabledEnvironment());
} finally {
  await rm(temporaryRoot, {recursive: true, force: true});
}

async function executeMode(mode, modeEnvironment) {
  const environment = {
    ...process.env,
    ...modeEnvironment,
    NEXT_TELEMETRY_DISABLED: '1',
    RULELINK_PRIVACY_EVIDENCE_ROOT: path.join(
      appRoot,
      'test-results',
      'privacy',
      'evidence',
    ),
    RULELINK_PRIVACY_MODE: mode,
    RULELINK_PRIVACY_PORT: String(port),
    RULELINK_PRIVACY_BUNDLE_PATH: path.join(
      repoRoot,
      'artifacts',
      'publication',
      'current',
      'bundle.json',
    ),
  };
  await run(process.execPath, [nextCli, 'build'], temporaryAppRoot, environment);
  const server = spawn(
    process.execPath,
    [nextCli, 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      cwd: temporaryAppRoot,
      env: environment,
      stdio: 'inherit',
    },
  );
  try {
    await waitForServer(server, `http://127.0.0.1:${port}/publication.json`);
    await run(process.execPath, [
      playwrightCli,
      'test',
      '--config',
      'playwright.privacy.config.ts',
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
    RULELINK_PUBLIC_TRUST_ENABLED: 'false',
    RULELINK_PUBLIC_PRIVACY_ENABLED: 'false',
    RULELINK_PUBLIC_ANALYTICS_ENABLED: 'false',
    RULELINK_PUBLIC_ADVERTISING_ENABLED: 'false',
    RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED: 'false',
  };
}

function enabledEnvironment() {
  return {
    NEXT_PUBLIC_RULELINK_INDEXING: 'true',
    RULELINK_PUBLIC_TRUST_ENABLED: 'true',
    RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON: '[]',
    RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: '리알레 주식회사',
    RULELINK_PUBLIC_CONTACT_LABEL: '개인정보 문의',
    RULELINK_PUBLIC_CONTACT_URL: 'mailto:privacy@rulelink.kr',
    RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE:
      '법률 검토자의 승인 원장과 자격 근거를 콘텐츠별로 공개합니다.',
    RULELINK_PUBLIC_PRIVACY_ENABLED: 'true',
    RULELINK_PUBLIC_PRIVACY_VERSION: '2026-07-24-v1',
    RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE: '2026-07-24',
    RULELINK_PUBLIC_PRIVACY_WITHDRAWAL:
      '각 상세 글의 표시 초기화 버튼으로 기기 저장 상태를 즉시 삭제할 수 있습니다.',
    RULELINK_PUBLIC_HOSTING_PROVIDER: 'Vercel Inc.',
    RULELINK_PUBLIC_HOSTING_PURPOSE:
      '웹사이트 제공, 보안 유지와 오류 진단을 위한 요청 로그 처리',
    RULELINK_PUBLIC_HOSTING_DATA_TYPES_JSON:
      '["IP 주소","요청 시각","요청 URL","사용자 에이전트"]',
    RULELINK_PUBLIC_HOSTING_RETENTION: '30일',
    RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON: '["대한민국","미국"]',
    RULELINK_PUBLIC_HOSTING_TRANSFER_THIRD_PARTY: 'true',
    RULELINK_PUBLIC_HOSTING_TRANSFER_DESCRIPTION:
      '호스팅 제공자가 사이트 제공과 보안을 위해 위 항목을 대한민국과 미국에서 처리',
    RULELINK_PUBLIC_ANALYTICS_ENABLED: 'false',
    RULELINK_PUBLIC_ADVERTISING_ENABLED: 'false',
    RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED: 'false',
  };
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
