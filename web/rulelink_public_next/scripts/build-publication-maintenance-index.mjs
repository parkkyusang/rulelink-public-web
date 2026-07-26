import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  buildMaintenanceIndex,
  sha256Canonical,
  validateMaintenanceIndex,
  validateSourceTextLibrary,
} from './publication-derived-core.mjs';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptRoot, '..');
const repositoryRoot = path.resolve(appRoot, '..', '..');
const options = parseArguments(process.argv.slice(2));
const bundlePath = path.resolve(
  options.bundle
    ?? path.join(repositoryRoot, 'artifacts', 'publication', 'current', 'bundle.json'),
);
const sourceLibraryPath = path.resolve(
  options.sourceLibrary
    ?? path.join(
      repositoryRoot,
      'artifacts',
      'publication',
      'derived',
      'source-text-library.json',
    ),
);
const outputPath = path.resolve(
  options.output
    ?? path.join(
      repositoryRoot,
      'artifacts',
      'publication',
      'derived',
      'maintenance-index.json',
    ),
);

const [bundle, sourceTextLibrary, previousBundle] = await Promise.all([
  readJson(bundlePath),
  readJson(sourceLibraryPath),
  options.previousBundle ? readJson(path.resolve(options.previousBundle)) : null,
]);
const sourceErrors = validateSourceTextLibrary(sourceTextLibrary, bundle);
if (sourceErrors.length) fail(sourceErrors.join('\n'));
const index = buildMaintenanceIndex({
  bundle,
  generatedAt: options.generatedAt ?? bundle.built_at,
  previousBundle,
  sourceTextLibrary,
});
const errors = validateMaintenanceIndex(index, bundle, sourceTextLibrary);
if (errors.length) fail(errors.join('\n'));

if (options.write) {
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

process.stdout.write(`${JSON.stringify({
  schema: index.schema,
  output: options.write ? outputPath : null,
  counts: index.counts,
  canonical_sha256: sha256Canonical(index),
}, null, 2)}\n`);

function parseArguments(args) {
  const result = {
    bundle: null,
    generatedAt: null,
    output: null,
    previousBundle: null,
    sourceLibrary: null,
    write: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--write') result.write = true;
    else if (value === '--bundle') result.bundle = requiredValue(args, ++index, value);
    else if (value === '--generated-at') {
      result.generatedAt = requiredValue(args, ++index, value);
    } else if (value === '--output') result.output = requiredValue(args, ++index, value);
    else if (value === '--previous-bundle') {
      result.previousBundle = requiredValue(args, ++index, value);
    } else if (value === '--source-library') {
      result.sourceLibrary = requiredValue(args, ++index, value);
    } else fail(`알 수 없는 인자: ${value}`);
  }
  return result;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) fail(`${flag} 값이 필요합니다.`);
  return value;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
