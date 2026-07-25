import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const cli = path.join(
  appRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
);
const child = spawn(
  process.execPath,
  [cli, 'test', '--config', 'playwright.trust.config.ts'],
  {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  },
);
const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 0));
});
process.exitCode = exitCode;
