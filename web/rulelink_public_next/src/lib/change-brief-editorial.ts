// Scope the public correction to this topic and exact reviewed sentence.
export function changeBriefTransitionDisplay(slug: string, values: string[]): string[] {
  if (slug !== 'platform-c2c-seller-verification-2026') return values;
  return values.map(value => value === '상속개시일·신청일·거래일 등 사건 기준일과 부칙 대조'
    ? '거래 시점과 분쟁 관련 요청 시점을 정리하고, 개정법 부칙의 적용 여부를 확인합니다.'
    : value);
}
