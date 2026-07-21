import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = path.join(root, 'app', 'ko', 'knowledge', '[slug]', 'page.tsx');
const componentPath = path.join(root, 'src', 'components', 'knowledge-action-workspace.tsx');
const cssPath = path.join(root, 'src', 'components', 'knowledge-action-workspace.module.css');

test('생활법률 상세 글은 기준일별 기기 저장 확인 목록을 제공한다', async () => {
  const [page, component, css] = await Promise.all([
    readFile(pagePath, 'utf8'),
    readFile(componentPath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(page, /<KnowledgeActionWorkspace/);
  assert.match(page, /contentId=\{entry\.content_id\}/);
  assert.match(page, /revisionKey=\{entry\.reviewed_at\}/);
  assert.match(component, /rulelink-checklist-v1/);
  assert.match(component, /window\.localStorage/);
  assert.match(component, /loadedKey !== storageKey/);
  assert.match(component, /Object\.keys\(checked\)\.filter\(key => validKeys\.has\(key\)\)/);
  assert.match(component, /role="progressbar"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /표시 상태는 서버나 다른 사이트로 전송되지 않고 현재 기기에만 저장됩니다/);
  assert.doesNotMatch(component, /navigator\.clipboard|execCommand\('copy'\)|buildConcierge|liale-review/);
  assert.doesNotMatch(page, /conciergeEntry=|contentTitle=|buildConcierge/);
  assert.match(page, /lawyer_workspace_entry/);
  assert.match(page, /href=\{entry\.lawyer_workspace_entry\.href\}/);
  assert.doesNotMatch(component, /\bfetch\s*\(/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media print/);
});
