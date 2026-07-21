import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('검색 의도 문구를 통합검색과 지식 탐색 양쪽에 연결한다', async () => {
  for (const relativePath of [
    'src/components/site-search.tsx',
    'src/components/knowledge-explorer.tsx',
  ]) {
    const source = await readFile(path.join(root, relativePath), 'utf8');
    assert.match(
      source,
      /\.\.\.entry\.search_intents_ko/,
      `${relativePath}에서 search_intents_ko가 검색 문자열에 포함되어야 합니다.`,
    );
  }
});
