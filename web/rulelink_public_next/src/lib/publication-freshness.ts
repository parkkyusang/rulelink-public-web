export type PublicationReviewWindow = {
  expires_at: string;
};

export function isPublicationFresh(
  value: PublicationReviewWindow,
  now: Date = publicationNow(),
): boolean {
  if (typeof value.expires_at !== 'string' || !value.expires_at.trim()) return false;
  const expiresAt = new Date(value.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

export function publicationNow(): Date {
  const override = process.env.RULELINK_PUBLICATION_NOW;
  if (!override) return new Date();
  const parsed = new Date(override);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
