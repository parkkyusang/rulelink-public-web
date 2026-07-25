export const publicAdvertisingPlacements = {
  'knowledge-after-sources-and-authority': {
    description:
      '확인자료·공식 근거·조문 읽기를 모두 마친 뒤 분리해 표시합니다.',
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
