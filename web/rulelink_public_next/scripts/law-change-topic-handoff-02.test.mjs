import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const topicDirectory = path.join(repositoryRoot, 'artifacts', 'publication', 'topics');
const handoffFile = 'law-change-briefs-02.json';
const handoffPath = path.join(topicDirectory, handoffFile);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function publishedContentIds() {
  const files = (await readdir(topicDirectory))
    .filter((file) => file.endsWith('.json'))
    .filter((file) => file !== 'manifest.json' && !file.startsWith('law-change-briefs'));
  const ids = new Set();
  for (const file of files) {
    const topic = await readJson(path.join(topicDirectory, file));
    for (const entry of topic.content_entries ?? []) ids.add(entry.content_id);
  }
  return ids;
}

test('두 번째 법령변화 인계본은 종전·현행·적용례와 공개 콘텐츠 참조를 닫는다', async () => {
  const handoff = await readJson(handoffPath);
  assert.equal(handoff.schema, 'rulelink_public_change_brief_set_v1');
  assert.equal(handoff.change_briefs.length, 4);
  assert.equal(handoff.assertions.length, 8);

  const assertionById = new Map(handoff.assertions.map((item) => [item.assertion_id, item]));
  assert.equal(assertionById.size, handoff.assertions.length, 'assertion_id는 중복될 수 없습니다.');
  const briefIds = new Set(handoff.change_briefs.map((item) => item.change_brief_id));
  assert.equal(briefIds.size, handoff.change_briefs.length, 'change_brief_id는 중복될 수 없습니다.');
  const contentIds = await publishedContentIds();

  for (const brief of handoff.change_briefs) {
    assert.equal(brief.editorial_status, 'approved');
    assert.equal(brief.transition_status, 'verified');
    assert.match(brief.effective_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(brief.norm_delta?.old_frame);
    assert.ok(brief.norm_delta?.new_frame);
    assert.notDeepEqual(brief.old_snapshot_ids, brief.new_snapshot_ids);
    assert.ok(brief.norm_delta.old_frame.transition_rule.length > 0);
    assert.ok(brief.norm_delta.new_frame.transition_rule.length > 0);

    const oldId = brief.assertion_ids.find((id) => id.endsWith('.old'));
    const currentId = brief.assertion_ids.find((id) => id.endsWith('.current'));
    const oldAssertion = assertionById.get(oldId);
    const currentAssertion = assertionById.get(currentId);
    assert.ok(oldAssertion && currentAssertion, `${brief.change_brief_id}: old/current assertion 쌍이 닫혀야 합니다.`);
    assert.ok(oldAssertion.source_coordinates.every((item) => item.version_scope === 'historical'));
    assert.ok(currentAssertion.source_coordinates.every((item) => item.version_scope === 'current_as_of_review'));

    const oldEvidence = new Set(oldAssertion.source_coordinates.map((item) => `${item.source_id}:${item.source_snapshot_id}`));
    const currentEvidence = new Set(currentAssertion.source_coordinates.map((item) => `${item.source_id}:${item.source_snapshot_id}`));
    assert.ok([...currentEvidence].some((coordinate) => !oldEvidence.has(coordinate)));

    for (const coordinate of [...oldAssertion.source_coordinates, ...currentAssertion.source_coordinates]) {
      assert.match(coordinate.official_url, /^https:\/\/(www\.)?law\.go\.kr\//);
      assert.match(coordinate.source_snapshot_id, /^snapshot:[a-f0-9]{32}$/);
      assert.match(coordinate.source_hash, /^sha256:[a-f0-9]{64}$/);
      assert.equal(coordinate.validation_status, 'verified');
      assert.ok(coordinate.last_verified_at);
    }
    for (const contentId of brief.related_content_ids) {
      assert.ok(contentIds.has(contentId), `${brief.change_brief_id}: ${contentId}가 공개 주제 원본에 없습니다.`);
    }
  }
});

test('날짜·조문·전자교부의 핵심 법률변화를 회귀검사로 고정한다', async () => {
  const handoff = await readJson(handoffPath);
  const byId = new Map(handoff.change_briefs.map((item) => [item.change_brief_id, item]));
  const minor = byId.get('kr.change.minor-heir-special-limited-acceptance-2022');
  const wage = byId.get('kr.change.wage-statement-delivery-2021');
  const housing = byId.get('kr.change.landlord-information-presentation-2023');
  const victim = byId.get('kr.change.victim-prosecutor-record-access-2026');

  assert.equal(minor.effective_date, '2022-12-13');
  assert.match(minor.transition_note_ko, /시행 당시 미성년자/);
  assert.match(minor.transition_note_ko, /당시 성년자/);
  assert.equal(wage.effective_date, '2021-11-19');
  assert.match(wage.summary_ko, /전자문서/);
  assert.equal(housing.effective_date, '2023-04-18');
  assert.match(housing.transition_note_ko, /공포일/);
  assert.equal(victim.effective_date, '2026-06-24');
  assert.equal(victim.article_no, '제294조의5');
  assert.match(victim.summary_ko, /검사/);
});

test('두 번째 법령변화 인계본은 저자표기와 운영 통합을 요구하지 않는다', async () => {
  const handoff = await readJson(handoffPath);
  assert.equal(handoff.checks.named_author_publication, false);
  const manifest = await readJson(path.join(topicDirectory, 'manifest.json'));
  assert.ok(!manifest.topics.some((item) => item.file === handoffFile));

  const forbiddenKeys = new Set(['author', 'author_name', 'reviewer', 'reviewer_name', '감수자', '작성자']);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbiddenKeys.has(key), `공개하지 않는 인적 표기 필드가 포함됐습니다: ${key}`);
      visit(child);
    }
  };
  visit(handoff);
});
