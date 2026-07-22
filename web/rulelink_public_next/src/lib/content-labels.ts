import contentTypeContract from '@/lib/knowledge-content-types.json';
import type {PublicKnowledgeContentType} from '@/types/publication';

const canonicalLabels = contentTypeContract.canonical as Record<PublicKnowledgeContentType, string>;
const aliases = contentTypeContract.aliases as Record<string, PublicKnowledgeContentType>;

export function normalizeKnowledgeContentType(type: string): PublicKnowledgeContentType | null {
  if (Object.hasOwn(canonicalLabels, type)) return type as PublicKnowledgeContentType;
  return aliases[type] ?? null;
}

export function knowledgeContentTypeLabel(type: string): string {
  const normalized = normalizeKnowledgeContentType(type);
  return normalized ? canonicalLabels[normalized] : contentTypeContract.fallback_label_ko;
}
