'use client';

import {useEffect} from 'react';

export function ScenarioHandoffFocus() {
  useEffect(() => {
    let frame = 0;
    function revealJourneyTarget() {
      const fragment = safeFragment(window.location.hash);
      if (
        !fragment
        || !['scenario-', 'source-summary-', 'packet-'].some(prefix => (
          fragment.startsWith(prefix)
        ))
      ) return;
      const target = document.getElementById(fragment);
      if (!target) return;
      let parent = target.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        target.focus({preventScroll: true});
        target.scrollIntoView({behavior: 'auto', block: 'center'});
      });
    }
    revealJourneyTarget();
    window.addEventListener('hashchange', revealJourneyTarget);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', revealJourneyTarget);
    };
  }, []);
  return null;
}

function safeFragment(hash: string): string | null {
  try {
    return decodeURIComponent(hash.startsWith('#') ? hash.slice(1) : hash);
  } catch {
    return null;
  }
}
