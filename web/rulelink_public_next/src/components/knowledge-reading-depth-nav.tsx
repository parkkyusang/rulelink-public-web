'use client';

import {useEffect, useState} from 'react';

import styles from './knowledge-reading-depth-nav.module.css';

type Props = {
  hasCasePractice: boolean;
  hasScenarios: boolean;
  hasVerifiedAnswer: boolean;
};

export function KnowledgeReadingDepthNav({
  hasCasePractice,
  hasScenarios,
  hasVerifiedAnswer,
}: Props) {
  const sections = [
    {
      href: hasVerifiedAnswer ? '#quick-answer' : '#summary',
      id: hasVerifiedAnswer ? 'quick-answer' : 'summary',
      label: '빠른 답',
    },
    ...(hasVerifiedAnswer
      ? [{href: '#summary', id: 'summary', label: '답 이해'}]
      : []),
    {
      href: hasScenarios ? '#scenarios' : '#rules',
      id: hasScenarios ? 'scenarios' : 'rules',
      label: '결론 사실',
    },
    {href: '#rules', id: 'rules', label: '적용 결과'},
    {href: '#statute-reading', id: 'statute-reading', label: '근거'},
    {href: '#actions', id: 'actions', label: '증거·기한·행동'},
    ...(hasScenarios
      ? [{href: '#follow-up-questions', id: 'follow-up-questions', label: '추가 질문'}]
      : []),
    ...(hasCasePractice
      ? [{href: '#case-practice', id: 'case-practice', label: '판례·실무'}]
      : []),
  ];
  const [currentSection, setCurrentSection] = useState(sections[0].id);

  useEffect(() => {
    const targets = sections
      .map(section => document.getElementById(section.id))
      .filter((target): target is HTMLElement => Boolean(target));
    if (!targets.length || !('IntersectionObserver' in window)) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
        else visible.delete(entry.target.id);
      }
      const next = [...visible.entries()]
        .sort((left, right) => right[1] - left[1])[0]?.[0];
      if (next) setCurrentSection(next);
    }, {
      rootMargin: '-18% 0px -62% 0px',
      threshold: [0, .1, .3, .6, 1],
    });
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [hasCasePractice, hasScenarios, hasVerifiedAnswer]);

  return (
    <nav
      aria-label="읽기 깊이 선택"
      className={styles.root}
      data-authority-depth-nav
    >
      <span>읽기 깊이</span>
      {sections.map(section => (
        <a
          aria-current={currentSection === section.id ? 'location' : undefined}
          href={section.href}
          key={section.id}
          onClick={() => setCurrentSection(section.id)}
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
