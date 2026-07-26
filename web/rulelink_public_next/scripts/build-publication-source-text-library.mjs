import {DatabaseSync} from 'node:sqlite';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  DERIVED_SCHEMAS,
  canonicalJson,
  sha256,
  sha256Canonical,
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
const databasePath = options.lawDb
  ? path.resolve(options.lawDb)
  : null;
const outputPath = path.resolve(
  options.output
    ?? path.join(
      repositoryRoot,
      'artifacts',
      'publication',
      'derived',
      'source-text-library.json',
    ),
);

if (!databasePath) {
  fail('법령 DB 경로가 필요합니다. --law-db <law_sources.sqlite>를 지정하세요.');
}

const [bundleBytes, databaseBytes] = await Promise.all([
  readFile(bundlePath),
  readFile(databasePath),
]);
const bundle = JSON.parse(bundleBytes.toString('utf8'));
const database = new DatabaseSync(databasePath, {readOnly: true});
const directStatement = database.prepare(`
  SELECT
    article.id,
    article.article_no,
    article.article_title,
    article.article_text,
    article.effective_date,
    article.retrieved_at,
    article.source_hash,
    article.source_status,
    law.law_name_ko
  FROM statute_articles article
  JOIN statute_laws law ON law.law_key = article.law_key
  WHERE article.id = ?
`);
const fallbackStatement = database.prepare(`
  SELECT
    article.id,
    article.article_no,
    article.article_title,
    article.article_text,
    article.effective_date,
    article.retrieved_at,
    article.source_hash,
    article.source_status,
    law.law_name_ko
  FROM statute_articles article
  JOIN statute_laws law ON law.law_key = article.law_key
  WHERE law.law_name_ko = ? AND article.article_no = ?
  ORDER BY article.id
`);

const textsById = new Map();
const bindings = [];
const unresolved = [];
for (const source of bundle.knowledge?.sources ?? []) {
  if ((source.source_kind ?? 'statute') !== 'statute') continue;
  let matches = directStatement.all(source.source_id);
  let matchMethod = 'source_id';
  let verifiedMatches = matches.filter(article => articleMatchesSourceVersion(article, source));
  if (verifiedMatches.length !== 1) {
    matches = fallbackStatement.all(source.law_name_ko, source.article_no);
    verifiedMatches = matches.filter(article => articleMatchesSourceVersion(article, source));
    matchMethod = 'law_name_and_article';
  }
  if (verifiedMatches.length !== 1) {
    unresolved.push({
      coordinate_id: source.coordinate_id,
      reason: matches.length === 0
        ? 'ledger_article_missing'
        : verifiedMatches.length === 0
          ? 'ledger_version_mismatch'
          : 'ledger_article_ambiguous',
    });
    continue;
  }
  const article = verifiedMatches[0];
  const computedHash = `sha256:${sha256(article.article_text)}`;
  if (
    article.law_name_ko !== source.law_name_ko
    || article.article_no !== source.article_no
  ) {
    unresolved.push({
      coordinate_id: source.coordinate_id,
      reason: 'ledger_locator_mismatch',
    });
    continue;
  }
  const textId = `text.${computedHash.slice('sha256:'.length)}`;
  textsById.set(textId, {
    text_id: textId,
    source_id: article.id,
    source_hash: computedHash,
    law_name_ko: article.law_name_ko,
    article_no: article.article_no,
    article_title_ko: article.article_title ?? '',
    official_text_ko: article.article_text,
    effective_date: normalizeLawDate(article.effective_date),
    retrieved_at: article.retrieved_at ?? '',
  });
  bindings.push({
    coordinate_id: source.coordinate_id,
    public_source_snapshot_id: source.source_snapshot_id,
    text_id: textId,
    match_method: matchMethod,
    bound_at: source.last_verified_at,
  });
}
database.close();

const generatedAt = options.generatedAt ?? bundle.built_at;
const library = {
  schema: DERIVED_SCHEMAS.sourceText,
  generated_at: new Date(generatedAt).toISOString(),
  publication_snapshot_id: bundle.snapshot_id,
  publication_bundle_sha256: sha256Canonical(bundle),
  source_ledger: {
    kind: 'active_sqlite_export',
    database_sha256: sha256(databaseBytes),
    exported_at: new Date(generatedAt).toISOString(),
  },
  coverage: {
    publication_statute_coordinates: (bundle.knowledge?.sources ?? [])
      .filter(source => (source.source_kind ?? 'statute') === 'statute').length,
    bound_statute_coordinates: bindings.length,
    unique_verified_texts: textsById.size,
    unresolved_statute_coordinates: unresolved.length,
  },
  texts: [...textsById.values()].sort((left, right) => (
    left.text_id.localeCompare(right.text_id, 'en')
  )),
  bindings: bindings.sort((left, right) => (
    left.coordinate_id.localeCompare(right.coordinate_id, 'en')
  )),
  unresolved: unresolved.sort((left, right) => (
    left.coordinate_id.localeCompare(right.coordinate_id, 'en')
  )),
};
const errors = validateSourceTextLibrary(library, bundle);
if (errors.length) fail(errors.join('\n'));

if (options.write) {
  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(outputPath, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
}

process.stdout.write(`${JSON.stringify({
  schema: library.schema,
  output: options.write ? outputPath : null,
  coverage: library.coverage,
  canonical_sha256: sha256(canonicalJson(library)),
}, null, 2)}\n`);

function parseArguments(args) {
  const result = {
    bundle: null,
    generatedAt: null,
    lawDb: null,
    output: null,
    write: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--write') result.write = true;
    else if (value === '--bundle') result.bundle = requiredValue(args, ++index, value);
    else if (value === '--generated-at') {
      result.generatedAt = requiredValue(args, ++index, value);
    } else if (value === '--law-db') result.lawDb = requiredValue(args, ++index, value);
    else if (value === '--output') result.output = requiredValue(args, ++index, value);
    else fail(`알 수 없는 인자: ${value}`);
  }
  return result;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) fail(`${flag} 값이 필요합니다.`);
  return value;
}

function normalizeLawDate(value) {
  if (typeof value !== 'string' || !value) return null;
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function articleMatchesSourceVersion(article, source) {
  if (article.source_status !== 'official_source_verified') return false;
  const computedHash = `sha256:${sha256(article.article_text)}`;
  if (article.source_hash !== computedHash) return false;
  const publicDigest = String(source.source_snapshot_id ?? '')
    .replace(/^snapshot:/u, '');
  return /^[a-f0-9]{32,64}$/u.test(publicDigest)
    && computedHash.slice('sha256:'.length).startsWith(publicDigest);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
