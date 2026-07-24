import type {PublicKnowledgeHub} from '@/types/publication';

export type KnowledgeHubTaxonomyCategory = {
  category_id: string;
  title_ko: string;
  description_ko: string;
  hub_ids: readonly string[];
};

export type KnowledgeHubDirectoryCategory = Omit<
  KnowledgeHubTaxonomyCategory,
  'hub_ids'
> & {
  hubs: PublicKnowledgeHub[];
};

export const KNOWLEDGE_HUB_TAXONOMY = [
  {
    category_id: 'housing-property',
    title_ko: '주거·부동산',
    description_ko: '집을 빌리고, 사고, 고치고, 이웃과 조정할 때',
    hub_ids: [
      'hub.housing-lease-deposit',
      'hub.housing-lease-living',
      'hub.commercial-lease',
      'hub.real-estate-sale',
      'hub.neighbor-leak-noise',
    ],
  },
  {
    category_id: 'money-debt-litigation',
    title_ko: '돈·채권·재판',
    description_ko: '빌려준 돈, 보증, 강제집행과 민사재판을 확인할 때',
    hub_ids: [
      'hub.money-guarantee',
      'hub.debt-enforcement',
      'hub.civil-small-claims',
    ],
  },
  {
    category_id: 'work-business',
    title_ko: '일·사업',
    description_ko: '임금, 퇴직, 산재와 직장 내 문제를 겪을 때',
    hub_ids: [
      'hub.labor-wages',
      'hub.employment-exit',
      'hub.industrial-accident',
      'hub.workplace-harassment',
    ],
  },
  {
    category_id: 'family-inheritance-safety',
    title_ko: '가족·상속·안전',
    description_ko: '가족관계, 상속과 일상 안전을 지켜야 할 때',
    hub_ids: [
      'hub.family-inheritance',
      'hub.divorce-parenting',
      'hub.domestic-violence-stalking',
      'hub.school-violence',
    ],
  },
  {
    category_id: 'accident-crime-victim',
    title_ko: '사고·범죄피해',
    description_ko: '사고 책임, 보험과 범죄피해 회복 경로를 찾을 때',
    hub_ids: [
      'hub.shared-mobility-accident',
      'hub.everyday-damages',
      'hub.auto-accident-insurance',
      'hub.crime-victim-response',
      'hub.voice-phishing-refund',
    ],
  },
  {
    category_id: 'consumer-administration',
    title_ko: '소비·행정',
    description_ko: '구매·구독 분쟁이나 행정처분에 대응할 때',
    hub_ids: [
      'hub.consumer-online-contracts',
      'hub.administrative-appeals',
    ],
  },
  {
    category_id: 'legal-navigation',
    title_ko: '법률 길잡이',
    description_ko: '헷갈리는 개념, 절차, 기한과 전문가 경계를 비교할 때',
    hub_ids: [
      'hub.legal-concept-comparisons',
      'hub.legal-concept-comparisons-02',
      'hub.remedy-path-comparisons',
      'hub.deadline-and-timing-comparisons',
      'hub.legal-service-boundaries',
    ],
  },
] as const satisfies readonly KnowledgeHubTaxonomyCategory[];

export function buildKnowledgeHubDirectoryCategories(
  hubs: readonly PublicKnowledgeHub[],
): KnowledgeHubDirectoryCategory[] {
  const hubById = new Map(hubs.map(hub => [hub.hub_id, hub]));
  if (hubById.size !== hubs.length) {
    throw new Error('상황별 법률 주제에 중복 hub_id가 있습니다.');
  }

  const configuredIds = KNOWLEDGE_HUB_TAXONOMY.flatMap<string>(
    category => [...category.hub_ids],
  );
  const configuredSet = new Set<string>(configuredIds);
  if (configuredSet.size !== configuredIds.length) {
    throw new Error('상황별 법률 주제 taxonomy에 중복 hub_id가 있습니다.');
  }

  const missing = configuredIds.filter(hubId => !hubById.has(hubId));
  const unclassified = hubs
    .map(hub => hub.hub_id)
    .filter(hubId => !configuredSet.has(hubId));
  if (missing.length || unclassified.length) {
    throw new Error([
      missing.length ? `정본에 없는 매핑: ${missing.join(', ')}` : '',
      unclassified.length ? `분류되지 않은 주제: ${unclassified.join(', ')}` : '',
    ].filter(Boolean).join(' / '));
  }

  return KNOWLEDGE_HUB_TAXONOMY.map(category => ({
    category_id: category.category_id,
    title_ko: category.title_ko,
    description_ko: category.description_ko,
    hubs: category.hub_ids.map(hubId => hubById.get(hubId)!),
  }));
}
