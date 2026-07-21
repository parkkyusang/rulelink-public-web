import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  expectedLiveRoutes,
  expectedPublicationCounts,
  validateLivePublication,
} from './smoke-live-publication.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(await readFile(
  path.resolve(root, '..', '..', 'artifacts', 'publication', 'current', 'bundle.json'),
  'utf8',
));

test('운영 실주소 상태는 현재 main 출판본의 스냅샷과 공개 건수를 요구한다', () => {
  const publication = {
    schema: 'rulelink_publication_status_v1',
    status: 'published',
    snapshot_id: bundle.snapshot_id,
    counts: expectedPublicationCounts(bundle),
  };

  assert.doesNotThrow(() => validateLivePublication(publication, bundle));
  assert.throws(
    () => validateLivePublication({...publication, snapshot_id: 'stale-snapshot'}, bundle),
    /운영 스냅샷이 main과 다릅니다/,
  );
});

test('운영 실주소 점검은 승인된 상세 경로와 허브를 빠짐없이 포함한다', () => {
  const routes = new Set(expectedLiveRoutes(bundle));

  assert(routes.has('/'));
  for (const entry of bundle.knowledge?.content_entries ?? []) {
    assert(routes.has(`/ko/knowledge/${entry.slug}`), `지식 경로 누락: ${entry.slug}`);
  }
  for (const hub of bundle.knowledge?.topic_hubs ?? []) {
    assert(routes.has(`/ko/hubs/${hub.slug}`), `허브 경로 누락: ${hub.slug}`);
  }
});
