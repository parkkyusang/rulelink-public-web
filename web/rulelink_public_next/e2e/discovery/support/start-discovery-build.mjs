import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const supportRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(supportRoot, '..', '..', '..');
const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? process.argv[portIndex + 1] : '8893';
const nextCli = path.join(
  appRoot,
  'node_modules',
  'next',
  'dist',
  'bin',
  'next',
);

if (process.env.RULELINK_DISCOVERY_SKIP_BUILD !== '1') {
  await run(process.execPath, [nextCli, 'build']);
}

const server = spawn(
  process.execPath,
  [nextCli, 'start', '--hostname', '127.0.0.1', '--port', port],
  {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}

server.once('error', error => {
  throw error;
});
server.once('exit', code => {
  process.exitCode = code ?? 0;
});

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`명령이 실패했습니다: ${command} ${args.join(' ')}`));
    });
  });
}
