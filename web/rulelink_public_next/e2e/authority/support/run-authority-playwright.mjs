import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const mode = process.argv[2];
if (!['browser', 'release'].includes(mode)) {
  throw new Error('사용법: run-authority-playwright.mjs browser|release');
}
const cli = path.join(appRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const files = mode === 'release'
  ? ['e2e/authority/authority-reading-release.spec.ts']
  : [
      'e2e/authority/authority-reading-multiversion.spec.ts',
      'e2e/authority/authority-zero-state.spec.ts',
    ];
const child = spawn(process.execPath, [cli, 'test', ...files], {
  cwd: appRoot,
  env: {
    ...process.env,
    RULELINK_AUTHORITY_TEST_MODE: mode,
  },
  stdio: 'inherit',
});
const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 0));
});
process.exitCode = exitCode;
