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

if (await exists(source)) {
  await mkdir(path.dirname(target), {recursive: true});
  await copyFile(source, target);
  process.stdout.write(`출판본 동기화: ${source} -> ${target}\n`);
} else {
  await rm(target, {force: true});
  process.stdout.write(`승인된 출판본이 없어 빈 공개 정보관을 빌드합니다: ${source}\n`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
