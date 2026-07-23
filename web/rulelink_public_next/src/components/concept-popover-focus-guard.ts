export type ConceptPopoverOpenReason = string | undefined;

export type ConceptPopoverFocusRestoreGuard = {
  arm: () => void;
  release: () => void;
  shouldIgnoreOpen: (reason: ConceptPopoverOpenReason) => boolean;
};

export function createConceptPopoverFocusRestoreGuard(): ConceptPopoverFocusRestoreGuard {
  let awaitingRestoredFocus = false;

  return {
    arm() {
      awaitingRestoredFocus = true;
    },
    release() {
      awaitingRestoredFocus = false;
    },
    shouldIgnoreOpen(reason) {
      if (!awaitingRestoredFocus || reason !== 'focus') return false;
      awaitingRestoredFocus = false;
      return true;
    },
  };
}
