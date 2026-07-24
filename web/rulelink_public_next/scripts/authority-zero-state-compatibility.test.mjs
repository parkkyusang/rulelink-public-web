import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  projectAuthorityReadingUnits,
  resolveAuthorityReadingForEntry,
} from '../src/lib/authority-reading.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..');

test('023 current의 authority 0건은 새 경로·구역·binding을 생성하지 않는다', async () => {
  const bundle = JSON.parse(await readFile(path.join(
    repoRoot,
    'artifacts',
    'publication',
    'current',
    'bundle.json',
  ), 'utf8'));
  const knowledge = bundle.knowledge;
  assert.equal(projectAuthorityReadingUnits(knowledge).length, 0);
  assert.ok(knowledge.content_entries.every(entry => (
    resolveAuthorityReadingForEntry(knowledge, entry).length === 0
  )));
  assert.equal(knowledge.authority_reading_units, undefined);
  assert.equal(knowledge.authority_bindings, undefined);
});

test('authority가 없으면 기존 상세 내비게이션을 그대로 쓰고 빈 heading이나 section을 만들지 않는다', async () => {
  const [page, section, sitemap, route] = await Promise.all([
    readFile(path.join(appRoot, 'app', 'ko', 'knowledge', '[slug]', 'page.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src', 'components', 'authority-reading-section.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'app', 'sitemap.ts'), 'utf8'),
    readFile(path.join(
      appRoot,
      'app',
      'ko',
      'authorities',
      '[law-key]',
      '[article-no]',
      'page.tsx',
    ), 'utf8'),
  ]);
  assert.match(page, /authorityReadingUnits\.length \? \(/);
  assert.match(page, /hasCasePractice=\{false\}/);
  assert.match(page, /className="knowledgeSectionNav"/);
  assert.match(section, /if \(!views\.length\) return null/);
  assert.doesNotMatch(section, /precedentCount|case-practice|판례·실무 근거/);
  assert.match(sitemap, /authorityReadingUnits\.map\(unit =>/);
  assert.match(route, /authorityRouteParams\(await listAuthorityReadingUnits\(\)\)/);
});
