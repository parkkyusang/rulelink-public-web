const DISPLAY_COPY_NOISE = /[\s.…"'“”‘’(),·-]/gu;
const DISPLAY_SENTENCE_ENDING = /(?:이다|입니다|한다|합니다|된다|됩니다)$/u;

export function normalizePublicRuleCopy(value: string): string {
  return value.replace(DISPLAY_COPY_NOISE, '').replace(DISPLAY_SENTENCE_ENDING, '');
}

export function samePublicRuleCopy(left: string, right: string): boolean {
  return normalizePublicRuleCopy(left) === normalizePublicRuleCopy(right);
}

export function shouldShowPublicRuleProposition(proposition: string, legalEffect: string): boolean {
  return !samePublicRuleCopy(proposition, legalEffect);
}
