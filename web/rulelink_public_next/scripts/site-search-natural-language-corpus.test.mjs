import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {changeLifecycleLabel} from '../src/lib/change-lifecycle.ts';
import {
  buildKnowledgeSearchDocuments,
  buildKnowledgeSearchSemanticSupport,
} from '../src/lib/knowledge-search.ts';
import {
  buildSiteSearchDocuments,
  rankSiteSearchDocuments,
  tokenizeSiteSearchQuery,
} from '../src/lib/site-search-discovery.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(await readFile(
  path.resolve(appRoot, '..', '..', 'artifacts/publication/current/bundle.json'),
  'utf8',
));
const scenarioById = new Map(
  bundle.knowledge.scenario_branches.map(
    scenario => [scenario.scenario_id, scenario],
  ),
);
const decisionQuestions = new Map(
  bundle.knowledge.content_entries.flatMap(entry => {
    const questions = entry.scenario_ids.flatMap(scenarioId => {
      const question = scenarioById.get(scenarioId)?.question_ko?.trim();
      return question ? [{question, scenarioId}] : [];
    });
    return questions.length ? [[entry.content_id, questions]] : [];
  }),
);
const documents = buildSiteSearchDocuments(
  bundle.cards,
  bundle.change_briefs,
  buildKnowledgeSearchDocuments(bundle.knowledge),
  bundle.catalog?.topics ?? [],
  {
    changeLifecycle: changeLifecycleLabel,
    knowledgeContentType: value => value || '법률정보',
  },
  decisionQuestions,
  buildKnowledgeSearchSemanticSupport(bundle.knowledge),
);
const now = new Date('2026-07-26T00:00:00+09:00');

const ordinaryLanguageCases = [
  ['집주인이 보증금 안돌려줘요', /보증금|임대인|반환/u],
  ['전세금 못받았는데 어떻게 해야 하나요', /보증금|임차|반환/u],
  ['회사에서 월급을 못받았어요', /임금|급여|월급|지급/u],
  ['퇴직금 안주는데 어떡해요', /퇴직금|임금|지급/u],
  ['갑자기 회사에서 잘렸어요', /해고|고용|근로/u],
  ['직장 상사가 계속 괴롭혀요', /직장|괴롭힘/u],
  ['배우자랑 이혼하고 재산 나누고 싶어요', /이혼|재산분할|배우자/u],
  ['양육비를 계속 안줘요', /양육비|지급/u],
  ['상속받았는데 빚이 더 많으면 어떡하죠', /상속|채무|한정승인|포기/u],
  ['부모님 돌아가시고 상속 포기하려면 어떻게 해요', /상속|포기/u],
  ['교통사고 났는데 보험 처리는 어떻게 하나요', /교통사고|자동차|보험/u],
  ['상대방이 사고 내고 도망갔어요', /사고|도주|뺑소니/u],
  ['중고거래 사기당했는데 돈 돌려받고 싶어요', /사기|피해|환급|반환/u],
  ['보이스피싱 당해서 돈을 보냈어요', /보이스피싱|피해금|환급/u],
  ['온라인 쇼핑 주문 취소하고 환불받고 싶어요', /온라인|전자상거래|환불/u],
  ['층간소음 때문에 잠을 못자겠어요', /층간소음|소음/u],
  ['윗집 누수로 천장이 젖었는데 어떻게 해요', /누수|손해/u],
  ['학교에서 아이가 맞고 왔어요', /학교폭력|폭행|학교/u],
  ['전 애인이 자꾸 찾아오고 연락해요', /스토킹|연락|접촉/u],
  ['빚을 못갚으면 통장이 압류되나요', /채무|압류|집행/u],
  ['돈 빌려줬는데 연락도 안되고 안갚아요', /대여금|채권|변제|지급/u],
  ['계약금을 냈는데 계약 취소할 수 있나요', /계약금|해제|취소/u],
  ['집을 샀는데 하자가 발견됐어요', /매매|하자|손해/u],
  ['산재 신청하려면 뭘 준비해야 하나요', /산재|산업재해|증거/u],
  ['행정처분이 억울한데 어떻게 다투나요', /행정|심판|취소/u],
];

test('고빈도 생활법률 자연어 질의는 실제 의미 필드가 있는 문제해결 글을 찾는다', () => {
  const failures = [];
  for (const [query, expectedMeaning] of ordinaryLanguageCases) {
    const ranked = rankSiteSearchDocuments(documents, {now, query});
    const top = ranked.find(result => result.kind === 'knowledge');
    if (!top || !expectedMeaning.test(searchableText(top))) {
      failures.push({
        query,
        tokenGroups: tokenizeSiteSearchQuery(query),
        resultCount: ranked.length,
        top: ranked.slice(0, 3).map(result => ({
          id: result.id,
          title: result.title,
          reasons: result.matchReasons,
        })),
      });
      continue;
    }
    assert.ok(top.matchReasons.length > 0, `${query}: 표시할 일치 근거가 없습니다.`);
  }
  assert.deepEqual(failures, []);
});

test('정본 검색의도는 일상적인 질문 외피를 붙여도 같은 글을 다시 찾는다', () => {
  for (const entry of bundle.knowledge.content_entries) {
    for (const intent of entry.search_intents_ko) {
      const query = `제가 ${intent} 어떻게 해야 하나요`;
      const result = rankSiteSearchDocuments(documents, {now, query})
        .find(candidate => candidate.id === entry.content_id);
      assert.ok(result, `${entry.content_id}: ${query}`);
      assert.ok(result.matchReasons.some(reason => (
        reason.field === 'search_intent'
        && reason.text_ko === intent
      )), `${entry.content_id}: 검색의도 근거가 표시되지 않았습니다.`);
    }
  }
});

function searchableText(document) {
  return [
    document.title,
    document.summary,
    document.context,
    ...document.evidenceLabels,
    ...Object.values(document.fields).flat(),
  ].join(' ');
}
