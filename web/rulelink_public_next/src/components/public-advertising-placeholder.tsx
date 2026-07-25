import {
  publicAdvertisingPlacements,
  type PublicAdvertisingPlacement,
} from '@/lib/public-advertising';
import {resolveAdvertisingPlaceholdersEnabled} from '@/lib/public-trust';

import styles from './public-advertising-placeholder.module.css';

export function PublicAdvertisingPlaceholder({
  placement,
}: {
  placement: PublicAdvertisingPlacement;
}) {
  if (!resolveAdvertisingPlaceholdersEnabled()) return null;
  const contract = publicAdvertisingPlacements[placement];
  return (
    <aside
      aria-label={`${contract.label} 영역`}
      className={styles.root}
      data-ad-placeholder
      data-ad-placement={placement}
    >
      <span className={styles.label}>{contract.label}</span>
      <p>
        광고 게재를 준비한 별도 영역입니다. 광고는 법률정보의 설명·공식 근거·
        체크리스트가 아닙니다.
      </p>
    </aside>
  );
}
