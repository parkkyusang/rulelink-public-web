import {access, copyFile, mkdir, rm} from 'node:fs/promises';
import path from 'node:path';

const appRoot = process.cwd();
const repoRoot = process.env.RULELINK_REPO_ROOT
  ? path.resolve(process.env.RULELINK_REPO_ROOT)
  : path.resolve(appRoot, '..', '..');
const previewMode = process.env.RULELINK_EDITORIAL_PREVIEW_MODE === 'true';
const defaultSource = previewMode
  ? path.join(repoRoot, 'artifacts', 'content', 'current', 'editorial-preview-bundle.json')
  : path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const source = process.env.RULELINK_PUBLICATION_BUNDLE
  ? path.resolve(process.env.RULELINK_PUBLICATION_BUNDLE)
  : defaultSource;
const targetName = previewMode
  ? 'editorial-preview-bundle.json'
  : 'bundle.json';
const target = path.join(appRoot, 'content', targetName);
const derivedFiles = [
  'source-text-library.json',
  'maintenance-index.json',
];

if (await exists(source)) {
  await mkdir(path.dirname(target), {recursive: true});
  await copyFile(source, target);
  process.stdout.write(`출판본 동기화: ${source} -> ${target}\n`);
} else {
  await rm(target, {force: true});
  process.stdout.write(`승인된 출판본이 없어 빈 공개 정보관을 빌드합니다: ${source}\n`);
}

for (const filename of derivedFiles) {
  const derivedSource = path.join(
    repoRoot,
    'artifacts',
    'publication',
    'derived',
    filename,
  );
  const derivedTarget = path.join(appRoot, 'content', filename);
  if (!previewMode && await exists(derivedSource)) {
    await mkdir(path.dirname(derivedTarget), {recursive: true});
    await copyFile(derivedSource, derivedTarget);
    process.stdout.write(`파생 출판 구조 동기화: ${derivedSource} -> ${derivedTarget}\n`);
  } else {
    await rm(derivedTarget, {force: true});
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
