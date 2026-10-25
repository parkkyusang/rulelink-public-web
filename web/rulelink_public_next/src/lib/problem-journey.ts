import type {PublicKnowledgeEntry, PublicScenarioBranch} from '../types/publication.ts';

export type JourneyAnswer = 'yes' | 'no' | 'unknown';
export type JourneyAnswers = Record<string, JourneyAnswer>;
export type JourneyCondition = {scenarioId: string; answer: 'yes' | 'no'};
export type JourneyDefinition = {
  hubId: string;
  title: string;
  introduction: string;
  routes: {
    id: string;
    label: string;
    contentIds: string[];
    referenceContentIds?: string[];
    actions?: {contentId: string; index: number; expectedText: string; requires?: JourneyCondition[]}[];
  }[];
};
export type ProblemJourney = {
  origin?: string;
  title: string;
  introduction: string;
  routes: {
    id: string;
    label: string;
    questions: PublicScenarioBranch[];
    readings: {id: string; title: string; href: string; caution: string}[];
    actions: {id: string; text: string; href: string; requires: JourneyCondition[]}[];
    facts: string[];
    sources: {id: string; title: string; text?: string; href: string; checkedAt: string; effectiveDate?: string; readingTitle?: string; readingHref?: string; explanations?: {title: string; text: string}[]}[];
  }[];
};

/** 새 법률판단을 생성하지 않고 출판된 질문·행동을 연결합니다. */
export function buildProblemJourney(
  definition: JourneyDefinition,
  entries: readonly PublicKnowledgeEntry[],
  details: Readonly<Record<string, {
    scenarios: readonly PublicScenarioBranch[];
    sources: ProblemJourney['routes'][number]['sources'];
  }>>,
): ProblemJourney {
  const byId = new Map(entries.map(entry => [entry.content_id, entry]));
  const routeIds = new Set<string>();
  return {
    title: definition.title,
    introduction: definition.introduction,
    routes: definition.routes.map(route => {
      if (routeIds.has(route.id)) throw new Error(`중복 상황: ${route.id}`);
      routeIds.add(route.id);
      const selected = route.contentIds.map(id => {
        const entry = byId.get(id);
        if (!entry || !details[id]) throw new Error(`안내 연결 누락: ${id}`);
        return entry;
      });
      const references = (route.referenceContentIds ?? []).map(id => {
        const entry = byId.get(id);
        if (!entry || !details[id]) throw new Error(`참고 안내 연결 누락: ${id}`);
        return entry;
      });
      const contentIds = [...route.contentIds, ...(route.referenceContentIds ?? [])];
      if (new Set(contentIds).size !== contentIds.length) throw new Error(`중복 안내 연결: ${route.id}`);
      const questions = uniqueBy(selected.flatMap(entry => details[entry.content_id].scenarios), x => x.scenario_id);
      const questionIds = new Set(questions.map(x => x.scenario_id));
      const actionRefs = route.actions ?? selected.flatMap(entry => entry.action_steps_ko.map((text, index) => ({
        contentId: entry.content_id, index, expectedText: text, requires: [] as JourneyCondition[],
      })));
      const actions = actionRefs.map(ref => {
        const entry = selected.find(x => x.content_id === ref.contentId);
        if (!entry || entry.action_steps_ko[ref.index] !== ref.expectedText) {
          throw new Error(`행동 원문 변경: ${ref.contentId}/${ref.index}`);
        }
        for (const condition of ref.requires ?? []) {
          if (!questionIds.has(condition.scenarioId)) throw new Error(`행동 조건 누락: ${condition.scenarioId}`);
        }
        if (new Set((ref.requires ?? []).map(c => c.scenarioId)).size !== (ref.requires ?? []).length) {
          throw new Error(`행동 조건 중복: ${ref.contentId}/${ref.index}`);
        }
        return {id: `${ref.contentId}:${ref.index}`, text: ref.expectedText,
          href: `/ko/knowledge/${entry.slug}#actions`, requires: ref.requires ?? []};
      });
      if (new Set(actions.map(action => action.id)).size !== actions.length) throw new Error(`중복 행동: ${route.id}`);
      const textConditions = new Map<string, string>();
      for (const action of actions) {
        const signature = JSON.stringify(action.requires);
        if (textConditions.has(action.text) && textConditions.get(action.text) !== signature) throw new Error(`같은 행동의 조건 충돌: ${route.id}`);
        textConditions.set(action.text, signature);
      }
      return {
        id: route.id, label: route.label, questions,
        readings: [...selected, ...references].map(entry => ({id: entry.content_id, title: entry.title_ko,
          href: `/ko/knowledge/${entry.slug}`, caution: entry.caution_ko})),
        facts: [...new Set(selected.flatMap(entry => entry.facts_to_check_ko))],
        actions: uniqueBy(actions, x => x.text),
        sources: uniqueBy([
          ...selected.flatMap(entry => details[entry.content_id].sources),
          ...references.flatMap(entry => details[entry.content_id].sources.map(source => ({...source,
            readingTitle: entry.title_ko, readingHref: `/ko/knowledge/${entry.slug}`}))),
        ], x => x.id),
      };
    }),
  };
}

