import {spawnSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const testFiles = (await readdir(scriptDirectory))
  .filter(name => name.endsWith('.test.mjs') && /(topic|handoff)/u.test(name))
  .sort()
  .map(name => path.join(scriptDirectory, name));

if (testFiles.length === 0) {
  process.stderr.write('주제별 인계 테스트를 찾지 못했습니다.\n');
  process.exit(1);
}

process.stdout.write(`주제별 인계 테스트 자동 발견: ${testFiles.length}개\n`);
const result = spawnSync(process.execPath, ['--test', ...testFiles], {stdio: 'inherit'});
if (result.error) throw result.error;
if (result.signal) {
  process.stderr.write(`주제별 인계 테스트가 신호 ${result.signal}로 종료됐습니다.\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
