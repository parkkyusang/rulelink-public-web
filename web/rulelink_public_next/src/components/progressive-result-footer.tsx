import styles from './progressive-result-footer.module.css';

type Props = {
  controlsId: string;
  description: string;
  hiddenCount: number;
  label: string;
  onLoadMore: () => void;
};

export function ProgressiveResultFooter({controlsId, description, hiddenCount, label, onLoadMore}: Props) {
  if (hiddenCount <= 0) return null;
  return (
    <div className={styles.footer}>
      <button aria-controls={controlsId} onClick={onLoadMore} type="button">
        {label} <span>({hiddenCount}개 남음)</span>
      </button>
      <p>{description}</p>
    </div>
  );
}
