import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('zero-result search filters are unavailable and URL state falls back to all', async () => {
  const component = await readFile(
    path.join(root, 'src', 'components', 'site-search.tsx'),
    'utf8',
  );
  assert.match(component, /candidate === 'all' \|\| totalCounts\[candidate\] > 0/u);
  assert.match(component, /allowedFilters: availableFilters/u);
  assert.match(component, /if \(count === 0\) return null;/u);
});
