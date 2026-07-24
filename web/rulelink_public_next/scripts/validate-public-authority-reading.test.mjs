import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  inspectPublicAuthorityReading,
  validatePublicAuthorityReading,
} from './validate-public-authority-reading.mjs';

const SNAPSHOT = '0123456789abcdef0123456789abcdef';

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sourceUnit({
  id,
  kind,
  locator,
  locatorKey,
  ordinal,
  parentId,
  text,
} = {}) {
  return {
    source_authority_unit_id: id,
    ...(parentId ? {parent_source_authority_unit_id: parentId} : {}),
    version_bridge_id: 'bridge.litigation-promotion-special.25.v1',
    source_coordinate_id: 'coord.litigation-promotion-special.25',
    source_snapshot_id: SNAPSHOT,
    source_version_key: 'litigation-promotion-special@2026-06-02',
    unit_kind: kind,
    locator,
    locator_key: locatorKey,
    ordinal,
    official_text_ko: text,
    official_text_hash: sha256(text),
    validation_status: 'verified',
  };
}

function anchor({id, unitId, locatorKey, parentId, heading, explanation} = {}) {
  return {
    anchor_id: id,
    ...(parentId ? {parent_anchor_id: parentId} : {}),
    source_authority_unit_id: unitId,
    locator_key: locatorKey,
    official_text_hash: '',
    plain_heading_ko: heading,
    explanation_ko: explanation,
  };
}

function authorityBundle({
  schema = 'rulelink_published_bundle_v1',
  timeField = 'built_at',
  asOf = '2026-07-23T00:00:00.000Z',
} = {}) {
  const article = sourceUnit({
    id: 'unit.litigation-promotion-special.25.article',
    kind: 'article',
    locator: {article_no: '0025'},
    locatorKey: 'a25',
    ordinal: 0,
    text: '제25조(배상명령)',
  });
  const paragraph = sourceUnit({
    id: 'unit.litigation-promotion-special.25.p1',
    kind: 'paragraph',
    locator: {article_no: '0025', paragraph_no: '1'},
    locatorKey: 'a25-p1',
    ordinal: 0,
    parentId: article.source_authority_unit_id,
    text: '① 법원은 일정한 범죄의 피해에 관하여 배상을 명할 수 있다.',
  });
  const articleAnchor = anchor({
    id: 'anchor.litigation-promotion-special.25.article',
    unitId: article.source_authority_unit_id,
    locatorKey: article.locator_key,
    heading: '배상명령의 전체 구조',
    explanation: '대상 범죄와 손해, 금지사유를 순서대로 확인합니다.',
  });
  articleAnchor.official_text_hash = article.official_text_hash;
  const paragraphAnchor = anchor({
    id: 'anchor.litigation-promotion-special.25.p1',
    unitId: paragraph.source_authority_unit_id,
    locatorKey: paragraph.locator_key,
    parentId: articleAnchor.anchor_id,
    heading: '대상 범죄와 손해',
    explanation: '공소장 죄명과 청구할 손해 항목을 함께 확인합니다.',
  });
  paragraphAnchor.official_text_hash = paragraph.official_text_hash;
  return {
    schema,
    [timeField]: asOf,
    knowledge: {
      schema: 'rulelink_public_knowledge_index_v1',
      sources: [{
        coordinate_id: 'coord.litigation-promotion-special.25',
        source_id: 'litigation_promotion_special_ko_0025',
        source_kind: 'statute',
        law_key: 'litigation-promotion-special',
        law_name_ko: '소송촉진 등에 관한 특례법',
        article_no: '제25조',
        official_url: 'https://www.law.go.kr/법령/소송촉진등에관한특례법/제25조',
        source_snapshot_id: SNAPSHOT,
        source_version_key: 'litigation-promotion-special@2026-06-02',
        official_url_http_status: 200,
        last_verified_at: '2026-07-23T00:00:00.000Z',
      }],
      rule_cards: [],
      scenario_branches: [],
      topic_hubs: [],
      content_entries: [{
        content_id: 'content.compensation-order-eligible-damages',
        authority_binding_ids: ['binding.compensation-order.25'],
      }],
      source_version_bridges: [{
        bridge_id: 'bridge.litigation-promotion-special.25.v1',
        source_coordinate_id: 'coord.litigation-promotion-special.25',
        source_snapshot_id: SNAPSHOT,
        source_version_key: 'litigation-promotion-special@2026-06-02',
        validation_status: 'verified',
      }],
      source_authority_units: [article, paragraph],
      authority_reading_units: [{
        authority_reading_unit_id: 'authority.litigation-promotion-special.25.v1',
        title_ko: '배상명령은 어떤 범죄와 손해에 적용되나요?',
        route_key: {
          law_key: 'litigation-promotion-special',
          article_no: '0025',
        },
        source_coordinate_id: 'coord.litigation-promotion-special.25',
        source_snapshot_id: SNAPSHOT,
        source_version_key: 'litigation-promotion-special@2026-06-02',
        time_state: 'current_as_of_review',
        effective_from: '2026-06-02T00:00:00.000Z',
        summary_ko: '대상 범죄와 손해가 특정되고 신속한 심리에 적합한지 확인합니다.',
        anchors: [articleAnchor, paragraphAnchor],
        logical_groups: [{
          logical_group_id: 'group.compensation-order.requirements',
          role: 'requirement',
          operator: 'all',
          title_ko: '모두 확인할 요건',
          ordinal: 0,
          anchor_ids: [articleAnchor.anchor_id, paragraphAnchor.anchor_id],
        }],
        explanation_paragraphs: [{
          explanation_paragraph_id: 'paragraph.compensation-order.requirements',
          text_ko: '공소장 죄명과 손해자료를 대조합니다.',
          logical_group_id: 'group.compensation-order.requirements',
          anchor_ids: [paragraphAnchor.anchor_id],
        }],
        citation_edges: [],
        editorial_status: 'approved',
      }],
      authority_bindings: [{
        binding_id: 'binding.compensation-order.25',
        from_kind: 'content',
        from_id: 'content.compensation-order-eligible-damages',
        to_kind: 'authority_reading_unit',
        to_authority_reading_unit_id: 'authority.litigation-promotion-special.25.v1',
        anchor_ids: [paragraphAnchor.anchor_id],
      }],
    },
  };
}

