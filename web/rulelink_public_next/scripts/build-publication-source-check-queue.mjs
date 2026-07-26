import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  buildSourceCheckQueue,
  sha256Canonical,
  validateMaintenanceIndex,
  validateSourceCheckQueue,
} from './publication-derived-core.mjs';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptRoot, '..');
const repositoryRoot = path.resolve(appRoot, '..', '..');
const options = parseArguments(process.argv.slice(2));
const artifactRoot = path.join(repositoryRoot, 'artifacts', 'publication');
const bundlePath = path.resolve(
  options.bundle ?? path.join(artifactRoot, 'current', 'bundle.json'),
);
const maintenancePath = path.resolve(
  options.maintenance
    ?? path.join(artifactRoot, 'derived', 'maintenance-index.json'),
);
const sourceLibraryPath = path.join(
  artifactRoot,
  'derived',
  'source-text-library.json',
);
const [bundle, maintenanceIndex, sourceTextLibrary] = await Promise.all([
  readJson(bundlePath),
  readJson(maintenancePath),
  readJson(sourceLibraryPath),
]);
const maintenanceErrors = validateMaintenanceIndex(
  maintenanceIndex,
  bundle,
  sourceTextLibrary,
);
if (maintenanceErrors.length) fail(maintenanceErrors.join('\n'));

const queue = buildSourceCheckQueue({
  bundle,
  maintenanceIndex,
  attentionWindowDays: options.attentionWindowDays,
  generatedAt: options.generatedAt ?? maintenanceIndex.generated_at,
});
const errors = validateSourceCheckQueue(queue, maintenanceIndex, bundle);
if (errors.length) fail(errors.join('\n'));

process.stdout.write(`${JSON.stringify({
  schema: queue.schema,
  materialization: 'in_memory_on_demand',
  counts: queue.counts,
  deterministic_detection_token_budget: 0,
  canonical_sha256: sha256Canonical(queue),
}, null, 2)}\n`);

function parseArguments(args) {
  const result = {
    attentionWindowDays: 30,
    bundle: null,
    generatedAt: null,
    maintenance: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--attention-window-days') {
      const parsed = Number(requiredValue(args, ++index, value));
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
        fail('--attention-window-days는 0~365 정수여야 합니다.');
      }
      result.attentionWindowDays = parsed;
    } else if (value === '--bundle') {
      result.bundle = requiredValue(args, ++index, value);
    } else if (value === '--generated-at') {
      result.generatedAt = requiredValue(args, ++index, value);
    } else if (value === '--maintenance') {
      result.maintenance = requiredValue(args, ++index, value);
    } else {
      fail(`알 수 없는 인자: ${value}`);
    }
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
