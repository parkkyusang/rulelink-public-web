import {spawn} from 'node:child_process';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const port = argument('--port') ?? '8892';
const temporaryRoot = path.join(
  os.tmpdir(),
  `rulelink-trust-browser-${process.pid}`,
);
const temporaryAppRoot = path.join(temporaryRoot, 'app');
const childEnvironment = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED: 'true',
  RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON: JSON.stringify([{
    evidence_url: 'https://rulelink.kr/ko/trust/reviewers/kr-bar-2026-001',
    name_ko: '김법률',
    qualification_ko: '대한민국 변호사',
    reviewer_registry_id: 'reviewer.kr-bar.2026-001',
  }]),
  RULELINK_PUBLIC_CONTACT_LABEL: '콘텐츠 오류 제보',
  RULELINK_PUBLIC_CONTACT_URL: 'mailto:corrections@rulelink.kr',
  RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: '룰링크 정보서비스 운영 주체',
  RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE:
    '법률 검토자의 승인 원장과 자격 근거를 콘텐츠별로 공개합니다.',
  RULELINK_PUBLIC_TRUST_ENABLED: 'true',
  RULELINK_PUBLICATION_NOW: '2026-07-24T00:00:00+09:00',
};
let server = null;

try {
  const bundle = JSON.parse(await readFile(path.join(
    repoRoot,
    'artifacts',
    'publication',
    'snapshots',
    'kr-knowledge-core-20260723-023',
    'bundle.json',
  ), 'utf8'));
  if (bundle.snapshot_id !== 'kr-knowledge-core-20260723-023') {
    throw new Error(`신뢰 fixture 기준 snapshot이 다릅니다: ${bundle.snapshot_id}`);
  }
  const fixtureBundle = withEditorialFixture(bundle);

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
    `${JSON.stringify(fixtureBundle, null, 2)}\n`,
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

function withEditorialFixture(bundle) {
  const next = structuredClone(bundle);
  next.snapshot_id = `${bundle.snapshot_id}-trust-browser-fixture`;
  const entry = next.knowledge?.content_entries?.find(
    item => item.content_id === 'content.legal-heir-order-and-spouse',
  );
  if (!entry) {
    throw new Error('신뢰 브라우저 fixture 대상 콘텐츠가 없습니다.');
  }
  entry.editorial_attribution = {
    author: {
      kind: 'organization',
      name_ko: '룰링크 콘텐츠 운영팀',
      role_ko: '법률정보 작성·편집',
    },
    legal_reviewer: {
      reviewer_registry_id: 'reviewer.kr-bar.2026-001',
      reviewed_at: entry.reviewed_at,
      review_areas_ko: ['상속', '가족법'],
    },
  };
  return next;
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
