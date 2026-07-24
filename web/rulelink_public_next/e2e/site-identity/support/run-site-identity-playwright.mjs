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
      NEXT_PUBLIC_RULELINK_SITE_URL: 'https://identity-switch.invalid',
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
