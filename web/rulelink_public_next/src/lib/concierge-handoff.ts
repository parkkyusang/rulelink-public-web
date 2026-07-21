export type ConciergeReviewDraftInput = {
  actionSteps: string[];
  checkedActionIndexes: number[];
  checkedFactIndexes: number[];
  decisionFacts: string[];
  factsToCheck: string[];
  question: string;
  reviewedAt: string;
  sourceUrl: string;
  title: string;
};

const CONCIERGE_HOST = 'liale-review.lolphysical.xyz';

export function buildConciergeNewMatterUrl(href: string): string {
  const url = new URL(href);
  if (url.protocol !== 'https:' || url.hostname !== CONCIERGE_HOST) {
    throw new Error('허용되지 않은 컨시어지 주소입니다.');
  }
  url.searchParams.set('new', '1');
  url.hash = '';
  return url.toString();
}

export function buildConciergeReviewDraft(input: ConciergeReviewDraftInput): string {
  const checkedFacts = selectIndexes(input.factsToCheck, input.checkedFactIndexes);
  const checkedActions = selectIndexes(input.actionSteps, input.checkedActionIndexes);
  const checkedFactSet = new Set(checkedFacts);
  const remainingFacts = input.factsToCheck.filter(item => !checkedFactSet.has(item));
  const decisionFacts = unique(input.decisionFacts);

  return [
    'RuleLink 공개 안내에서 이어서 검토를 요청합니다.',
    '',
    '참고한 안내',
    '- 제목: ' + input.title.trim(),
    '- 공개 주소: ' + input.sourceUrl.trim(),
    '- 기준 확인일: ' + input.reviewedAt.slice(0, 10),
    '',
    '검토하고 싶은 질문',
    input.question.trim(),
    '',
    '결론을 가르는 사실 - 각 항목 뒤에 구체적인 내용을 입력해 주세요.',
    ...listOrFallback(decisionFacts.map(item => item + ': [내용 입력]')),
    '',
    '현재 준비하거나 확인했다고 표시한 사실',
    ...listOrFallback(checkedFacts),
    '',
    '아직 확인 표시하지 않은 사실',
    ...listOrFallback(remainingFacts),
    '',
    '현재 완료했다고 표시한 행동',
    ...listOrFallback(checkedActions),
    '',
    '추가 사실관계',
    '- [여기에 사건 경위, 날짜, 상대방, 보유 자료를 적어 주세요.]',
  ].join('\n');
}

function selectIndexes(values: string[], indexes: number[]): string[] {
  const allowed = new Set(indexes.filter(index => Number.isInteger(index) && index >= 0 && index < values.length));
  return values.filter((_, index) => allowed.has(index));
}

function listOrFallback(values: string[]): string[] {
  return values.length ? values.map(value => '- ' + value) : ['- 아직 표시한 항목 없음'];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
