'use client';

import {useEffect} from 'react';

import {decodeAuthorityFragment} from '@/lib/authority-fragment';

export function AuthorityFragmentController() {
  useEffect(() => {
    let frame = 0;
    const revealCurrentFragment = () => {
      const targetId = decodeAuthorityFragment(window.location.hash);
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target || !target.closest('[data-authority-reading-root]')) return;
      const details: HTMLDetailsElement[] = [];
      let parent = target.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) details.push(parent);
        parent = parent.parentElement;
      }
      for (const disclosure of details.reverse()) disclosure.open = true;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        target.focus({preventScroll: true});
        target.scrollIntoView({behavior: 'auto', block: 'start'});
      });
    };
    const preserveReturnFragment = (event: MouseEvent) => {
      const element = event.target;
      if (!(element instanceof Element)) return;
      const link = element.closest<HTMLAnchorElement>('[data-authority-official-link]');
      const fragment = link?.dataset.authorityReturnFragment;
      if (!link || !fragment) return;
      const currentTargetId = decodeAuthorityFragment(window.location.hash);
      const currentTarget = currentTargetId
        ? document.getElementById(currentTargetId)
        : null;
      const authorityCard = link.closest('[data-authority-id]');
      if (currentTarget && authorityCard?.contains(currentTarget)) return;
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}#${fragment}`,
      );
    };
    revealCurrentFragment();
    window.addEventListener('hashchange', revealCurrentFragment);
    document.addEventListener('click', preserveReturnFragment);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', revealCurrentFragment);
      document.removeEventListener('click', preserveReturnFragment);
    };
  }, []);

  return null;
}
