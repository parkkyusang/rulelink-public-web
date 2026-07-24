import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const cli = path.join(appRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const modes = [
  {
    name: 'default',
    port: '8894',
    environment: {
      NEXT_PUBLIC_RULELINK_INDEXING: 'true',
    },
  },
  {
    name: 'alternate',
    port: '8895',
    environment: {
      NEXT_PUBLIC_RULELINK_INDEXING: 'true',
      NEXT_PUBLIC_RULELINK_OPERATOR_NAME: '교체검증운영자',
      NEXT_PUBLIC_RULELINK_SITE_ENGLISH_NAME: 'IdentitySwitch',
      NEXT_PUBLIC_RULELINK_SITE_NAME: '교체검증브랜드',
      NEXT_PUBLIC_RULELINK_SITE_URL: 'https://identity-switch.lolphysical.xyz',
      RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON: '[]',
      RULELINK_PUBLIC_CONTACT_LABEL: '정체성 시험 연락',
      RULELINK_PUBLIC_CONTACT_URL: 'mailto:identity-check@lolphysical.xyz',
      RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: '교체검증 법적 운영자',
      RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE:
        '실제 검토자 표지가 있는 경우 승인 근거를 공개합니다.',
      RULELINK_PUBLIC_TRUST_ENABLED: 'true',
    },
  },
];

for (const mode of modes) {
  await run(process.execPath, [
    cli,
    'test',
    '--config',
    'playwright.site-identity.config.ts',
  ], {
    ...process.env,
    ...mode.environment,
    RULELINK_SITE_IDENTITY_MODE: mode.name,
    RULELINK_SITE_IDENTITY_PORT: mode.port,
  });
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: appRoot, env, stdio: 'inherit'});
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(' ')} 실패: ${code}`));
    });
  });
}
