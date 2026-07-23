import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {buildKnowledgeReadingPath} from '../src/lib/knowledge-relations.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..');

function entry(contentId, title = contentId) {
  return {
    content_id: contentId,
    slug: contentId.replaceAll('.', '-'),
    title_ko: title,
    one_line_answer_ko: `${title}의 핵심 기준을 설명합니다.`,
    related_content_ids: [],
  };
}

test('타입 연결 8종을 독해 순서 7구획으로 묶고 이유와 다음 행동을 보존한다', () => {
  const source = {
    ...entry('content.source', '현재 읽는 글'),
    related_edges: [
      {target_kind: 'content', target_id: 'content.prerequisite', relation_type: 'prerequisite', label_ko: '이 글의 전제가 되는 기준입니다.'},
      {target_kind: 'content', target_id: 'content.comparison', relation_type: 'comparison'},
      {target_kind: 'content', target_id: 'content.deadline', relation_type: 'deadline'},
      {target_kind: 'content', target_id: 'content.procedure', relation_type: 'procedure'},
      {target_kind: 'content', target_id: 'content.remedy', relation_type: 'remedy'},
      {target_kind: 'content', target_id: 'content.law-change', relation_type: 'law_change'},
      {target_kind: 'concept', target_id: 'concept.foundation', relation_type: 'concept'},
      {target_kind: 'content', target_id: 'content.boundary', relation_type: 'concierge_boundary'},
    ],
  };
  const targetIds = source.related_edges.filter(edge => edge.target_kind === 'content').map(edge => edge.target_id);
  const entries = [source, ...targetIds.map(contentId => entry(contentId)), entry('content.same-topic')];
  const concepts = [{
    concept_id: 'concept.foundation',
    slug: 'foundation',
    preferred_term_ko: '기초 법률개념',
    plain_definition_ko: '현재 기준을 이해하기 전에 알아야 하는 뜻입니다.',
  }];

  const sections = buildKnowledgeReadingPath(source, entries, concepts, ['content.source', 'content.same-topic']);
  assert.deepEqual(sections.map(section => section.key), [
    'foundation',
    'comparison',
    'deadline',
    'procedure',
    'remedy',
    'law_change',
    'concierge_boundary',
    'same_topic',
  ]);
  assert.equal(sections[0].items.length, 2);
  assert.equal(sections[0].items[0].reason_ko, '이 글의 전제가 되는 기준입니다.');
  assert.equal(sections[0].items[1].href, '/ko/concepts/foundation');
  assert.ok(sections.slice(0, -1).every(section => section.typed));
  assert.equal(sections.at(-1).typed, false);
  assert.equal(sections.find(section => section.key === 'concierge_boundary').items[0].action_ko, '왜 자격 확인이 필요한가');
  assert.ok(sections.flatMap(section => section.items).every(item => item.reason_ko && item.action_ko));
});