export function journeyActionState(requires: readonly JourneyCondition[], answers: JourneyAnswers): 'ready' | 'pending' | 'excluded' {
  if (requires.some(c => answers[c.scenarioId] && answers[c.scenarioId] !== 'unknown' && answers[c.scenarioId] !== c.answer)) return 'excluded';
  return requires.every(c => answers[c.scenarioId] === c.answer) ? 'ready' : 'pending';
}

export function buildJourneySummary(journey: ProblemJourney, routeId: string, answers: JourneyAnswers, checked: readonly string[]): string {
  const route = journey.routes.find(x => x.id === routeId);
  if (!route) throw new Error('선택한 상황이 없습니다');
  const lines = [journey.title, `선택한 상황: ${route.label}`,
    '이 요약은 일반 법률정보를 확인하기 위한 메모이며 개인 사건의 법률판단이 아닙니다.', journey.introduction, '', '확인한 사실과 모르는 사실'];
  for (const question of route.questions) {
    const answer = answers[question.scenario_id];
    lines.push(`- ${question.question_ko}: ${answer === 'yes' ? '예 (사용자 선택)' : answer === 'no' ? '아니오 (사용자 선택)' : '확인하지 못함'}`);
    if (answer === 'yes' || answer === 'no') lines.push(`  일반 안내: ${answer === 'yes' ? question.when_true_ko : question.when_false_ko}`);
  }
  lines.push('', '다음 행동');
  for (const action of route.actions) {
    const state = journeyActionState(action.requires, answers);
    if (state !== 'excluded') lines.push(`- [${state === 'ready' && checked.includes(action.id) ? '확인함' : '미확인'}${state === 'pending' ? ' · 조건 확인 후' : ''}] ${action.text}`);
  }
  lines.push('', '확인할 자료·시점', ...route.facts.map(fact => `- ${fact}`), '', '주의할 점', ...route.readings.map(x => `- ${x.caution}`), '', '공식 근거');
  for (const source of route.sources) lines.push(`- ${source.title} (원문 확인: ${source.checkedAt.slice(0, 10)})\n  ${source.href}`);
  lines.push('', '관련 안내', ...route.readings.map(x => `- ${x.title}: ${journey.origin ? new URL(x.href, journey.origin).href : x.href}`), '',
    '추가로 검토받을 내용: 위 미확인 사실, 계약·통지·등기 등 원자료, 사건별 권리 상태와 실행 순서를 확인해 주세요.');
  return lines.join('\n');
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter(value => {const id = key(value); if (seen.has(id)) return false; seen.add(id); return true;});
}
