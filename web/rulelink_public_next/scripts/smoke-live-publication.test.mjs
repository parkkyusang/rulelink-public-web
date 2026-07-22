import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  expectedLiveRoutes,
  expectedPublicationCounts,
  representativeOfficialUrls,
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

test('운영 공개 건수는 원본 배열이 아니라 최신성과 실제 연결을 통과한 항목만 센다', () => {
  const counts = expectedPublicationCounts({
    cards: [
      {issue_card_id: 'card.visible', expires_at: '2026-07-24T00:00:00Z'},
      {issue_card_id: 'card.expired', expires_at: '2026-07-22T00:00:00Z'},
    ],
    change_briefs: [
      {expires_at: '2026-07-24T00:00:00Z'},
      {expires_at: '2026-07-22T00:00:00Z'},
    ],
    catalog: {
      topics: [
        {issue_card_ids: ['card.visible']},
        {issue_card_ids: ['card.expired']},
        {issue_card_ids: ['card.missing']},
      ],
    },
    knowledge: {
      content_entries: [
        {content_id: 'content.visible', expires_at: '2026-07-24T00:00:00Z'},
        {content_id: 'content.expired', expires_at: '2026-07-22T00:00:00Z'},
      ],
      topic_hubs: [
        {content_ids: ['content.visible']},
        {content_ids: ['content.expired']},
        {content_ids: ['content.missing']},
      ],
    },
  }, new Date('2026-07-23T00:00:00Z'));

  assert.deepEqual(counts, {
    issue_cards: 1,
    change_briefs: 1,
    knowledge_entries: 1,
    knowledge_hubs: 1,
    public_topics: 1,
  });
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
  for (const concept of bundle.knowledge?.concept_cards ?? []) {
    assert(routes.has(`/ko/concepts/${concept.slug}`), `개념 경로 누락: ${concept.slug}`);
  }
  assert(representativeOfficialUrls(bundle).length > 0, '공식 원문 점검 대상이 필요합니다.');
});
