import type {PublicAuthorityTimeState} from '@/types/publication';

import styles from './authority-reading-section.module.css';

export function AuthorityTimeBadge({
  label,
  state,
}: {
  label: string;
  state: PublicAuthorityTimeState;
}) {
  return (
    <span
      aria-label={`조문 시간 상태: ${label}`}
      className={styles.timeBadge}
      data-time-state={state}
    >
      {label}
    </span>
  );
}