test('concept_ids가 없는 typed concept 간선도 전체 공개 개념 색인에서 링크를 찾는다', async () => {
  const source = {
    ...entry('content.concept-compatibility'),
    related_edges: [{target_kind: 'concept', target_id: 'concept.compatibility', relation_type: 'concept'}],
  };
  assert.equal('concept_ids' in source, false);
  const concepts = [{
    concept_id: 'concept.compatibility',
    slug: 'compatibility-concept',
    preferred_term_ko: '호환 개념',
    plain_definition_ko: '기존 concept_ids 없이 typed edge로만 연결된 공개 개념입니다.',
  }];
  const sections = buildKnowledgeReadingPath(source, [source], concepts, []);
  assert.equal(sections[0].key, 'foundation');
  assert.equal(sections[0].items[0].href, '/ko/concepts/compatibility-concept');

  const publication = await readFile(path.join(appRoot, 'src', 'lib', 'publication.ts'), 'utf8');
  assert.match(publication, /const visibleConcepts = filterFreshPublications\(knowledge\.concept_cards \?\? \[\]\);/u);
  assert.match(publication, /buildKnowledgeReadingPath\(\s*entry,\s*visibleEntries,\s*visibleConcepts,/su);
});

test('무타입 기존 연결과 같은 허브 연결은 의미를 추정하지 않고 같은 주제 구획에만 둔다', () => {
  const source = {...entry('content.legacy'), related_content_ids: ['content.related']};
  const sections = buildKnowledgeReadingPath(
    source,
    [source, entry('content.related'), entry('content.same-hub')],
    [],
    ['content.legacy', 'content.same-hub'],
  );
  assert.deepEqual(sections.map(section => section.key), ['same_topic']);
  assert.equal(sections[0].typed, false);
  assert.deepEqual(sections[0].items.map(item => item.target_id), ['content.related', 'content.same-hub']);
  assert.ok(sections[0].items.every(item => item.reason_ko.includes('구체적인 연결 유형은 아직 분류되지 않았습니다')));
});

test('0개·1개·다수 연결과 긴 한국어 제목을 손실 없이 처리한다', () => {
  const empty = entry('content.empty');
  assert.deepEqual(buildKnowledgeReadingPath(empty, [empty], [], ['content.empty']), []);

  const single = {
    ...entry('content.single'),
    related_edges: [{target_kind: 'content', target_id: 'content.deadline', relation_type: 'deadline'}],
  };
  const singleSections = buildKnowledgeReadingPath(single, [single, entry('content.deadline')], [], []);
  assert.equal(singleSections.length, 1);
  assert.equal(singleSections[0].items.length, 1);

  const longTitle = '계약갱신요구권행사기간과묵시적갱신의관계를아주긴한국어제목에서도생략하지않고끝까지표시하는기준';
  const many = {...entry('content.many'), related_content_ids: ['content.long', 'content.extra']};
  const manySections = buildKnowledgeReadingPath(many, [many, entry('content.long', longTitle), entry('content.extra')], [], []);
  assert.equal(manySections[0].items[0].title_ko, longTitle);
  assert.equal(manySections[0].items.length, 2);
});

test('운영 022 표본 5건은 기존 연결을 모두 같은 주제 참고로만 표시한다', async () => {
  const bundle = JSON.parse(await readFile(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8'));
  const knowledge = bundle.knowledge;
  const sampleSlugs = [
    'compensation-order-eligible-damages',
    'legal-heir-order-and-spouse',
    'partial-repayment-allocation',
    'housing-lease-opposability-basics',
    'free-service-and-ad-revenue',
  ];
  for (const slug of sampleSlugs) {
    const current = knowledge.content_entries.find(candidate => candidate.slug === slug);
    assert.ok(current, `${slug} 표본이 있어야 합니다.`);
    const sameHubIds = knowledge.topic_hubs
      .filter(hub => current.hub_ids.includes(hub.hub_id))
      .flatMap(hub => hub.content_ids);
    const sections = buildKnowledgeReadingPath(current, knowledge.content_entries, knowledge.concept_cards ?? [], sameHubIds);
    assert.ok(sections.length > 0, `${slug}에 다음 읽기 경로가 있어야 합니다.`);
    assert.ok(sections.every(section => section.key === 'same_topic' && !section.typed), `${slug}의 무타입 연결 의미를 추정하면 안 됩니다.`);
  }
});

test('컴포넌트는 현재 위치·연결 이유·전문가 경계와 모바일 무잘림 계약을 갖는다', async () => {
  const [component, css] = await Promise.all([
    readFile(path.join(appRoot, 'src', 'components', 'knowledge-reading-path.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src', 'components', 'knowledge-reading-path.module.css'), 'utf8'),
  ]);
  assert.match(component, /현재 읽는 글/u);
  assert.match(component, /왜 연결되나요\?/u);
  assert.match(component, /공개 법률정보는 누구나 이용할 수 있습니다/u);
  assert.match(component, /사건별 컨시어지는 자격이 확인된 변호사만 이용할 수 있습니다/u);
  assert.doesNotMatch(component, /내 자료 정리하기|변호사 직접계약 전 확인사항|변호사 연결|계약 체크리스트/u);
  assert.match(component, /<ul className=\{styles\.grid\}>/u);
  assert.doesNotMatch(component, /role="listitem"/u);
  assert.doesNotMatch(component, /룰링크에서 결론 받기|AI 변호사에게 묻기|승소 가능성 확인|사건에 맞는 변호사 추천/u);
  assert.match(css, /@media \(max-width: 800px\)[\s\S]*?\.grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/u);
  assert.match(css, /overflow-wrap: anywhere/u);
  assert.match(css, /word-break: keep-all/u);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/u);
  assert.match(css, /\.card:focus-visible/u);
});
