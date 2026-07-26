import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  validateMaintenanceIndex,
  validateSourceTextLibrary,
} from './publication-derived-core.mjs';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptRoot, '..');
const repositoryRoot = path.resolve(appRoot, '..', '..');
const artifactRoot = path.join(repositoryRoot, 'artifacts', 'publication');
const [bundle, sourceTextLibrary, maintenanceIndex] = await Promise.all([
  readJson(path.join(artifactRoot, 'current', 'bundle.json')),
  readJson(path.join(artifactRoot, 'derived', 'source-text-library.json')),
  readJson(path.join(artifactRoot, 'derived', 'maintenance-index.json')),
]);
const errors = [
  ...validateSourceTextLibrary(sourceTextLibrary, bundle),
  ...validateMaintenanceIndex(maintenanceIndex, bundle, sourceTextLibrary),
];
if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  `파생 출판 구조 검증 완료: 조문 원문 ${sourceTextLibrary.texts.length}개 · `
  + `근거 결박 ${sourceTextLibrary.bindings.length}개 · `
  + `콘텐츠 상태 ${maintenanceIndex.content_views.length}개\n`,
);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
