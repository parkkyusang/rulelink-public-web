import {createHash} from 'node:crypto';
import {access, readFile} from 'node:fs/promises';
import path from 'node:path';

import {samePublicRuleCopy} from '../src/lib/public-rule-presentation.ts';
import {projectKnowledgeEntryCompatibility} from '../src/lib/knowledge-relations.ts';

const bundlePath = process.env.RULELINK_WEB_BUNDLE_PATH
  ? path.resolve(process.env.RULELINK_WEB_BUNDLE_PATH)
  : path.join(process.cwd(), 'content', 'bundle.json');

if (!(await exists(bundlePath))) {
  if (process.env.RULELINK_REQUIRE_PUBLICATION_BUNDLE === 'true') {
    fail([`승인 출판본을 찾지 못했습니다: ${bundlePath}`]);
  }
  process.stdout.write(`승인 출판본이 없어 공개 번들 검증을 건너뜁니다: ${bundlePath}\n`);
  process.exit(0);
}

let bundle;
try {
  bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
} catch (error) {
  fail([`출판본 JSON을 읽을 수 없습니다: ${error instanceof Error ? error.message : String(error)}`]);
}

const errors = validatePublishedBundle(bundle, {now: process.env.RULELINK_VALIDATION_NOW});
if (errors.length) fail(errors);
process.stdout.write(`공개 번들 안전검증 통과: ${bundlePath}\n`);

export function validatePublishedBundle(value, options = {}) {
  const errors = [];
  const now = validationTime(options.now, errors);
  if (!isRecord(value)) return ['출판본 최상위 값은 객체여야 합니다.'];
  if (value.schema !== 'rulelink_published_bundle_v1') {
    errors.push('공개 빌드는 rulelink_published_bundle_v1만 허용합니다.');
  }
  if (value.preview_only === true) errors.push('내부 편집 미리보기 표시는 공개 번들에 들어갈 수 없습니다.');
  if (value.jurisdiction !== 'KR') errors.push('공개 번들의 관할은 KR이어야 합니다.');
  if (value.locale !== 'ko-KR') errors.push('공개 번들의 언어는 ko-KR이어야 합니다.');
  checkNotFutureTimestamp(value.built_at, '출판본 built_at', now, errors);

  const cards = requireArray(value, 'cards', errors);
  const assertions = requireArray(value, 'assertions', errors);
  const briefs = optionalArray(value, 'change_briefs', errors);
  const fileHashCount = validateFileHashes(value.file_hashes, errors);
  const publishedItemCount = cards.length + briefs.length + knowledgeEntryCount(value.knowledge);
  if (publishedItemCount > 0 && fileHashCount === 0) {
    errors.push('공개 콘텐츠가 있는 출판본에는 승인·출판 파일 해시 영수증이 필요합니다.');
  }
  const cardIds = uniqueIds(cards, 'issue_card_id', '문제카드', errors);
  validateSlugs(cards, 'issue_card_id', '문제카드', errors);
  validateSlugs(briefs, 'change_brief_id', '법령변화 브리핑', errors);
  const assertionIds = uniqueIds(assertions, 'assertion_id', '주장', errors);
  const knowledgeContentIds = new Set(
    isRecord(value.knowledge) && Array.isArray(value.knowledge.content_entries)
      ? value.knowledge.content_entries.map(entry => entry?.content_id).filter(id => typeof id === 'string')
      : [],
  );
  validateAssertions(assertions, now, errors);

  for (const [index, card] of cards.entries()) {
    if (!isRecord(card)) {
      errors.push(`cards[${index}]는 객체여야 합니다.`);
      continue;
    }
    if (card.editorial_status !== 'approved') {
      errors.push(`문제카드 ${label(card, 'issue_card_id')}가 승인 상태가 아닙니다.`);
    }
    checkReviewWindow(card, `문제카드 ${label(card, 'issue_card_id')}`, now, errors);
    checkReferences(card.assertion_ids, assertionIds, `문제카드 ${label(card, 'issue_card_id')}의 assertion_ids`, errors);
  }

  for (const [index, brief] of briefs.entries()) {
    if (!isRecord(brief)) {
      errors.push(`change_briefs[${index}]는 객체여야 합니다.`);
      continue;
    }
    if (brief.editorial_status !== 'approved') {
      errors.push(`법령변화 브리핑 ${label(brief, 'change_brief_id')}이 승인 상태가 아닙니다.`);
    }
    checkReviewWindow(brief, `법령변화 브리핑 ${label(brief, 'change_brief_id')}`, now, errors);
    checkChangeLifecycle(brief, now, errors);
    checkReferences(brief.related_issue_card_ids, cardIds, `법령변화 브리핑 ${label(brief, 'change_brief_id')}의 related_issue_card_ids`, errors);
    checkReferences(brief.related_content_ids ?? [], knowledgeContentIds, `법령변화 브리핑 ${label(brief, 'change_brief_id')}의 related_content_ids`, errors);
    checkReferences(brief.assertion_ids, assertionIds, `법령변화 브리핑 ${label(brief, 'change_brief_id')}의 assertion_ids`, errors);
  }

  if (value.catalog !== undefined) validateCatalog(value.catalog, cardIds, errors);
  if (value.knowledge !== undefined) validateKnowledge(value.knowledge, now, value.file_hashes, errors);
  validateChangeCompositionReceipts(value, value.file_hashes, errors);
  scanForInternalData(value, 'root', errors);
  return [...new Set(errors)];
}


