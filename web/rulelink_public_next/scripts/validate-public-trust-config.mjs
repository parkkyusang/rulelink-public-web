import {access, readFile} from 'node:fs/promises';
import path from 'node:path';

import {validatePublicTrustConfiguration} from '../src/lib/public-trust.ts';
import {validatePublicPrivacyConfiguration} from '../src/lib/public-data-practices.ts';

const appRoot = process.cwd();
const defaultBundlePath = path.resolve(
  appRoot,
  '..',
  '..',
  'artifacts',
  'publication',
  'current',
  'bundle.json',
);
const fallbackBundlePath = path.join(appRoot, 'content', 'bundle.json');
const bundlePath = process.env.RULELINK_PUBLICATION_BUNDLE
  ? path.resolve(process.env.RULELINK_PUBLICATION_BUNDLE)
  : await exists(defaultBundlePath)
    ? defaultBundlePath
    : fallbackBundlePath;
const bundle = await readJsonIfPresent(bundlePath);
const entries = Array.isArray(bundle?.knowledge?.content_entries)
  ? bundle.knowledge.content_entries
  : [];
const editorialAttributions = entries.flatMap(entry => (
  entry?.editorial_attribution === undefined ? [] : [entry.editorial_attribution]
));
const hasEditorialAttribution = editorialAttributions.length > 0;
const errors = validatePublicTrustConfiguration(process.env, {
  editorialAttributions,
  hasEditorialAttribution,
});
errors.push(...validatePublicPrivacyConfiguration(process.env));

if (errors.length) {
  for (const error of errors) {
    process.stderr.write(`공개 신뢰 설정 검증 실패: ${error}\n`);
  }
  process.exit(1);
}

const state = process.env.RULELINK_PUBLIC_TRUST_ENABLED === 'true'
  ? '공개 준비 완료'
  : '비활성화';
process.stdout.write(
  `공개 신뢰·데이터 처리 설정 검증 통과: ${state}, 개인정보 ${
    process.env.RULELINK_PUBLIC_PRIVACY_ENABLED === 'true' ? '공개 준비 완료' : '비활성화'
  }, 편집자 표지 ${hasEditorialAttribution ? '있음' : '0건'}\n`,
);

async function readJsonIfPresent(filename) {
  if (!(await exists(filename))) return null;
  return JSON.parse(await readFile(filename, 'utf8'));
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}
