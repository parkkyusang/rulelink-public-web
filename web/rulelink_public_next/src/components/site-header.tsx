'use client';

import {useEffect, useRef, useState, type ReactNode} from 'react';

import styles from './site-header.module.css';

type Props = {
  hasConcepts: boolean;
  preview: boolean;
  siteName: string;
};

export function SiteHeader({hasConcepts, preview, siteName}: Props) {
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
    };
  }, [menuOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 801px)');
    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) setMenuOpen(false);
    }
    desktopQuery.addEventListener('change', closeOnDesktop);
    return () => desktopQuery.removeEventListener('change', closeOnDesktop);
  }, []);

  const menuId = 'site-mobile-menu';
  return (
    <header className={styles.header} ref={headerRef}>
      <div className={styles.headerRow}>
        <a className={styles.brand} href="/">{siteName}</a>

        <nav aria-label="주요 메뉴" className={styles.desktopNav}>
          <NavigationLinks hasConcepts={hasConcepts} includeSearch preview={preview} />
        </nav>

        <div className={styles.mobileActions}>
          <a aria-label="전체에서 찾기" className={styles.mobileAction} href="/ko/search">
            <SearchIcon />
            <span>검색</span>
          </a>
          <button
            aria-controls={menuId}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? '주요 메뉴 닫기' : '주요 메뉴 열기'}
            className={styles.mobileAction}
            onClick={() => setMenuOpen(current => !current)}
            ref={menuButtonRef}
            type="button"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
            <span>메뉴</span>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav aria-label="모바일 주요 메뉴" className={styles.mobilePanel} id={menuId}>
          <NavigationLinks hasConcepts={hasConcepts} preview={preview} />
        </nav>
      ) : null}
    </header>
  );
}

function NavigationLinks({hasConcepts, includeSearch = false, preview}: {
  hasConcepts: boolean;
  includeSearch?: boolean;
  preview: boolean;
}) {
  return (
    <>
      {preview ? <a href="/editorial">편집 운영</a> : null}
      {includeSearch ? <a href="/ko/search">전체에서 찾기</a> : null}
      {hasConcepts ? <a href="/ko/concepts">법률용어</a> : null}
      <a href="/ko/knowledge">상황별 지식</a>
      <a href="/ko/sources">공식 근거</a>
      <a href="/ko/method">콘텐츠 원칙</a>
    </>
  );
}

function SearchIcon() {
  return <Icon><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></Icon>;
}

function MenuIcon() {
  return <Icon><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
}

function CloseIcon() {
  return <Icon><path d="m6 6 12 12M18 6 6 18" /></Icon>;
}

function Icon({children}: {children: ReactNode}) {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.8">{children}</g>
    </svg>
  );
}