function errors(bundle) {
  return inspectPublicAuthorityReading(bundle).errors.join('\n');
}

test('네 authority 배열이 없거나 모두 비어 있으면 023 무데이터 상태를 그대로 허용한다', () => {
  const absent = authorityBundle();
  for (const key of [
    'source_authority_units',
    'source_version_bridges',
    'authority_reading_units',
    'authority_bindings',
  ]) delete absent.knowledge[key];
  assert.deepEqual(validatePublicAuthorityReading(absent), {
    activeAuthorityReadingUnitIds: [],
    authorityReadingUnitCount: 0,
  });

  const empty = structuredClone(absent);
  empty.knowledge.source_authority_units = [];
  empty.knowledge.source_version_bridges = [];
  empty.knowledge.authority_reading_units = [];
  empty.knowledge.authority_bindings = [];
  assert.deepEqual(validatePublicAuthorityReading(empty), {
    activeAuthorityReadingUnitIds: [],
    authorityReadingUnitCount: 0,
  });
});

test('완전한 네 계층과 content 역투영을 승인한다', () => {
  const result = validatePublicAuthorityReading(authorityBundle());
  assert.deepEqual(result.activeAuthorityReadingUnitIds, [
    'authority.litigation-promotion-special.25.v1',
  ]);
  assert.equal(result.authorityReadingUnitCount, 1);
});

