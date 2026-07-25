import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {projectChangeBrief, sourceVersionScopeLabelKo} from '../src/lib/change-brief-projection.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(await readFile(
  path.resolve(appRoot, '..', '..', 'artifacts', 'publication', 'current', 'bundle.json'),
  'utf8',
));

function projectionFor(brief, overrides = {}) {
  const assertionIds = new Set(brief.assertion_ids);
  return projectChangeBrief({
    brief,
    assertions: bundle.assertions.filter(assertion => assertionIds.has(assertion.assertion_id)),
    entries: bundle.knowledge.content_entries,
    sources: bundle.knowledge.sources,
    asOf: bundle.built_at,
    ...overrides,
  });
}

test('법령변화 11건은 정본 결박으로 생활질문과 검증된 공식원문을 모두 투영한다', () => {
  assert.equal(bundle.change_briefs.length, 11);
  const projections = bundle.change_briefs.map(brief => [brief, projectionFor(brief)]);
  for (const [brief, projection] of projections) {
    assert.ok(projection.related_readings.length > 0, `${brief.change_brief_id}: 관련 생활질문 없음`);
    assert.ok(projection.official_sources.length > 0, `${brief.change_brief_id}: 검증된 공식원문 없음`);
    assert.ok(projection.official_sources.every(source => source.url.startsWith('https://')));
    assert.ok(projection.official_sources.every(source => source.source_snapshot_id));
  }
  assert.equal(projections.filter(([, value]) => value.related_readings[0].basis === 'explicit_related_content').length, 10);
  assert.equal(projections.filter(([, value]) => value.related_readings[0].basis === 'shared_source_snapshot').length, 1);
});

test('명시 연결이 없는 행정심판 변화는 정확히 같은 source snapshot을 쓰는 기존 상세만 연결한다', () => {
  const brief = bundle.change_briefs.find(item => (
    item.change_brief_id === 'kr.change.administrative-appeals-state-representative-documents'
  ));
  assert.ok(brief);
  assert.deepEqual(brief.related_content_ids ?? [], []);
  const projection = projectionFor(brief);
  assert.ok(projection.related_readings.every(reading => reading.basis === 'shared_source_snapshot'));
  const projectedIds = new Set(projection.related_readings.map(reading => reading.content_id));
  for (const contentId of [
    'content.admin-appeal.application-preparation',
    'content.admin-appeal.documents-law-change',
    'content.admin-appeal.eligibility-document-branch',
  ]) assert.ok(projectedIds.has(contentId), `${contentId}: source snapshot 연결 누락`);
  const unrelatedEntries = bundle.knowledge.content_entries.map(entry => ({...entry, source_coordinate_ids: []}));
  assert.deepEqual(projectionFor(brief, {entries: unrelatedEntries}).related_readings, []);
});

test('공식원문은 verified 좌표만 내보내며 URL을 추측하지 않는다', () => {
  const brief = bundle.change_briefs[0];
  const source = bundle.assertions.find(assertion => brief.assertion_ids.includes(assertion.assertion_id))
    .source_coordinates[0];
  const assertion = {
    assertion_id: 'assertion.unverified',
    user_facing_text_ko: '미검증 근거',
    proposition_type: 'rule',
    applies_when: [],
    does_not_apply_when: [],
    source_coordinates: [{...source, validation_status: 'unverified'}],
  };
  const projection = projectChangeBrief({
    brief: {...brief, assertion_ids: [assertion.assertion_id], related_content_ids: []},
    assertions: [assertion],
    entries: [],
    sources: [],
    asOf: bundle.built_at,
  });
  assert.deepEqual(projection.official_sources, []);
});

test('시행 상태는 lifecycle 문구가 아니라 시행일과 기준시각으로 계산한다', () => {
  const brief = bundle.change_briefs[0];
  const common = {assertions: [], entries: [], sources: []};
  const future = projectChangeBrief({
    ...common,
    brief: {...brief, effective_date: '2027-01-01', lifecycle: 'currently_effective'},
    asOf: '2026-12-31T23:59:59+09:00',
  });
  assert.equal(future.status, 'future_effective');
  assert.equal(future.lifecycle_consistent, false);
  const current = projectChangeBrief({
    ...common,
    brief: {...brief, effective_date: '2026-01-01', lifecycle: 'future_effective'},
    asOf: '2026-01-01T00:00:00+09:00',
  });
  assert.equal(current.status, 'currently_effective');
  assert.equal(current.lifecycle_consistent, false);
});

test('구법·현행·시행예정 source 좌표를 서로 다른 문언 상태로 표시한다', async () => {
  assert.equal(sourceVersionScopeLabelKo('historical'), '종전 시행 문언');
  assert.equal(sourceVersionScopeLabelKo('current_as_of_review'), '검토일 현재 시행 문언');
  assert.equal(sourceVersionScopeLabelKo('future_effective'), '시행 예정 신문언');
  assert.equal(sourceVersionScopeLabelKo(undefined), '검토 당시 문언');

  const assertionById = new Map(bundle.assertions.map(assertion => [assertion.assertion_id, assertion]));
  const scopesByBrief = bundle.change_briefs.map(brief => (
    new Set(brief.assertion_ids.flatMap(assertionId => (
      assertionById.get(assertionId)?.source_coordinates.map(coordinate => coordinate.version_scope) ?? []
    )))
  ));
  assert.equal(scopesByBrief.filter(scopes => scopes.has('historical')).length, 11);
  assert.equal(scopesByBrief.filter(scopes => scopes.has('current_as_of_review')).length, 11);

  const pageSource = await readFile(path.join(appRoot, 'app', 'ko', 'changes', '[slug]', 'page.tsx'), 'utf8');
  assert.match(pageSource, /sourceVersionScopeLabelKo\(coordinate\.version_scope\)/u);
  assert.doesNotMatch(pageSource, /version_scope === 'future_effective' \?/u);
});

test('법령변화 상세와 공용 문맥 컴포넌트는 생활질문·공식근거 구역을 분리한다', async () => {
  const pageSource = await readFile(path.join(appRoot, 'app', 'ko', 'changes', '[slug]', 'page.tsx'), 'utf8');
  const componentSource = await readFile(path.join(appRoot, 'src', 'components', 'change-brief-context.tsx'), 'utf8');
  assert.match(pageSource, /<ChangeBriefContext\b/u);
  assert.match(pageSource, /projection\.official_sources/u);
  assert.match(pageSource, /coordinate\.validation_status === 'verified'/u);
  assert.match(componentSource, /href=\{`\/ko\/knowledge\/\$\{reading\.slug\}`\}/u);
  assert.match(componentSource, /시행 시점 읽기/u);
  assert.doesNotMatch(componentSource, /\/ko\/changes\/(?:platform|victim|administrative)/u);
});