function validateCatalog(value, cardIds, errors) {
  if (!isRecord(value)) {
    errors.push('catalog는 객체여야 합니다.');
    return;
  }
  if (value.schema !== 'rulelink_public_catalog_v1') {
    errors.push('catalog.schema은 rulelink_public_catalog_v1이어야 합니다.');
  }
  const topics = requireArray(value, 'topics', errors, 'catalog');
  uniqueIds(topics, 'topic_id', '공개 주제', errors);
  validateSlugs(topics, 'topic_id', '공개 주제', errors);
  for (const topic of topics) {
    if (!isRecord(topic)) continue;
    checkReferences(topic.issue_card_ids, cardIds, `공개 주제 ${label(topic, 'topic_id')}의 issue_card_ids`, errors);
  }
}

function validateKnowledge(value, now, fileHashes, errors) {
  if (!isRecord(value)) {
    errors.push('knowledge는 객체여야 합니다.');
    return;
  }
  if (value.schema !== 'rulelink_public_knowledge_index_v1') {
    errors.push('knowledge.schema은 rulelink_public_knowledge_index_v1이어야 합니다.');
  }
  const sources = requireArray(value, 'sources', errors, 'knowledge');
  const rules = requireArray(value, 'rule_cards', errors, 'knowledge');
  const scenarios = requireArray(value, 'scenario_branches', errors, 'knowledge');
  const entries = requireArray(value, 'content_entries', errors, 'knowledge');
  const hubs = requireArray(value, 'topic_hubs', errors, 'knowledge');
  const concepts = optionalArray(value, 'concept_cards', errors, 'knowledge');

  const sourceIds = uniqueIds(sources, 'coordinate_id', '공식 근거', errors);
  const ruleIds = uniqueIds(rules, 'rule_id', '법리카드', errors);
  const scenarioIds = uniqueIds(scenarios, 'scenario_id', '사실분기', errors);
  const scenarioById = new Map(scenarios.filter(isRecord).map(scenario => [scenario.scenario_id, scenario]));
  const entryIds = uniqueIds(entries, 'content_id', '지식 콘텐츠', errors);
  const hubIds = uniqueIds(hubs, 'hub_id', '주제 허브', errors);
  const conceptIds = uniqueIds(concepts, 'concept_id', '법률개념', errors);
  for (const entry of entries) validateKnowledgeObjectReceipt(entry, 'content_id', 'knowledge', fileHashes, errors);
  for (const concept of concepts) validateKnowledgeObjectReceipt(concept, 'concept_id', 'knowledge-concept', fileHashes, errors);
  validateKnowledgeIndexReceipt(value, fileHashes, errors);
  validateSlugs(entries, 'content_id', '지식 콘텐츠', errors);
  validateSlugs(hubs, 'hub_id', '주제 허브', errors);
  validateSlugs(concepts, 'concept_id', '법률개념', errors);

  for (const hub of hubs) {
    if (!isRecord(hub)) continue;
    const hubName = `주제 허브 ${label(hub, 'hub_id')}`;
    for (const field of ['title_ko', 'description_ko']) {
      if (typeof hub[field] !== 'string' || !hub[field].trim()) {
        errors.push(`${hubName}의 ${field}가 비어 있습니다.`);
      }
    }
    const hubContentIds = requireArray(hub, 'content_ids', errors, hubName);
    if (hubContentIds.length === 0) errors.push(`${hubName}의 content_ids는 하나 이상이어야 합니다.`);
    checkReferences(hubContentIds, entryIds, `${hubName}의 content_ids`, errors);
  }

  for (const source of sources) {
    if (!isRecord(source)) continue;
    if ('source_hash' in source) errors.push(`공개 지식 근거 ${label(source, 'coordinate_id')}에 source_hash가 남아 있습니다.`);
    if (!isOfficialHttpsUrl(source.official_url)) {
      errors.push(`공개 지식 근거 ${label(source, 'coordinate_id')}의 공식 URL이 허용된 정부 도메인이 아닙니다.`);
    }
    checkStableKnowledgeSource(source, `공개 지식 근거 ${label(source, 'coordinate_id')}`, errors);
    checkNotFutureTimestamp(source.last_verified_at, `공개 지식 근거 ${label(source, 'coordinate_id')}의 last_verified_at`, now, errors);
  }

  for (const rule of rules) {
    if (!isRecord(rule)) continue;
    checkReferences(rule.source_coordinate_ids, sourceIds, `법리카드 ${label(rule, 'rule_id')}의 source_coordinate_ids`, errors);
    const ruleName = `법리카드 ${label(rule, 'rule_id')}`;
    const ruleTitle = typeof rule.title_ko === 'string' ? rule.title_ko.trim() : '';
    const proposition = typeof rule.proposition_ko === 'string' ? rule.proposition_ko.trim() : '';
    if (!ruleTitle) errors.push(`${ruleName}의 title_ko가 비어 있습니다.`);
    if (!proposition) errors.push(`${ruleName}의 proposition_ko가 비어 있습니다.`);
    if (/…$|\.\.\.$/u.test(ruleTitle)) errors.push(`${ruleName}의 제목이 말줄임표로 잘려 있습니다.`);
    if (ruleTitle.length > 45) errors.push(`${ruleName}의 제목은 45자 이하의 쟁점명이어야 합니다.`);
    if (samePublicRuleCopy(ruleTitle, proposition)) errors.push(`${ruleName}의 제목과 법리 문장이 중복됩니다.`);
    if (!isRecord(rule.norm)) {
      errors.push(`${ruleName}의 norm이 객체가 아닙니다.`);
    } else {
      for (const field of ['actor_ko', 'conditions_ko', 'legal_effect_ko']) {
        if (typeof rule.norm[field] !== 'string' || !rule.norm[field].trim()) errors.push(`${ruleName}의 norm.${field}가 비어 있습니다.`);
      }
      const legalEffect = typeof rule.norm.legal_effect_ko === 'string' ? rule.norm.legal_effect_ko.trim() : '';
      if (ruleTitle && legalEffect && samePublicRuleCopy(ruleTitle, legalEffect)) {
        errors.push(`${ruleName}의 제목과 결과 문장이 중복됩니다.`);
      }
      if (['해당 법률관계의 당사자', '당사자'].includes(rule.norm.actor_ko?.trim())) {
        errors.push(`${ruleName}의 norm.actor_ko가 적용 주체를 구체화하지 않은 자리표시자입니다.`);
      }
      if (rule.norm.conditions_ko?.includes('조문과 구체적 사실관계가 정한 요건')) {
        errors.push(`${ruleName}의 norm.conditions_ko가 적용 요건을 구체화하지 않은 자리표시자입니다.`);
      }
    }
  }

  for (const scenario of scenarios) {
    if (!isRecord(scenario)) continue;
    const scenarioName = `사실분기 ${label(scenario, 'scenario_id')}`;
    checkReferences(scenario.rule_ids, ruleIds, `${scenarioName}의 rule_ids`, errors);
    const scenarioSources = requireArray(scenario, 'source_coordinate_ids', errors, scenarioName);
    checkReferences(scenarioSources, sourceIds, `${scenarioName}의 source_coordinate_ids`, errors);
    if (scenarioSources.length === 0) errors.push(`${scenarioName}에는 조문 근거가 하나 이상 필요합니다.`);
    for (const field of ['question_ko', 'decision_fact_ko', 'when_true_ko', 'when_false_ko']) {
      if (typeof scenario[field] !== 'string' || !scenario[field].trim()) errors.push(`${scenarioName}의 ${field}가 비어 있습니다.`);
    }
    const placeholderValues = [
      '질문에 해당하는 구체적 사실',
      '연결된 법리의 요건과 효과를 적용해 검토합니다.',
      '다른 사실분기와 예외를 이어서 확인합니다.',
    ];
    if (placeholderValues.some(value => [scenario.decision_fact_ko, scenario.when_true_ko, scenario.when_false_ko].includes(value))) {
      errors.push(`${scenarioName}에 사용자 판단을 돕지 못하는 자리표시자 문구가 있습니다.`);
    }
  }

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    let compatibleEntry = entry;
    try {
      compatibleEntry = projectKnowledgeEntryCompatibility(entry, scenarioById);
    } catch (error) {
      errors.push(`지식 콘텐츠 ${label(entry, 'content_id')}의 선택적 관계·제품 역할 계약이 올바르지 않습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (entry.editorial_status !== 'approved') {
      errors.push(`지식 콘텐츠 ${label(entry, 'content_id')}가 승인 상태가 아닙니다.`);
    }
    checkReviewWindow(entry, `지식 콘텐츠 ${label(entry, 'content_id')}`, now, errors);
    checkReferences(entry.rule_ids, ruleIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 rule_ids`, errors);
    checkReferences(entry.scenario_ids, scenarioIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 scenario_ids`, errors);
    checkReferences(entry.source_coordinate_ids, sourceIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 source_coordinate_ids`, errors);
    checkReferences(entry.hub_ids, hubIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 hub_ids`, errors);
    checkReferences(compatibleEntry.related_content_ids, entryIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 related_content_ids`, errors);
    checkReferences(compatibleEntry.concept_ids ?? [], conceptIds, `지식 콘텐츠 ${label(entry, 'content_id')}의 concept_ids`, errors);
    for (const relation of Array.isArray(entry.related_edges) ? entry.related_edges : []) {
      if (!isRecord(relation)) continue;
      const allowed = relation.target_kind === 'concept' ? conceptIds : entryIds;
      checkReferences([relation.target_id], allowed, `지식 콘텐츠 ${label(entry, 'content_id')}의 related_edges`, errors);
    }
    const entryName = `지식 콘텐츠 ${label(entry, 'content_id')}`;
    requireNonEmptyStringArray(entry, 'key_points_ko', 2, entryName, errors);
    requireNonEmptyStringArray(entry, 'action_steps_ko', 2, entryName, errors);
    requireNonEmptyStringArray(entry, 'facts_to_check_ko', 2, entryName, errors);
    requireNonEmptyStringArray(entry, 'search_intents_ko', 1, entryName, errors);
    if (typeof entry.caution_ko !== 'string' || !entry.caution_ko.trim()) {
      errors.push(`${entryName}의 caution_ko는 비어 있지 않은 문자열이어야 합니다.`);
    }
    const bodySections = requireArray(entry, 'body_sections', errors, entryName);
    if (bodySections.length < 1) errors.push(`${entryName}의 body_sections는 하나 이상이어야 합니다.`);
    for (const [sectionIndex, section] of bodySections.entries()) {
      if (!isRecord(section) || typeof section.heading_ko !== 'string' || !section.heading_ko.trim()) {
        errors.push(`${entryName}의 body_sections[${sectionIndex}] 제목이 없습니다.`);
        continue;
      }
      requireNonEmptyStringArray(section, 'paragraphs_ko', 1, `${entryName}의 body_sections[${sectionIndex}]`, errors);
    }
    if (entry.concierge_entry !== undefined) {
      errors.push(`지식 콘텐츠 ${label(entry, 'content_id')}에 금지된 concierge_entry가 있습니다.`);
    }
  }

  for (const hub of hubs) {
    if (!isRecord(hub)) continue;
    checkReferences(hub.content_ids, entryIds, `주제 허브 ${label(hub, 'hub_id')}의 content_ids`, errors);
  }

  const conceptRoles = new Set(['plain_definition', 'legal_definition', 'elements', 'legal_effects', 'judgment_factors', 'limits', 'procedure']);
  for (const [index, concept] of concepts.entries()) {
    if (!isRecord(concept)) {
      errors.push(`concept_cards[${index}]는 객체여야 합니다.`);
      continue;
    }
    const conceptName = `법률개념 ${label(concept, 'concept_id')}`;
    if (concept.editorial_status !== 'approved') errors.push(`${conceptName}이 승인 상태가 아닙니다.`);
    checkReviewWindow(concept, conceptName, now, errors);
    if (typeof concept.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(concept.version)) {
      errors.push(`${conceptName}의 version은 의미적 버전 형식이어야 합니다.`);
    }
    for (const field of ['preferred_term_ko', 'plain_definition_ko', 'legal_definition_ko']) {
      if (typeof concept[field] !== 'string' || !concept[field].trim()) errors.push(`${conceptName}의 ${field}가 비어 있습니다.`);
    }
    for (const [field, minimum] of [
      ['aliases_ko', 0],
      ['elements_ko', 1],
      ['legal_effects_ko', 1],
      ['judgment_factors_ko', 0],
      ['limits_and_counterexamples_ko', 1],
      ['confused_with_ko', 0],
      ['examples_ko', 1],
    ]) requireNonEmptyStringArray(concept, field, minimum, conceptName, errors);
    checkReferences(concept.source_coordinate_ids, sourceIds, `${conceptName}의 source_coordinate_ids`, errors);
    checkReferences(concept.related_rule_ids, ruleIds, `${conceptName}의 related_rule_ids`, errors);
    checkReferences(concept.related_concept_ids, conceptIds, `${conceptName}의 related_concept_ids`, errors);
    checkReferences(concept.related_content_ids, entryIds, `${conceptName}의 related_content_ids`, errors);
    const conceptAssertions = requireArray(concept, 'assertions', errors, conceptName);
    if (conceptAssertions.length < 2) errors.push(`${conceptName}의 assertions는 쉬운 설명과 법률상 정의를 포함해 둘 이상이어야 합니다.`);
    uniqueIds(conceptAssertions, 'assertion_id', `${conceptName} 주장`, errors);
    const roles = new Set();
    for (const [assertionIndex, assertion] of conceptAssertions.entries()) {
      if (!isRecord(assertion)) {
        errors.push(`${conceptName}의 assertions[${assertionIndex}]는 객체여야 합니다.`);
        continue;
      }
      if (!conceptRoles.has(assertion.role)) errors.push(`${conceptName} 주장 ${label(assertion, 'assertion_id')}의 role이 허용되지 않습니다.`);
      roles.add(assertion.role);
      if (typeof assertion.text_ko !== 'string' || !assertion.text_ko.trim()) errors.push(`${conceptName} 주장 ${label(assertion, 'assertion_id')}의 text_ko가 비어 있습니다.`);
      const assertionSources = requireArray(assertion, 'source_coordinate_ids', errors, `${conceptName} 주장 ${label(assertion, 'assertion_id')}`);
      if (assertionSources.length === 0) errors.push(`${conceptName} 주장 ${label(assertion, 'assertion_id')}에는 근거가 하나 이상 필요합니다.`);
      checkReferences(assertionSources, sourceIds, `${conceptName} 주장 ${label(assertion, 'assertion_id')}의 source_coordinate_ids`, errors);
    }
    for (const requiredRole of ['plain_definition', 'legal_definition']) {
      if (!roles.has(requiredRole)) errors.push(`${conceptName}에 ${requiredRole} 주장이 없습니다.`);
    }
  }
}