test('호환 별칭과 비배열 필드를 무데이터로 숨기지 않는다', () => {
  const alias = authorityBundle();
  alias.knowledge.authority_explainers = [];
  assert.match(errors(alias), /금지된 authority 호환 별칭/);

  const idAlias = authorityBundle();
  idAlias.knowledge.authority_reading_units[0].authority_id = 'legacy';
  assert.match(errors(idAlias), /금지된 식별자 별칭/);

  const timeAlias = authorityBundle();
  timeAlias.knowledge.authority_reading_units[0].version_scope = 'current';
  assert.match(errors(timeAlias), /금지된 시간상태 별칭/);

  const nonArray = authorityBundle();
  nonArray.knowledge.authority_reading_units = null;
  assert.match(errors(nonArray), /authority_reading_units는 배열/);
});

test('일부 authority 계층만 존재하는 고아 상태를 거부한다', () => {
  const bundle = authorityBundle();
  bundle.knowledge.authority_bindings = [];
  assert.match(errors(bundle), /authority_bindings가 비어 있습니다/);
});

test('route key는 안전한 세그먼트이고 source 법률키와 root article locator에 결박된다', () => {
  const missingTitle = authorityBundle();
  delete missingTitle.knowledge.authority_reading_units[0].title_ko;
  assert.match(errors(missingTitle), /authority title_ko 누락/);

  const unsafe = authorityBundle();
  unsafe.knowledge.authority_reading_units[0].route_key.article_no = '../25';
  assert.match(errors(unsafe), /route_key 오류/);

  const wrongLaw = authorityBundle();
  wrongLaw.knowledge.authority_reading_units[0].route_key.law_key = 'civil-act';
  assert.match(errors(wrongLaw), /route\/source receipt 불일치/);

  const wrongArticle = authorityBundle();
  wrongArticle.knowledge.authority_reading_units[0].route_key.article_no = '0026';
  assert.match(errors(wrongArticle), /root article 불일치/);

  const coordinatedMismatch = authorityBundle();
  coordinatedMismatch.knowledge.authority_reading_units[0].route_key.article_no = '0026';
  for (const unit of coordinatedMismatch.knowledge.source_authority_units) {
    unit.locator.article_no = '0026';
  }
  assert.match(errors(coordinatedMismatch), /route\/source receipt 불일치/);

  const nonCanonical = authorityBundle();
  nonCanonical.knowledge.authority_reading_units[0].route_key.article_no = '25';
  nonCanonical.knowledge.source_authority_units[0].locator.article_no = '25';
  nonCanonical.knowledge.source_authority_units[1].locator.article_no = '25';
  assert.match(errors(nonCanonical), /route_key 오류|locator 깊이 오류/);
});

test('PublishedBundle built_at과 PreviewBundle generated_at으로 time_state를 결정한다', () => {
  const current = authorityBundle();
  assert.doesNotThrow(() => validatePublicAuthorityReading(current));

  const preview = authorityBundle({
    schema: 'rulelink_editorial_preview_bundle_v1',
    timeField: 'generated_at',
    asOf: '2026-05-01T00:00:00.000Z',
  });
  preview.knowledge.authority_reading_units[0].time_state = 'future_effective';
  preview.knowledge.sources[0].last_verified_at = '2026-05-01T00:00:00.000Z';
  assert.doesNotThrow(() => validatePublicAuthorityReading(preview));

  delete preview.generated_at;
  assert.match(errors(preview), /기준시각이 유효한 ISO 시각/);
});

test('유효기간 역전과 저장된 time_state 불일치를 거부한다', () => {
  const reversed = authorityBundle();
  reversed.knowledge.authority_reading_units[0].effective_to = '2026-01-01T00:00:00.000Z';
  assert.match(errors(reversed), /유효기간 오류/);

  const wrongState = authorityBundle();
  wrongState.knowledge.authority_reading_units[0].time_state = 'historical';
  assert.match(errors(wrongState), /time_state 오류/);
});

