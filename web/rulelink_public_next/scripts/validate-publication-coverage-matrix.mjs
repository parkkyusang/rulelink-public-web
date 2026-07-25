import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  DEFAULT_COVERAGE_MANIFEST_PATH,
  DEFAULT_PUBLICATION_BUNDLE_PATH,
  loadCoverageDocuments,
  validateCoverageDocuments,
} from './publication-coverage-core.mjs';

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function validatePublicationCoverageMatrix(options = {}) {
  const documents = await loadCoverageDocuments(options);
  return validateCoverageDocuments(documents);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await validatePublicationCoverageMatrix({
    manifestPath:
      optionValue('--manifest') ??
      process.env.RULELINK_COVERAGE_MANIFEST_PATH ??
      DEFAULT_COVERAGE_MANIFEST_PATH,
    bundlePath:
      optionValue('--bundle') ??
      process.env.RULELINK_COVERAGE_BUNDLE_PATH ??
      DEFAULT_PUBLICATION_BUNDLE_PATH,
  });
  if (result.errors.length > 0 || result.invalidations.length > 0) {
    process.stderr.write(
      `publication coverage matrix 검증 실패:\n- ${[
        ...result.errors,
        ...result.invalidations,
      ].join('\n- ')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `publication coverage matrix ${result.units.length}개 단위 검증 통과\n`,
  );
}
