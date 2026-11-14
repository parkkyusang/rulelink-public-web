import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {changeBriefTransitionDisplay} from '../src/lib/change-brief-editorial.ts';
import {browserOfficialSourceUrl, changeBriefOfficialSourceUrl} from '../src/lib/official-source-url.ts';

const read = name => JSON.parse(readFileSync(new URL(
  '../../../artifacts/publication/topics/' + name, import.meta.url,
), 'utf8'));

test('known reviewed editions get distinct links and leave original coordinates unchanged', () => {
  const data = read('law-change-briefs-administrative-appeals.json');
  const coords = data.assertions.map(assertion => assertion.source_coordinates[0]);
  const baseline = structuredClone(coords);
  const law = '행정심판법 시행령';
  assert.deepEqual(coords.map(c => changeBriefOfficialSourceUrl(c, law)), [
    'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=278135',
    'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=286953',
    'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=286953',
  ]);
  assert.deepEqual(coords, baseline);
  const unknown = {...coords[0], source_snapshot_id: 'snapshot:unknown'};
  assert.equal(changeBriefOfficialSourceUrl(unknown, law), browserOfficialSourceUrl(unknown, law));
  const {source_snapshot_id: _omitted, ...missing} = coords[0];
  assert.equal(changeBriefOfficialSourceUrl(missing, law), browserOfficialSourceUrl(missing, law));
  assert.equal(changeBriefOfficialSourceUrl({...coords[0], validation_status: 'pending'}, law), undefined);
  assert.equal(browserOfficialSourceUrl(coords[0], law), browserOfficialSourceUrl(coords[1], law));
});

test('only the exact C2C transition phrase is replaced on display', () => {
  const data = read('law-change-briefs.json');
  const slug = 'platform-c2c-seller-verification-2026';
  const brief = data.change_briefs.find(brief => brief.slug === slug);
  const lines = brief.norm_delta.new_frame.transition_rule;
  const original = [...lines];
  assert.deepEqual(changeBriefTransitionDisplay(slug, lines), [
    '거래 시점과 분쟁 관련 요청 시점을 정리하고, 개정법 부칙의 적용 여부를 확인합니다.',
  ]);
  assert.deepEqual(lines, original);
  assert.equal(changeBriefTransitionDisplay('an-inheritance-topic', lines), lines);
  assert.deepEqual(changeBriefTransitionDisplay(slug, ['unrelated']), ['unrelated']);
});
