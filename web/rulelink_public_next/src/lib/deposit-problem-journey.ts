import type {JourneyDefinition} from './problem-journey.ts';

const ended = {scenarioId: 'scenario.housing-lease-deposit.housing-lease-lease-ended', answer: 'yes' as const};
const unpaid = {scenarioId: 'scenario.housing-lease-deposit.housing-lease-deposit-unpaid', answer: 'yes' as const};
const registered = {scenarioId: 'scenario.housing-lease-deposit.housing-lease-registration-completed-before-move', answer: 'yes' as const};

// 주제별 편집 설정입니다. 범용 실행기는 보증금·조문·콘텐츠 식별자를 알지 못합니다.
// 행동 원문이 바뀌면 조용히 다른 행동을 가리키지 않고 빌드에서 재연결을 요구합니다.
export const depositProblemJourney: JourneyDefinition = {
  hubId: 'hub.housing-lease-deposit',
  title: '보증금 문제, 내 상황에서 다음 행동까지',
  introduction: '지금 겪는 일을 고르고 확인한 사실만 표시하세요. 답에 따라 확인할 안내와 행동 순서를 정리합니다. 계약 종료·등기·경매를 중심으로 다루며, 반환소송·보증기관 청구 등 모든 회수 절차를 망라하지는 않습니다.',
  routes: [
    {
      id: 'move', label: '보증금을 못 받았는데 이사해야 해요',
      contentIds: ['content.move-before-deposit-refund', 'content.lease-registration-application-is-not-completion'],
      referenceContentIds: ['content.lease-registration-application-vs-completion'],
      actions: [
        {contentId: 'content.move-before-deposit-refund', index: 0, expectedText: '계약 종료일과 해지·갱신거절 통지를 정리합니다.'},
        {contentId: 'content.move-before-deposit-refund', index: 1, expectedText: '미반환 보증금 액수와 반환 요구 기록을 확보합니다.'},
        {contentId: 'content.move-before-deposit-refund', index: 2, expectedText: '관할 법원에 임차권등기명령을 신청합니다.', requires: [ended, unpaid]},
        {contentId: 'content.lease-registration-application-is-not-completion', index: 2, expectedText: '등기사항증명서로 임차권등기 기입을 확인합니다.'},
        {contentId: 'content.move-before-deposit-refund', index: 3, expectedText: '등기사항증명서에서 임차권등기 완료를 확인한 뒤 전출·인도 시점을 정합니다.', requires: [ended, unpaid, registered]},
      ],
    },
    {
      id: 'apply', label: '임차권등기 신청을 준비하고 싶어요',
      contentIds: ['content.lease-registration-order-requirements'],
      referenceContentIds: ['content.lease-registration-application-vs-completion'],
    },
    {
      id: 'auction', label: '집이 경매에 넘어갔어요',
      contentIds: ['content.lease-registration-and-distribution-demand', 'content.housing-lease-priority-repayment-basics'],
    },
    {
      id: 'cancel', label: '등기를 먼저 지워야 돈을 준대요',
      contentIds: ['content.cancel-lease-registration-after-refund'],
    },
  ],
};