function validateAssertions(assertions, now, errors) {
  for (const [index, assertion] of assertions.entries()) {
    if (!isRecord(assertion)) {
      errors.push(`assertions[${index}]는 객체여야 합니다.`);
      continue;
    }
    const name = `주장 ${label(assertion, 'assertion_id')}`;
    const coordinates = requireArray(assertion, 'source_coordinates', errors, name);
    for (const [coordinateIndex, coordinate] of coordinates.entries()) {
      if (!isRecord(coordinate)) {
        errors.push(`${name}의 source_coordinates[${coordinateIndex}]는 객체여야 합니다.`);
        continue;
      }
      if (coordinate.validation_status !== 'verified') {
        errors.push(`${name}의 근거 ${label(coordinate, 'source_snapshot_id')}가 검증 상태가 아닙니다.`);
      }
      if (!isOfficialHttpsUrl(coordinate.official_url)) {
        errors.push(`${name}의 근거 ${label(coordinate, 'source_snapshot_id')} 공식 URL이 허용된 정부 도메인이 아닙니다.`);
      }
      checkNotFutureTimestamp(
        coordinate.last_verified_at,
        `${name}의 근거 ${label(coordinate, 'source_snapshot_id')} last_verified_at`,
        now,
        errors,
      );
    }
  }
}

