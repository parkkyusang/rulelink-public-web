'use client';

import {useEffect, useRef, useState} from 'react';

type Props = {
  targetId: string;
};

export function OfficialSourceJump({targetId}: Props) {
  const timeoutRef = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  function showSources() {
    const target = document.getElementById(targetId);
    if (!target) return;

    const isMobile = window.matchMedia('(max-width: 800px)').matches;
    if (isMobile) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block: 'start'});
      setAnnouncement('공식 근거 구역으로 이동했습니다.');
      return;
    }

    target.classList.remove('sourceAttention');
    void target.getBoundingClientRect();
    target.classList.add('sourceAttention');
    setAnnouncement('오른쪽 공식 근거를 강조했습니다.');

    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      target.classList.remove('sourceAttention');
    }, 1800);
  }

  return (
    <>
      <button aria-controls={targetId} onClick={showSources} type="button">공식 근거</button>
      <span aria-live="polite" className="srOnly">{announcement}</span>
    </>
  );
}
