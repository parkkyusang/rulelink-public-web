import type {PublicKnowledgeEntry} from '@/types/publication';

const labels: Record<PublicKnowledgeEntry['content_type'], string> = {
  law_change: '법령 변경',
  doctrine_explainer: '법리 해설',
  fact_branch: '사실 분기',
  precedent_doctrine: '판례 법리',
  similar_case_comparison: '유사사례 비교',
  misconception_correction: '오해 바로잡기',
  procedure_evidence: '절차와 증거',
  recurring_issue_generalization: '반복 쟁점',
};

export function knowledgeContentTypeLabel(type: PublicKnowledgeEntry['content_type']): string {
  return labels[type];
}