function checkReviewWindow(value, name, now, errors) {
  const reviewedAt = parseTimestamp(value.reviewed_at, `${name} reviewed_at`, errors);
  const expiresAt = parseTimestamp(value.expires_at, `${name} expires_at`, errors);
  if (!reviewedAt || !expiresAt || !now) return;
  if (reviewedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    errors.push(`${name}의 검토일이 검증 기준시각보다 미래입니다.`);
  }
  if (expiresAt.getTime() <= reviewedAt.getTime()) {
    errors.push(`${name}의 재검토 기한은 검토일보다 뒤여야 합니다.`);
  }
  if (expiresAt.getTime() <= now.getTime()) {
    errors.push(`${name}의 재검토 기한이 지났습니다.`);
  }
}

function checkChangeLifecycle(brief, now, errors) {
  const name = `법령변화 브리핑 ${label(brief, 'change_brief_id')}`;
  if (!isIsoDate(brief.effective_date)) {
    errors.push(`${name}의 effective_date는 유효한 YYYY-MM-DD 날짜여야 합니다.`);
    return;
  }
  if (!now) return;
  const today = seoulDate(now);
  if (brief.lifecycle === 'future_effective' && brief.effective_date <= today) {
    errors.push(`${name}은 시행일이 도래했으므로 시행 예정 상태일 수 없습니다.`);
  } else if (['recently_effective', 'currently_effective'].includes(brief.lifecycle) && brief.effective_date > today) {
    errors.push(`${name}은 시행일 전이므로 최근 시행 또는 현행 제도 상태일 수 없습니다.`);
  } else if (!['future_effective', 'recently_effective', 'currently_effective'].includes(brief.lifecycle)) {
    errors.push(`${name}의 lifecycle 값이 허용되지 않습니다.`);
  }
}

