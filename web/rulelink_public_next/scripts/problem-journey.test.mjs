import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {buildJourneySummary, buildProblemJourney, journeyActionState} from '../src/lib/problem-journey.ts';
import {depositProblemJourney} from '../src/lib/deposit-problem-journey.ts';
import {problemJourneyForEntry} from '../src/lib/problem-journey-entry.ts';

const topic = JSON.parse(await readFile(new URL('../../../artifacts/publication/current/bundle.json', import.meta.url), 'utf8')).knowledge;
const library = JSON.parse(await readFile(new URL('../../../artifacts/publication/derived/source-text-library.json', import.meta.url), 'utf8'));
const details = Object.fromEntries(topic.content_entries.map(entry => [entry.content_id, {
  scenarios: topic.scenario_branches.filter(q => entry.scenario_ids.includes(q.scenario_id)),
  sources: topic.sources.filter(source => entry.source_coordinate_ids.includes(source.coordinate_id)).map(source => ({
    id: source.coordinate_id, title: source.title_ko ?? `${source.law_name_ko} ${source.article_no}`,
    href: source.official_url, checkedAt: source.last_verified_at,
    text: library.texts.find(text => text.text_id === library.bindings.find(binding => binding.coordinate_id === source.coordinate_id && binding.public_source_snapshot_id === source.source_snapshot_id)?.text_id)?.official_text_ko,
  })),
}]));
const journey = buildProblemJourney(depositProblemJourney, topic.content_entries, details);
const move = journey.routes[0];
const requiredAction = move.actions.find(action => action.requires.length === 2);

test('네 상황은 실제 출판 질문·행동·근거에 연결되고 식별자 중복이 없다', () => {
  assert.equal(journey.routes.length, 4);
  assert.equal(move.questions.length, 3);
  for (const route of journey.routes) {
    assert.ok(route.sources.length);
    assert.equal(new Set(route.sources.map(x => x.id)).size, route.sources.length);
    for (const action of route.actions) assert.ok(action.href.startsWith('/ko/knowledge/'));
  }
});

test('같은 조문명이라도 다른 원문 기록을 합치지 않고 검증된 참고 안내의 문언을 별도 표시한다', () => {
  const quoted = move.sources.filter(source => source.text);
  assert.ok(quoted.length > 0);
  for (const source of quoted) {
    const binding = library.bindings.find(item => item.coordinate_id === source.id);
    assert.ok(binding);
    assert.equal(source.text, library.texts.find(item => item.text_id === binding.text_id).official_text_ko);
    assert.ok(source.readingTitle);
  }
  assert.equal(move.questions.length, 3, '참고 읽기의 별도 질문을 기존 사실 질문에 몰래 합치지 않습니다.');
});

test('신청은 종료·미반환 모두 예일 때만 활성화; 모름·반대분기를 섞지 않는다', () => {
  const conditions = requiredAction.requires;
  assert.equal(journeyActionState(conditions, {}), 'pending');
  assert.equal(journeyActionState(conditions, {[conditions[0].scenarioId]: 'yes'}), 'pending');
  assert.equal(journeyActionState(conditions, {[conditions[0].scenarioId]: 'yes', [conditions[1].scenarioId]: 'unknown'}), 'pending');
  const yes = Object.fromEntries(conditions.map(c => [c.scenarioId, 'yes']));
  assert.equal(journeyActionState(conditions, yes), 'ready');
  for (const condition of conditions) assert.equal(journeyActionState(conditions, {...yes, [condition.scenarioId]: 'no'}), 'excluded');
});

test('모든 예·아니오·모름 조합에서 조건과 실행상태가 일치한다', () => {
  for (const action of move.actions) {
    for (const a of ['yes', 'no', 'unknown']) for (const b of ['yes', 'no', 'unknown']) for (const c of ['yes', 'no', 'unknown']) {
      const answers = Object.fromEntries(move.questions.map((q, i) => [q.scenario_id, [a, b, c][i]]));
      const actual = journeyActionState(action.requires, answers);
      const expected = action.requires.some(c => answers[c.scenarioId] === 'no') ? 'excluded'
        : action.requires.every(c => answers[c.scenarioId] === 'yes') ? 'ready' : 'pending';
      assert.equal(actual, expected);
    }
  }
});

