import type {LegalChangeBrief} from '@/types/publication';

export function changeLifecycleLabel(lifecycle: LegalChangeBrief['lifecycle']): string {
  if (lifecycle === 'future_effective') return '시행 예정';
  if (lifecycle === 'recently_effective') return '최근 시행';
  return '현행 제도';
}

export function changeLifecycleOrder(lifecycle: LegalChangeBrief['lifecycle']): number {
  if (lifecycle === 'future_effective') return 0;
  if (lifecycle === 'recently_effective') return 1;
  return 2;
}