function checkNotFutureTimestamp(value, name, now, errors) {
  const timestamp = parseTimestamp(value, name, errors);
  if (timestamp && now && timestamp.getTime() > now.getTime() + 5 * 60 * 1000) {
    errors.push(`${name}이 검증 기준시각보다 미래입니다.`);
  }
}

function parseTimestamp(value, name, errors) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${name}은 유효한 날짜시각이어야 합니다.`);
    return null;
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    errors.push(`${name}은 유효한 날짜시각이어야 합니다.`);
    return null;
  }
  return timestamp;
}

function validationTime(value, errors) {
  if (value === undefined || value === '') return new Date();
  return parseTimestamp(value, '검증 기준시각', errors);
}

function seoulDate(value) {
  return new Date(value.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}


function validateFileHashes(value, errors) {
  if (!isRecord(value)) {
    errors.push('file_hashes는 승인·출판 파일 해시 객체여야 합니다.');
    return 0;
  }
  const entries = Object.entries(value);
  for (const [key, hash] of entries) {
    if (!key || key.includes('..') || looksLikeInternalPath(key)) {
      errors.push(`file_hashes에 공개할 수 없는 키가 있습니다: ${key || '(빈 키)'}`);
    }
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) {
      errors.push(`file_hashes의 값은 소문자 64자리 SHA-256이어야 합니다: ${key}`);
    }
  }
  return entries.length;
}

function validateKnowledgeObjectReceipt(value, idKey, prefix, fileHashes, errors) {
  if (!isRecord(value) || typeof value[idKey] !== 'string') return;
  const key = `${prefix}:${value[idKey]}`;
  const expected = createHash('sha256').update(canonicalJson(value)).digest('hex');
  if (!isRecord(fileHashes) || fileHashes[key] !== expected) {
    errors.push(`${key}의 내용 해시 영수증이 현재 공개 내용과 일치하지 않습니다.`);
  }
}

function validateKnowledgeIndexReceipt(value, fileHashes, errors) {
  const key = `knowledge-index:${value.schema}`;
  const expected = createHash('sha256').update(canonicalJson(value)).digest('hex');
  if (!isRecord(fileHashes) || fileHashes[key] !== expected) {
    errors.push('공개 지식 전체 연결구조의 내용 해시 영수증이 일치하지 않습니다.');
  }
}

function validateChangeCompositionReceipts(bundle, fileHashes, errors) {
  const schema = 'rulelink_public_change_composition_v1';
  const indexKey = `change-index:${schema}`;
  if (!isRecord(fileHashes) || fileHashes[indexKey] === undefined) return;
  for (const assertion of bundle.assertions ?? []) {
    validateKnowledgeObjectReceipt(assertion, 'assertion_id', 'change-assertion', fileHashes, errors);
  }
  for (const brief of bundle.change_briefs ?? []) {
    validateKnowledgeObjectReceipt(brief, 'change_brief_id', 'change-brief', fileHashes, errors);
  }
  const composition = {schema, assertions: bundle.assertions ?? [], change_briefs: bundle.change_briefs ?? []};
  const expected = createHash('sha256').update(canonicalJson(composition)).digest('hex');
  if (fileHashes[indexKey] !== expected) {
    errors.push('법령변화 전체 연결구조의 내용 해시 영수증이 일치하지 않습니다.');
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function knowledgeEntryCount(value) {
  if (!isRecord(value)) return 0;
  return (Array.isArray(value.content_entries) ? value.content_entries.length : 0)
    + (Array.isArray(value.concept_cards) ? value.concept_cards.length : 0);
}

function scanForInternalData(value, location, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForInternalData(item, `${location}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) {
    if (typeof value === 'string' && looksLikeInternalPath(value)) {
      errors.push(`내부 경로로 보이는 문자열이 공개 번들에 있습니다: ${location}`);
    }
    return;
  }
  const forbiddenKeys = new Set([
    'raw_prompt',
    'user_prompt',
    'case_folder',
    'job_id',
    'internal_path',
    'source_path',
    'memo_path',
    'artifact_path',
  ]);
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) errors.push(`내부 전용 필드가 공개 번들에 있습니다: ${location}.${key}`);
    scanForInternalData(child, `${location}.${key}`, errors);
  }
}

