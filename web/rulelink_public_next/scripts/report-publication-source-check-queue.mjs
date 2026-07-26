import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  buildSourceCheckQueue,
  validateMaintenanceIndex,
  validateSourceCheckQueue,
} from './publication-derived-core.mjs';

const args = new Set(process.argv.slice(2));
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, '..', '..', '..');
const artifactRoot = path.join(repositoryRoot, 'artifacts', 'publication');
const [bundle, maintenanceIndex, sourceTextLibrary] = await Promise.all([
  readJson(path.join(artifactRoot, 'current', 'bundle.json')),
  readJson(path.join(artifactRoot, 'derived', 'maintenance-index.json')),
  readJson(path.join(artifactRoot, 'derived', 'source-text-library.json')),
]);
const maintenanceErrors = validateMaintenanceIndex(
  maintenanceIndex,
  bundle,
  sourceTextLibrary,
);
if (maintenanceErrors.length) fail(maintenanceErrors.join('\n'));
const queue = buildSourceCheckQueue({bundle, maintenanceIndex});
const queueErrors = validateSourceCheckQueue(queue, maintenanceIndex, bundle);
if (queueErrors.length) fail(queueErrors.join('\n'));
const now = process.env.RULELINK_PUBLICATION_NOW
  ? new Date(process.env.RULELINK_PUBLICATION_NOW)
  : new Date();
if (Number.isNaN(now.getTime())) fail('RULELINK_PUBLICATION_NOW가 유효한 날짜가 아닙니다.');
const attentionAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const due = queue.items.filter(item => Date.parse(item.due_at) <= now.getTime());
const upcoming = queue.items.filter(item => (
  Date.parse(item.due_at) > now.getTime()
  && Date.parse(item.due_at) <= attentionAt.getTime()
));
const dependentCount = values => values.reduce(
  (sum, item) => sum + item.dependency_selector.dependent_content_count,
  0,
);

process.stdout.write([
  '## 증분 근거 점검 작업',
  '',
  `- 전체 공유 근거: ${queue.items.length}개`,
  `- 지금 점검할 근거: ${due.length}개`,
  `- 30일 안에 점검할 근거: ${upcoming.length}개`,
  `- 영향 콘텐츠 참조: 지금 ${dependentCount(due)}개 · 예정 ${dependentCount(upcoming)}개`,
  '- 변경감지는 결정론적 비교만 사용하며 모델 토큰 예산은 0입니다.',
  '- 문언 변경이 확인된 근거만 별도 법률영향 검토로 넘깁니다.',
  '',
].join('\n'));

if (args.has('--fail-on-due') && due.length) {
  process.exitCode = 1;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
