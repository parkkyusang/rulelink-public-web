import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  buildCoverageDashboard,
  loadCoverageDocuments,
  validateCoverageDocuments,
} from './publication-coverage-core.mjs';

export async function buildPublicationCoverageDashboard(options = {}) {
  const documents = await loadCoverageDocuments(options);
  return buildCoverageDashboard(validateCoverageDocuments(documents));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dashboard = await buildPublicationCoverageDashboard();
  process.stdout.write(`${JSON.stringify(dashboard, null, 2)}\n`);
}
