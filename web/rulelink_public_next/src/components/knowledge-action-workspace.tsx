'use client';

import {useEffect, useMemo, useState} from 'react';

import {buildConciergeNewMatterUrl, buildConciergeReviewDraft} from '@/lib/concierge-handoff';

import styles from './knowledge-action-workspace.module.css';

type Props = {
  actionSteps: string[];
  conciergeEntry?: {
    question_ko: string;
    decision_facts_ko: string[];
    href: string;
  };
  contentId: string;
  contentTitle: string;
  factsToCheck: string[];
  revisionKey: string;
};

type CheckState = Record<string, true>;

export function KnowledgeActionWorkspace({
  actionSteps,
  conciergeEntry,
  contentId,
  contentTitle,
  factsToCheck,
  revisionKey,
}: Props) {
  const storageKey = useMemo(
    () => ['rulelink-checklist-v1', contentId, revisionKey].join(':'),
    [contentId, revisionKey],
  );
  const [checked, setChecked] = useState<CheckState>({});
  const [copyStatus, setCopyStatus] = useState('');
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

  async function copyConciergeDraft() {
    if (!conciergeEntry) return;
    const draft = buildConciergeReviewDraft({
      actionSteps,
      checkedActionIndexes: checkedIndexes(checked, 'action', actionSteps.length),
      checkedFactIndexes: checkedIndexes(checked, 'fact', factsToCheck.length),
      decisionFacts: conciergeEntry.decision_facts_ko,
      factsToCheck,
      question: conciergeEntry.question_ko,
      reviewedAt: revisionKey,
      sourceUrl: window.location.origin + window.location.pathname,
      title: contentTitle,
    });
    try {
      await writeClipboard(draft);
      setCopyStatus('검토요청 초안을 복사했습니다. 새 창의 입력란에 붙여넣으세요.');
    } catch {
      setCopyStatus('자동 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.');
    }
  }

  const conciergeUrl = conciergeEntry ? buildConciergeNewMatterUrl(conciergeEntry.href) : '';

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
        <div className={styles.privacy}>
          <p>표시 상태는 서버로 전송되지 않고 현재 기기에만 저장됩니다.</p>
          {copyStatus ? <p aria-live="polite" className={styles.copyStatus}>{copyStatus}</p> : null}
        </div>
        <div className={styles.actions}>
          <button disabled={completed === 0} onClick={() => setChecked({})} type="button">표시 초기화</button>
          <button onClick={() => window.print()} type="button">인쇄·PDF 저장</button>
          {conciergeEntry ? (
            <a
              href={conciergeUrl}
              onClick={() => { void copyConciergeDraft(); }}
              rel="noreferrer"
              target="_blank"
            >
              초안 복사 후 새 사건 열기 <span aria-hidden="true">↗</span>
            </a>
          ) : null}
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

function checkedIndexes(checked: CheckState, group: 'fact' | 'action', length: number): number[] {
  return Array.from({length}, (_, index) => index).filter(index => checked[group + ':' + index]);
}

async function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('clipboard_copy_failed');
}

function isCheckState(value: unknown): value is CheckState {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(item => item === true);
}
