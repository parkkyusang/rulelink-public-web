'use client';

import {useEffect} from 'react';

export function ScenarioHandoffFocus() {
  useEffect(() => {
    const fragment = decodeURIComponent(window.location.hash.slice(1));
    if (!fragment.startsWith('scenario-')) return;
    const target = document.getElementById(fragment);
    if (!target) return;
    target.focus({preventScroll: true});
    target.scrollIntoView({behavior: 'auto', block: 'center'});
  }, []);
  return null;
}
