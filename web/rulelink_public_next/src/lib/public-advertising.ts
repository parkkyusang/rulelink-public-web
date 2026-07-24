export const publicAdvertisingPlacements = {
  'knowledge-after-actions': {
    description:
      '확인자료와 다음 행동을 모두 읽은 뒤, 공식 근거 영역과 분리해 표시합니다.',
    label: '광고',
  },
  'knowledge-after-related-reading': {
    description:
      '관련 지식 탐색이 끝난 페이지 하단에서만 표시합니다.',
    label: '광고',
  },
} as const;

export type PublicAdvertisingPlacement =
  keyof typeof publicAdvertisingPlacements;
