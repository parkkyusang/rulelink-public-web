export function formatKoreanLegalDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${Number(year)}년 ${Number(month)}월 ${Number(day)}일 시행`;
}
