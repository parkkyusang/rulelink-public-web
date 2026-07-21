import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  publicationStatusCounts,
  renderPublicationStatusSection,
  validatePublicationStatusSection,
} from './sync-readme-publication-status.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [readme, bundle] = await Promise.all([
  readFile(path.resolve(root, '..', '..', 'README.md'), 'utf8'),
  readFile(path.resolve(root, '..', '..', 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8').then(JSON.parse),
]);

test('README 공개본 현황은 현재 승인 번들에서 결정론적으로 생성한다', () => {
  assert.doesNotThrow(() => validatePublicationStatusSection(readme, bundle));
  const section = renderPublicationStatusSection(bundle);
  const counts = publicationStatusCounts(bundle);

  assert(section.includes(`\`${bundle.snapshot_id}\``));
  assert(section.includes(`생활법률 지식: ${counts.knowledgeEntries}개`));
  assert(section.includes(`법리카드: ${counts.ruleCards}개`));
  assert(section.includes(`사실분기: ${counts.scenarioBranches}개`));
  assert(section.includes(`공식 근거 좌표: ${counts.sources}개`));
});