test('같은 route의 버전 유효기간 중첩과 route-version 중복을 거부한다', () => {
  const bundle = authorityBundle();
  const duplicate = structuredClone(bundle.knowledge.authority_reading_units[0]);
  duplicate.authority_reading_unit_id = 'authority.litigation-promotion-special.25.v2';
  duplicate.anchors = duplicate.anchors.map(value => ({
    ...value,
    anchor_id: `${value.anchor_id}.v2`,
    ...(value.parent_anchor_id ? {parent_anchor_id: `${value.parent_anchor_id}.v2`} : {}),
  }));
  duplicate.logical_groups = duplicate.logical_groups.map(value => ({
    ...value,
    logical_group_id: `${value.logical_group_id}.v2`,
    anchor_ids: value.anchor_ids.map(id => `${id}.v2`),
  }));
  duplicate.explanation_paragraphs = duplicate.explanation_paragraphs.map(value => ({
    ...value,
    explanation_paragraph_id: `${value.explanation_paragraph_id}.v2`,
    logical_group_id: `${value.logical_group_id}.v2`,
    anchor_ids: value.anchor_ids.map(id => `${id}.v2`),
  }));
  bundle.knowledge.authority_reading_units.push(duplicate);
  bundle.knowledge.authority_bindings.push({
    binding_id: 'binding.compensation-order.25.v2',
    from_kind: 'content',
    from_id: 'content.compensation-order-eligible-damages',
    to_kind: 'authority_reading_unit',
    to_authority_reading_unit_id: duplicate.authority_reading_unit_id,
    anchor_ids: [duplicate.anchors[1].anchor_id],
  });
  bundle.knowledge.content_entries[0].authority_binding_ids.push(
    'binding.compensation-order.25.v2',
  );
  assert.match(errors(bundle), /유효기간 중첩/);
  assert.match(errors(bundle), /route\/source_version_key 중복/);
});

test('source unit의 계층·receipt·locator key·원문 hash를 검증한다', () => {
  const crossVersion = authorityBundle();
  crossVersion.knowledge.source_authority_units[1].source_version_key = 'wrong-version';
  assert.match(errors(crossVersion), /부모 source_version_key 불일치/);

  const badParent = authorityBundle();
  badParent.knowledge.source_authority_units[1].unit_kind = 'subitem';
  assert.match(errors(badParent), /locator 깊이 오류|부모 계층 오류/);

  const wrongParentLocator = authorityBundle();
  wrongParentLocator.knowledge.source_authority_units[1].locator.article_no = '0026';
  assert.match(errors(wrongParentLocator), /부모 locator 불일치|source receipt 불일치/);

  const sourceArticleMismatch = authorityBundle();
  for (const unit of sourceArticleMismatch.knowledge.source_authority_units) {
    unit.locator.article_no = '0026';
  }
  sourceArticleMismatch.knowledge.authority_reading_units[0].route_key.article_no = '0026';
  assert.match(errors(sourceArticleMismatch), /source receipt 불일치|route\/source receipt 불일치/);

  const duplicateLocator = authorityBundle();
  duplicateLocator.knowledge.source_authority_units[1].locator_key = 'a25';
  assert.match(errors(duplicateLocator), /서로 다른 locator의 locator_key 중복/);

  const badHash = authorityBundle();
  badHash.knowledge.source_authority_units[0].official_text_hash = '0'.repeat(64);
  assert.match(errors(badHash), /공식 원문 또는 해시 누락/);
});

test('source unit과 anchor의 부모 순환 및 부모 투영 불일치를 거부한다', () => {
  const unitCycle = authorityBundle();
  const [article, paragraph] = unitCycle.knowledge.source_authority_units;
  article.unit_kind = 'paragraph';
  article.locator.paragraph_no = '0';
  article.parent_source_authority_unit_id = paragraph.source_authority_unit_id;
  assert.match(errors(unitCycle), /부모 순환/);

  const anchorParent = authorityBundle();
  delete anchorParent.knowledge.authority_reading_units[0].anchors[1].parent_anchor_id;
  assert.match(errors(anchorParent), /anchor\/source parent 불일치/);
});