test('내보내기는 모르는 사실·조건부 행동·주의사항·공식 근거를 보존한다', () => {
  const summary = buildJourneySummary({...journey, origin: 'https://example.org'}, 'move', {}, []);
  assert.match(summary, /확인하지 못함/);
  assert.match(summary, /조건 확인 후/);
  assert.match(summary, /개인 사건의 법률판단이 아닙니다/);
  assert.match(summary, /https:\/\/example.org\/ko\/knowledge\//);
  assert.ok(summary.includes(move.readings[0].caution));
  assert.ok(summary.includes(move.sources[0].href));
  const staleCompletion = buildJourneySummary(journey, 'move', {}, [requiredAction.id]);
  assert.ok(staleCompletion.includes(`[미확인 · 조건 확인 후] ${requiredAction.text}`));
});

test('행동 재배열·삭제·질문 누락은 조용히 다른 안내를 내지 않고 실패한다', () => {
  const changed = structuredClone(topic.content_entries);
  changed.find(x => x.content_id === requiredAction.id.split(':')[0]).action_steps_ko.reverse();
  assert.throws(() => buildProblemJourney(depositProblemJourney, changed, details), /행동 원문 변경/);
  const missingQuestion = structuredClone(details);
  for (const detail of Object.values(missingQuestion)) detail.scenarios = [];
  assert.throws(() => buildProblemJourney(depositProblemJourney, topic.content_entries, missingQuestion), /행동 조건 누락/);
  assert.throws(() => buildProblemJourney(depositProblemJourney, [], details), /안내 연결 누락/);
});

test('범용 실행기는 주제·조문 식별자를 알지 않고 상세 진입도 실제 소속 주제로 연결한다', async () => {
  const engine = await readFile(new URL('../src/lib/problem-journey.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /housing-lease|제3조|보증금/);
  const entry = topic.content_entries.find(x => x.content_id === move.readings[0].id);
  assert.equal(problemJourneyForEntry(entry, topic.topic_hubs), '/ko/hubs/housing-lease-deposit#my-situation');
  assert.equal(problemJourneyForEntry(entry, []), null);
});

test('선택을 외부 URL·자동 통신·기기 저장에 넣지 않으며 복사는 명시 조작이다', async () => {
  const ui = await readFile(new URL('../src/components/problem-journey.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /\bfetch\s*\(|localStorage|sessionStorage|URLSearchParams|location\.(hash|search)\s*=/);
  assert.match(ui, /onClick=\{copySummary\}/);
  assert.match(ui, /setChecked\(\[\]\)/);
  assert.match(ui, /disabled=\{state === 'pending'\}/);
  assert.match(ui, /href="\/ko\/lawyer-workspace"/);
  assert.match(ui, /<details className=\{styles.source\}/);
  assert.doesNotMatch(ui, /<details[^>]*\bopen\b/);
});

test('다른 주제는 실행기 변경 없이 정의와 기존 콘텐츠만 바꿔 같은 기능을 쓴다', () => {
  const entry = {...topic.content_entries[0], content_id: 'content.example', slug: 'example',
    action_steps_ko: ['기존 자료를 준비합니다.'], facts_to_check_ko: ['기준 사실'], caution_ko: '확인 전 단정하지 않습니다.'};
  const scenario = {...topic.scenario_branches[0], scenario_id: 'scenario.example', question_ko: '기준 사실이 확인됐나요?'};
  const definition = {hubId: 'hub.example', title: '다른 주제', introduction: '공통 실행기 시험', routes: [{
    id: 'start', label: '첫 상황', contentIds: ['content.example'], actions: [{contentId: 'content.example', index: 0,
      expectedText: '기존 자료를 준비합니다.', requires: [{scenarioId: 'scenario.example', answer: 'no'}]}],
  }]};
  const result = buildProblemJourney(definition, [entry], {'content.example': {scenarios: [scenario], sources: []}});
  assert.equal(journeyActionState(result.routes[0].actions[0].requires, {'scenario.example': 'no'}), 'ready');
  assert.equal(journeyActionState(result.routes[0].actions[0].requires, {'scenario.example': 'yes'}), 'excluded');
  assert.match(buildJourneySummary(result, 'start', {'scenario.example': 'unknown'}, []), /확인하지 못함/);
});
