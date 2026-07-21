'use client';

import {useEffect, useMemo, useState} from 'react';

import styles from './knowledge-action-workspace.module.css';

type Props = {
  actionSteps: string[];
  contentId: string;
  factsToCheck: string[];
  revisionKey: string;
};

type CheckState = Record<string, true>;

export function KnowledgeActionWorkspace({actionSteps, contentId, factsToCheck, revisionKey}: Props) {
  const storageKey = useMemo(
    () => ['rulelink-checklist-v1', contentId, revisionKey].join(':'),
    [contentId, revisionKey],
  );
  const [checked, setChecked] = useState<CheckState>({});
  const [loadedKey, setLoadedKey] = useState('');
  const validKeys = useMemo(() => new Set([
    ...factsToCheck.map((_, index) => 'fact:' + index),
    ...actionSteps.map((_, index) => 'action:' + index),
  ]), [actionSteps, factsToCheck]);
  const total = validKeys.size;
  const completed = Object.keys(checked).filter(key => validKeys.has(key)).length;
  const progress = total ? Math.round((completed / total) * 100) : 0;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) as unknown : {};
      setChecked(isCheckState(parsed) ? parsed : {});
    } catch {
      setChecked({});
    } finally {
      setLoadedKey(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      if (Object.keys(checked).length) {
        window.localStorage.setItem(storageKey, JSON.stringify(checked));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // 저장소가 차단된 환경에서도 체크 기능 자체는 유지합니다.
    }
  }, [checked, loadedKey, storageKey]);

  function toggle(key: string, selected: boolean) {
    setChecked(current => {
      const next = {...current};
      if (selected) next[key] = true;
      else delete next[key];
      return next;
    });
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>내 확인 목록</p>
          <h3>확인한 사실과 준비한 행동을 표시하세요.</h3>
          <p>기준일이 달라진 콘텐츠에는 이전 표시를 이어 쓰지 않습니다.</p>
        </div>
        <div className={styles.progressSummary}>
          <strong>{completed}<span> / {total}</span></strong>
          <small>확인 완료</small>
        </div>
      </header>

      <div
        aria-label={'확인 목록 진행률 ' + progress + '%'}
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={completed}
        className={styles.progressTrack}
        role="progressbar"
      >
        <span style={{width: String(progress) + '%'}} />
      </div>
      <p aria-live="polite" className={styles.progressText}>{progress}% 진행했습니다.</p>

      <div className={styles.columns}>
        <ChecklistGroup
          checked={checked}
          group="fact"
          items={factsToCheck}
          onToggle={toggle}
          title="확인하고 보관할 사실"
        />
        <ChecklistGroup
          checked={checked}
          group="action"
          items={actionSteps}
          onToggle={toggle}
          title="행동 순서"
        />
      </div>

      <footer className={styles.footer}>
        <p className={styles.privacy}>표시 상태는 서버로 전송되지 않고 현재 기기에만 저장됩니다.</p>
        <div className={styles.actions}>
          <button disabled={completed === 0} onClick={() => setChecked({})} type="button">표시 초기화</button>
          <button onClick={() => window.print()} type="button">인쇄·PDF 저장</button>
        </div>
      </footer>
    </div>
  );
}

function ChecklistGroup({
  checked,
  group,
  items,
  onToggle,
  title,
}: {
  checked: CheckState;
  group: 'fact' | 'action';
  items: string[];
  onToggle: (key: string, selected: boolean) => void;
  title: string;
}) {
  return (
    <section className={styles.group}>
      <h4>{title}</h4>
      <div className={styles.items}>
        {items.map((item, index) => {
          const key = group + ':' + index;
          const inputId = 'rulelink-check-' + group + '-' + index;
          const className = [styles.item, checked[key] ? styles.checked : ''].filter(Boolean).join(' ');
          return (
            <label className={className} htmlFor={inputId} key={key}>
              <input
                checked={Boolean(checked[key])}
                id={inputId}
                onChange={event => onToggle(key, event.target.checked)}
                type="checkbox"
              />
              <span aria-hidden="true" className={styles.marker}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.text}>{item}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function isCheckState(value: unknown): value is CheckState {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(item => item === true);
}