function looksLikeInternalPath(value) {
  return /[A-Za-z]:\\/.test(value)
    || value.startsWith('file://')
    || /(?:^|[/\\])00_inbox(?:[/\\]|$)/i.test(value)
    || /(?:^|[/\\])inbox[/\\]jobs(?:[/\\]|$)/i.test(value)
    || /(?:^|[/\\])\.codex[/\\]skills(?:[/\\]|$)/i.test(value)
    || /(?:^|[/\\])data[/\\]db(?:[/\\]|$)/i.test(value);
}

function checkStableKnowledgeSource(source, name, errors) {
  if (source.source_kind === 'precedent') {
    if (typeof source.title_ko !== 'string' || !source.title_ko.trim()) errors.push(`${name}의 판례 제목이 없습니다.`);
    if (typeof source.case_number !== 'string' || !/^\d{2,4}[가-힣]+\d+$/.test(source.case_number.trim())) errors.push(`${name}의 사건번호가 유효하지 않습니다.`);
    if (!isIsoDate(source.decision_date)) errors.push(`${name}의 선고일이 유효한 YYYY-MM-DD 날짜가 아닙니다.`);
    if ('law_name_ko' in source || 'article_no' in source) errors.push(`${name}에 판례와 법령 조문 필드가 혼합돼 있습니다.`);
    try {
      const url = new URL(source.official_url);
      const stableId = url.searchParams.get('precSeq') || url.searchParams.get('evtNo');
      if (!url.pathname.endsWith('/precInfoP.do') || !stableId) errors.push(`${name}의 공식 URL에 판례 문서 식별자가 없습니다.`);
    } catch {
      // URL 형식 오류는 isOfficialHttpsUrl에서 별도로 보고한다.
    }
    return;
  }
  if (source.source_kind === 'official_document') {
    if (typeof source.title_ko !== 'string' || !source.title_ko.trim()) errors.push(`${name}의 title_ko가 없습니다.`);
    if (!['revision_reason', 'revision_text', 'unnumbered_regulation'].includes(source.document_kind)) errors.push(`${name}의 document_kind가 허용되지 않습니다.`);
    if (!isIsoDate(source.effective_date)) errors.push(`${name}의 effective_date가 유효한 날짜가 아닙니다.`);
    if (typeof source.promulgation_number !== 'string' || !source.promulgation_number.trim()) errors.push(`${name}의 promulgation_number가 없습니다.`);
    try {
      const url = new URL(source.official_url);
      if (!url.pathname.endsWith('/lsInfoP.do') || !url.searchParams.get('lsiSeq')) {
        errors.push(`${name}의 공식 URL에 법령 버전 식별자 lsiSeq가 없습니다.`);
      }
    } catch {
      // URL 형식 오류는 isOfficialHttpsUrl에서 별도로 보고한다.
    }
    return;
  }
  if (source.source_kind !== undefined && source.source_kind !== 'statute') {
    errors.push(`${name}의 source_kind가 허용되지 않습니다.`);
    return;
  }
  if (typeof source.law_name_ko !== 'string' || !source.law_name_ko.trim()) {
    errors.push(`${name}의 law_name_ko가 없습니다.`);
    return;
  }
  if (typeof source.article_no !== 'string' || !/^제[1-9]\d*조(?:의[1-9]\d*)?$/.test(source.article_no.trim())) {
    errors.push(`${name}의 article_no가 유효한 조문 표기가 아닙니다.`);
    return;
  }
  const expected = new URL(`https://www.law.go.kr/${['법령', source.law_name_ko.trim(), source.article_no.trim()].map(encodeURIComponent).join('/')}`).href;
  try {
    if (new URL(source.official_url).href !== expected) {
      errors.push(`${name}의 공식 URL이 법령명·조문번호와 일치하는 안정 주소가 아닙니다.`);
    }
  } catch {
    // URL 형식 오류는 isOfficialHttpsUrl에서 별도로 보고한다.
  }
}

function isOfficialHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'go.kr' || url.hostname.endsWith('.go.kr'));
  } catch {
    return false;
  }
}

function requireArray(value, key, errors, prefix = '') {
  if (!Array.isArray(value[key])) {
    errors.push(`${prefix ? `${prefix}.` : ''}${key}는 배열이어야 합니다.`);
    return [];
  }
  return value[key];
}

function optionalArray(value, key, errors) {
  if (value[key] === undefined) return [];
  return requireArray(value, key, errors);
}

function requireNonEmptyStringArray(value, key, minimum, prefix, errors) {
  const items = requireArray(value, key, errors, prefix);
  if (items.length < minimum) {
    errors.push(`${prefix}.${key}는 ${minimum}개 이상이어야 합니다.`);
  }
  for (const [index, item] of items.entries()) {
    if (typeof item !== 'string' || !item.trim()) {
      errors.push(`${prefix}.${key}[${index}]는 비어 있지 않은 문자열이어야 합니다.`);
    }
  }
  return items;
}

function uniqueIds(items, key, labelName, errors) {
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!isRecord(item) || typeof item[key] !== 'string' || !item[key]) {
      errors.push(`${labelName}[${index}]의 ${key}가 없습니다.`);
      continue;
    }
    if (ids.has(item[key])) errors.push(`${labelName} 식별자가 중복됩니다: ${item[key]}`);
    ids.add(item[key]);
  }
  return ids;
}


function validateSlugs(items, idKey, labelName, errors) {
  const seen = new Set();
  for (const item of items) {
    if (!isRecord(item)) continue;
    const itemLabel = label(item, idKey);
    if (typeof item.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) {
      errors.push(`${labelName} ${itemLabel}의 slug는 영문 소문자·숫자·하이픈으로 된 공개 URL 식별자여야 합니다.`);
      continue;
    }
    if (seen.has(item.slug)) {
      errors.push(`${labelName}의 공개 URL 식별자가 중복됩니다: ${item.slug}`);
    }
    seen.add(item.slug);
  }
}

function checkReferences(value, allowed, location, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${location}는 배열이어야 합니다.`);
    return;
  }
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item)) errors.push(`${location}에 존재하지 않는 참조가 있습니다: ${String(item)}`);
  }
}

function label(value, key) {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : '(식별자 없음)';
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function fail(errors) {
  for (const error of errors) process.stderr.write(`공개 번들 안전검증 실패: ${error}\n`);
  process.exit(1);
}
