import {LegalConceptText} from '@/components/legal-concept-text';

import type {AuthorityAnchorView} from '@/lib/authority-reading';
import type {PublicConceptCard} from '@/types/publication';

import styles from './authority-reading-section.module.css';

export function AuthorityClauseTree({
  anchors,
  concepts,
}: {
  anchors: AuthorityAnchorView[];
  concepts: PublicConceptCard[];
}) {
  const childrenByParent = new Map<string, AuthorityAnchorView[]>();
  for (const anchor of anchors) {
    const key = anchor.parentAnchorId ?? '';
    const children = childrenByParent.get(key) ?? [];
    children.push(anchor);
    childrenByParent.set(key, children);
  }
  return (
    <ol aria-label="법령 원문 항·호·목 구조" className={styles.clauseTree}>
      {(childrenByParent.get('') ?? []).map(anchor => (
        <AuthorityClauseNode
          anchor={anchor}
          childrenByParent={childrenByParent}
          concepts={concepts}
          key={anchor.anchorId}
        />
      ))}
    </ol>
  );
}

function AuthorityClauseNode({
  anchor,
  childrenByParent,
  concepts,
}: {
  anchor: AuthorityAnchorView;
  childrenByParent: Map<string, AuthorityAnchorView[]>;
  concepts: PublicConceptCard[];
}) {
  const children = childrenByParent.get(anchor.anchorId) ?? [];
  return (
    <li>
      <details className={styles.clauseDisclosure} id={anchor.detailsId}>
        <summary>
          <span>{unitKindLabel(anchor.unitKind)}</span>
          <strong>{anchor.plainHeadingKo}</strong>
        </summary>
        <div
          className={styles.clauseTarget}
          data-authority-clause-target
          data-bound={anchor.isBound ? 'true' : undefined}
          id={anchor.domId}
          tabIndex={-1}
        >
          <p className={styles.plainExplanation}>
            <span>쉬운 설명</span>
            <LegalConceptText concepts={concepts} text={anchor.explanationKo} />
          </p>
          <blockquote className={styles.officialQuote}>
            <span>법령 원문</span>
            {anchor.officialTextKo}
          </blockquote>
        </div>
        {children.length ? (
          <ol>
            {children.map(child => (
              <AuthorityClauseNode
                anchor={child}
                childrenByParent={childrenByParent}
                concepts={concepts}
                key={child.anchorId}
              />
            ))}
          </ol>
        ) : null}
      </details>
    </li>
  );
}

function unitKindLabel(kind: AuthorityAnchorView['unitKind']): string {
  return {
    article: '조',
    paragraph: '항',
    item: '호',
    subitem: '목',
  }[kind];
}