test('logical group과 설명 단락은 ID·순서·anchor 참조를 완전히 닫는다', () => {
  const missingGroup = authorityBundle();
  missingGroup.knowledge.authority_reading_units[0].logical_groups = [];
  assert.match(errors(missingGroup), /logical_groups 누락/);

  const danglingParagraph = authorityBundle();
  danglingParagraph.knowledge.authority_reading_units[0]
    .explanation_paragraphs[0].logical_group_id = 'group.missing';
  assert.match(errors(danglingParagraph), /설명 단락 logical_group 누락/);

  const duplicateAnchor = authorityBundle();
  duplicateAnchor.knowledge.authority_reading_units[0]
    .logical_groups[0].anchor_ids.push(
      duplicateAnchor.knowledge.authority_reading_units[0].logical_groups[0].anchor_ids[0],
    );
  assert.match(errors(duplicateAnchor), /logical group anchor 중복/);

  const crossGroup = authorityBundle();
  const reading = crossGroup.knowledge.authority_reading_units[0];
  const [articleAnchor, paragraphAnchor] = reading.anchors;
  reading.logical_groups = [{
    logical_group_id: 'group.requirement',
    role: 'requirement',
    operator: 'all',
    title_ko: '요건',
    ordinal: 0,
    anchor_ids: [articleAnchor.anchor_id],
  }, {
    logical_group_id: 'group.effect',
    role: 'effect',
    operator: 'none',
    title_ko: '효과',
    ordinal: 1,
    anchor_ids: [paragraphAnchor.anchor_id],
  }];
  reading.explanation_paragraphs[0].logical_group_id = 'group.requirement';
  reading.explanation_paragraphs[0].anchor_ids = [paragraphAnchor.anchor_id];
  assert.match(errors(crossGroup), /logical_group 범위를 벗어났습니다/);
});

test('binding과 ContentEntry authority_binding_ids의 양방향 projection을 검증한다', () => {
  const dangling = authorityBundle();
  dangling.knowledge.content_entries[0].authority_binding_ids = ['binding.missing'];
  assert.match(errors(dangling), /역투영 불일치|dangling authority binding/);

  const wrongAnchor = authorityBundle();
  wrongAnchor.knowledge.authority_bindings[0].anchor_ids = ['anchor.missing'];
  assert.match(errors(wrongAnchor), /binding anchor 대상 누락/);

  const orphanReading = authorityBundle();
  orphanReading.knowledge.authority_bindings = [];
  orphanReading.knowledge.content_entries[0].authority_binding_ids = [];
  assert.match(errors(orphanReading), /고아 authority reading unit/);
});

