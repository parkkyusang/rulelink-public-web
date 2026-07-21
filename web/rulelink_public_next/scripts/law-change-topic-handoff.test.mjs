import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicDirectory = path.join(repositoryRoot, 'artifacts', 'publication', 'topics');
const handoffPath = path.join(topicDirectory, 'law-change-briefs.json');

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function publishedContentIds() {
  const files = (await readdir(topicDirectory))
    .filter((file) => file.endsWith('.json'))
    .filter((file) => !['manifest.json', 'law-change-briefs.json'].includes(file));
  const ids = new Set();
  for (const file of files) {
    const topic = await readJson(path.join(topicDirectory, file));
    for (const entry of topic.content_entries ?? []) ids.add(entry.content_id);
  }
  return ids;
}

test('법령변화 인계본은 종전·현행 근거를 분리하고 모든 참조를 닫는다', async () => {
  const handoff = await readJson(handoffPath);
  assert.equal(handoff.schema, 'rulelink_public_change_brief_set_v1');
  assert.ok(handoff.change_briefs.length >= 4);

  const assertionById = new Map(handoff.assertions.map((item) => [item.assertion_id, item]));
  assert.equal(assertionById.size, handoff.assertions.length, 'assertion_id는 중복될 수 없습니다.');
  const briefIds = new Set(handoff.change_briefs.map((item) => item.change_brief_id));
  assert.equal(briefIds.size, handoff.change_briefs.length, 'change_brief_id는 중복될 수 없습니다.');
  const contentIds = await publishedContentIds();

  for (const brief of handoff.change_briefs) {
    assert.equal(brief.editorial_status, 'approved');
    assert.match(brief.effective_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(brief.norm_delta?.old_frame);
    assert.ok(brief.norm_delta?.new_frame);
    assert.notDeepEqual(
      brief.norm_delta.old_frame.source_snapshot_ids,
      brief.norm_delta.new_frame.source_snapshot_ids,
      `${brief.change_brief_id}: 종전·현행 근거 묶음이 같아서는 안 됩니다.`,
    );

    const oldId = brief.assertion_ids.find((id) => id.endsWith('.old'));
    const currentId = brief.assertion_ids.find((id) => id.endsWith('.current'));
    assert.ok(oldId && currentId, `${brief.change_brief_id}: old/current assertion 쌍이 필요합니다.`);
    const oldAssertion = assertionById.get(oldId);
    const currentAssertion = assertionById.get(currentId);
    assert.ok(oldAssertion && currentAssertion, `${brief.change_brief_id}: assertion 참조가 닫히지 않았습니다.`);
    assert.ok(oldAssertion.source_coordinates.every((item) => item.version_scope === 'historical'));
    assert.ok(currentAssertion.source_coordinates.every((item) => item.version_scope === 'current_as_of_review'));

    const oldEvidence = new Set(oldAssertion.source_coordinates.map((item) => `${item.source_id}:${item.source_snapshot_id}`));
    const currentEvidence = new Set(currentAssertion.source_coordinates.map((item) => `${item.source_id}:${item.source_snapshot_id}`));
    assert.ok(
      [...currentEvidence].some((coordinate) => !oldEvidence.has(coordinate)),
      `${brief.change_brief_id}: 현행 근거는 종전 근거와 구별되는 좌표를 포함해야 합니다.`,
    );

    for (const coordinate of [...oldAssertion.source_coordinates, ...currentAssertion.source_coordinates]) {
      assert.match(coordinate.official_url, /^https:\/\/(www\.)?law\.go\.kr\//);
      assert.match(coordinate.source_snapshot_id, /^snapshot:[a-f0-9]{32}$/);
      assert.match(coordinate.source_hash, /^sha256:[a-f0-9]{64}$/);
      assert.equal(coordinate.validation_status, 'verified');
      assert.ok(coordinate.last_verified_at);
    }
    for (const contentId of brief.related_content_ids ?? []) {
      assert.ok(contentIds.has(contentId), `${brief.change_brief_id}: ${contentId}가 공개 주제 원본에 없습니다.`);
    }
  }
});

test('법령변화 인계본은 저자·감수자 표시와 운영 통합 파일을 포함하지 않는다', async () => {
  const handoff = await readJson(handoffPath);
  assert.equal(handoff.checks.named_author_publication, false);
  const forbiddenKeys = new Set(['author', 'author_name', 'reviewer', 'reviewer_name', '감수자', '작성자']);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbiddenKeys.has(key), `공개하지 않는 인적 표기 필드가 포함됐습니다: ${key}`);
      visit(child);
    }
  };
  visit(handoff);
  const manifest = await readJson(path.join(topicDirectory, 'manifest.json'));
  assert.ok(!manifest.topics.some((item) => item.file === 'law-change-briefs.json'));
});
