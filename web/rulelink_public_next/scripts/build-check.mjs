import {spawnSync} from 'node:child_process';

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(command, ['run', 'build'], {
  cwd: process.cwd(),
  env: {...process.env, RULELINK_PUBLIC_BUILD_CHECK: 'true'},
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