test('citation의 source와 target anchor·법률문맥·활성 해소상태를 검증한다', () => {
  const valid = authorityBundle();
  valid.knowledge.authority_reading_units[0].citation_edges = [{
    citation_edge_id: 'citation.25.self',
    source_anchor_id: 'anchor.litigation-promotion-special.25.p1',
    quoted_law_key: 'litigation-promotion-special',
    target_kind: 'source_authority_unit',
    target_source_authority_unit_id: 'unit.litigation-promotion-special.25.article',
    resolution_status: 'resolved',
    publication_status: 'active',
  }];
  assert.doesNotThrow(() => validatePublicAuthorityReading(valid));

  const targetOnly = authorityBundle();
  const targetSnapshot = 'fedcba9876543210fedcba9876543210';
  const targetText = '제997조(상속개시의 원인) 상속은 사망으로 인하여 개시된다.';
  targetOnly.knowledge.sources.push({
    coordinate_id: 'coord.civil-act.997',
    source_id: 'civil_act_ko_0997',
    source_kind: 'statute',
    law_key: 'civil-act',
    law_name_ko: '민법',
    article_no: '제997조',
    official_url: 'https://www.law.go.kr/법령/민법/제997조',
    source_snapshot_id: targetSnapshot,
    source_version_key: 'civil-act@2026-07-23',
    official_url_http_status: 200,
    last_verified_at: '2026-07-23T00:00:00.000Z',
  });
  targetOnly.knowledge.source_version_bridges.push({
    bridge_id: 'bridge.civil-act.997.v1',
    source_coordinate_id: 'coord.civil-act.997',
    source_snapshot_id: targetSnapshot,
    source_version_key: 'civil-act@2026-07-23',
    validation_status: 'verified',
  });
  targetOnly.knowledge.source_authority_units.push({
    source_authority_unit_id: 'unit.civil-act.997.article',
    version_bridge_id: 'bridge.civil-act.997.v1',
    source_coordinate_id: 'coord.civil-act.997',
    source_snapshot_id: targetSnapshot,
    source_version_key: 'civil-act@2026-07-23',
    unit_kind: 'article',
    locator: {article_no: '0997'},
    locator_key: 'a997',
    ordinal: 0,
    official_text_ko: targetText,
    official_text_hash: sha256(targetText),
    validation_status: 'verified',
  });
  targetOnly.knowledge.authority_reading_units[0].citation_edges = [{
    citation_edge_id: 'citation.25.civil-act-997',
    source_anchor_id: 'anchor.litigation-promotion-special.25.p1',
    quoted_law_key: 'civil-act',
    target_kind: 'source_authority_unit',
    target_source_authority_unit_id: 'unit.civil-act.997.article',
    resolution_status: 'resolved',
    publication_status: 'active',
  }];
  assert.doesNotThrow(
    () => validatePublicAuthorityReading(targetOnly),
    '직접 읽기 카드가 없는 인용 대상 조문도 citation으로 사용되면 고아가 아닙니다.',
  );

  const missingSource = structuredClone(valid);
  missingSource.knowledge.authority_reading_units[0]
    .citation_edges[0].source_anchor_id = 'anchor.missing';
  assert.match(errors(missingSource), /citation source anchor 누락/);

  const wrongLaw = structuredClone(valid);
  wrongLaw.knowledge.authority_reading_units[0]
    .citation_edges[0].quoted_law_key = 'civil-act';
  assert.match(errors(wrongLaw), /법률 문맥 오귀속/);

  const unresolved = structuredClone(valid);
  unresolved.knowledge.authority_reading_units[0]
    .citation_edges[0].resolution_status = 'unresolved';
  assert.match(errors(unresolved), /미해결 authority citation 활성화/);

  const invalidStatus = structuredClone(valid);
  invalidStatus.knowledge.authority_reading_units[0]
    .citation_edges[0].publication_status = 'inactive';
  invalidStatus.knowledge.authority_reading_units[0]
    .citation_edges[0].resolution_status = 'unknown';
  assert.match(errors(invalidStatus), /resolution_status 오류/);

  const mixedSourceTarget = structuredClone(valid);
  mixedSourceTarget.knowledge.authority_reading_units[0]
    .citation_edges[0].target_attachment_id = 'attachment.invalid';
  mixedSourceTarget.knowledge.authority_reading_units[0]
    .citation_edges[0].attachment_status = 'verified';
  assert.match(errors(mixedSourceTarget), /target 필드 혼용/);

  const mixedPrecedentTarget = authorityBundle();
  mixedPrecedentTarget.knowledge.authority_reading_units[0].citation_edges = [{
    citation_edge_id: 'citation.25.precedent',
    source_anchor_id: 'anchor.litigation-promotion-special.25.p1',
    quoted_law_key: 'litigation-promotion-special',
    target_kind: 'precedent',
    target_attachment_id: 'attachment.precedent',
    attachment_status: 'verified',
    target_source_authority_unit_id: 'unit.litigation-promotion-special.25.article',
    resolution_status: 'resolved',
    publication_status: 'active',
  }];
  assert.match(errors(mixedPrecedentTarget), /target 필드 혼용/);
});

test('authority 참조 source의 정본 receipt와 공식 URL 검증 상태를 요구한다', () => {
  const missingVersion = authorityBundle();
  delete missingVersion.knowledge.sources[0].source_version_key;
  assert.match(errors(missingVersion), /statute source 정본 필드 누락/);

  const failedUrl = authorityBundle();
  failedUrl.knowledge.sources[0].official_url_http_status = 503;
  assert.match(errors(failedUrl), /공식 URL 검증 실패/);
});
