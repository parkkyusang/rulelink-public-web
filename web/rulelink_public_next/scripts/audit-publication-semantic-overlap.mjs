import {access, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');

export const AXIS_WEIGHTS = Object.freeze({
  actor: 10,
  life_event: 15,
  user_goal: 15,
  procedure_or_forum: 15,
  legal_effect: 20,
  time_scope: 10,
  decision_facts: 10,
  normative_sources: 5,
});

export const SCORE_BANDS = Object.freeze({
  duplicate_blocked: 85,
  containment_review: 70,
  related_required: 50,
});

const coreAxes = new Set(['user_goal', 'procedure_or_forum', 'legal_effect', 'time_scope']);
const stopWords = new Set([
  '경우', '관련', '여부', '어떻게', '무엇', '누가', '언제', '하나요', '하나', '인가요', '인가',
  '있나요', '있나', '되나요', '되나', '수', '것', '때', '위한', '대한', '따라', '원칙', '확인',
]);
const canonicalReplacements = [
  [/접수/gu, '신청'],
  [/독촉/gu, '추심'],
  [/수리/gu, '수선'],
  [/고치(?:다|는|면|고|려|나요|나)?|고쳐/gu, '수선'],
  [/돌려받(?:다|는|을|나요|나)?/gu, '상환'],
  [/재심판정/gu, '재심'],
  [/판정/gu, '결정'],
  [/송달받은/gu, '송달'],
  [/통지받은/gu, '통지'],
  [/바로|모두|무조건|반드시|누구나/gu, ' '],
];
const procedureTerms = [
  '신청', '소송', '행정소송', '재심', '심판', '조정', '중재', '신고', '고소', '압류', '가압류',
  '추심', '집행', '중지', '금지명령', '개시결정', '인가', '면책', '폐지', '수선', '상환',
  '지급정지', '피해환급', '열람', '정정', '삭제', '처리정지', '이의신청', '조사', '감정',
];
const timePattern = /(?:\d+(?:\.\d+)?\s*(?:일|개월|년|시간)|계약종료전|계약종료후|시행예정|구법적용|현행법적용)/gu;

function list(value) {
  if (Array.isArray(value)) return value.flatMap(list);
  if (value === undefined || value === null) return [];
  if (typeof value === 'object') return Object.values(value).flatMap(list);
  const text = String(value).trim();
  return text ? [text] : [];
}

export function normalizeKoreanText(value) {
  let text = list(value).join(' ').normalize('NFKC').toLowerCase();
  for (const [pattern, replacement] of canonicalReplacements) text = text.replace(pattern, replacement);
  return text
    .replace(/[^0-9a-z가-힣%]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function wordTokensFromNormalized(text) {
  return new Set(text.split(' ').filter(token => token.length >= 2 && !stopWords.has(token)));
}

function characterNgramsFromNormalized(text, size = 2) {
  const compact = text.replaceAll(' ', '');
  const values = new Set();
  for (let index = 0; index <= compact.length - size; index += 1) values.add(compact.slice(index, index + size));
  return values;
}

const textProfileCache = new Map();

function textProfile(value) {
  const normalized = normalizeKoreanText(value);
  const cached = textProfileCache.get(normalized);
  if (cached) return cached;
  const profile = {
    words: wordTokensFromNormalized(normalized),
    ngrams: characterNgramsFromNormalized(normalized),
  };
  textProfileCache.set(normalized, profile);
  return profile;
}

function dice(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return (2 * intersection) / (left.size + right.size);
}

function singleTextSimilarity(left, right) {
  const a = textProfile(left);
  const b = textProfile(right);
  return Math.max(
    dice(a.words, b.words),
    dice(a.ngrams, b.ngrams),
  );
}

function textSimilarity(left, right) {
  const a = list(left);
  const b = list(right);
  if (!a.length || !b.length) return 0;
  let similarity = singleTextSimilarity(a, b);
  for (const leftValue of a.slice(0, 16)) {
    for (const rightValue of b.slice(0, 16)) similarity = Math.max(similarity, singleTextSimilarity(leftValue, rightValue));
  }
  return similarity;
}

function overlapSimilarity(left, right) {
  const a = new Set(list(left).map(normalizeKoreanText).filter(Boolean));
  const b = new Set(list(right).map(normalizeKoreanText).filter(Boolean));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

function sentencesWithTerms(values, terms) {
  const sentences = list(values);
  const matches = sentences.filter(sentence => terms.some(term => normalizeKoreanText(sentence).includes(normalizeKoreanText(term))));
  return matches.length ? matches : [];
}

function extractTimeValues(values) {
  const matches = normalizeKoreanText(values).match(timePattern) || [];
  return [...new Set(matches.map(value => value.replaceAll(' ', '')))];
}

function explicitField(signature, ...names) {
  for (const name of names) if (signature?.[name] !== undefined) return list(signature[name]);
  return [];
}

const datasetIndexes = new WeakMap();

function buildIndexes(dataset) {
  const cached = datasetIndexes.get(dataset);
  if (cached) return cached;
  const indexes = {
    sourceByCoordinate: new Map((dataset.sources || []).map(source => [source.coordinate_id, source])),
    ruleById: new Map((dataset.rule_cards || []).map(rule => [rule.rule_id, rule])),
    scenarioById: new Map((dataset.scenario_branches || []).map(scenario => [scenario.scenario_id, scenario])),
  };
  datasetIndexes.set(dataset, indexes);
  return indexes;
}

export function normalizeNormativeSource(source) {
  const lawName = normalizeKoreanText(source?.law_name_ko || source?.law_name || '');
  const article = normalizeKoreanText(source?.article_no || source?.article || '').replaceAll(' ', '');
  if (lawName && article) return `${lawName}:${article}`;
  const caseNumber = normalizeKoreanText(source?.case_number || source?.precedent_number || '');
  if (caseNumber) return `판례:${caseNumber}`;
  return '';
}

export function deriveQuestionSignature(entry, dataset) {
  const explicit = entry.question_signature || {};
  const indexes = buildIndexes(dataset);
  const rules = (entry.rule_ids || []).map(id => indexes.ruleById.get(id)).filter(Boolean);
  const scenarios = (entry.scenario_ids || []).map(id => indexes.scenarioById.get(id)).filter(Boolean);
  const sources = (entry.source_coordinate_ids || []).map(id => indexes.sourceByCoordinate.get(id)).filter(Boolean);
  const allText = [
    entry.title_ko,
    entry.one_line_answer_ko,
    entry.audience_situation_ko,
    entry.key_points_ko,
    entry.action_steps_ko,
    entry.facts_to_check_ko,
    entry.caution_ko,
    entry.search_intents_ko,
    entry.body_sections,
    rules,
    scenarios,
  ];

  const derived = {
    actor: rules.flatMap(rule => list(rule.norm?.actor_ko || rule.actor_ko)),
    life_event: [entry.title_ko, entry.audience_situation_ko, entry.search_intents_ko],
    user_goal: [entry.title_ko, entry.action_steps_ko],
    procedure_or_forum: sentencesWithTerms([
      entry.title_ko,
      entry.one_line_answer_ko,
      entry.search_intents_ko,
      rules.map(rule => [rule.norm?.conditions_ko, rule.norm?.legal_effect_ko, rule.conditions_ko, rule.legal_effect_ko]),
      scenarios.map(scenario => [scenario.decision_fact_ko, scenario.when_true_ko, scenario.when_false_ko]),
    ], procedureTerms),
    legal_effect: [
      entry.one_line_answer_ko,
      ...rules.flatMap(rule => list(rule.norm?.legal_effect_ko || rule.legal_effect_ko)),
      ...scenarios.flatMap(scenario => list([scenario.when_true_ko, scenario.when_false_ko])),
    ],
    time_scope: extractTimeValues(allText),
    decision_facts: [
      entry.facts_to_check_ko,
      ...scenarios.flatMap(scenario => list(scenario.decision_fact_ko)),
    ],
    normative_sources: sources.map(normalizeNormativeSource).filter(Boolean),
  };
  if (!derived.time_scope.length) derived.time_scope = ['현행 일반'];

  const explicitAxes = new Set();
  const values = {
    actor: explicitField(explicit, 'actor', 'actor_scope'),
    life_event: explicitField(explicit, 'life_event'),
    user_goal: explicitField(explicit, 'user_goal'),
    procedure_or_forum: explicitField(explicit, 'procedure_or_forum', 'forum_or_procedure'),
    legal_effect: explicitField(explicit, 'legal_effect'),
    time_scope: explicitField(explicit, 'time_scope'),
    decision_facts: explicitField(explicit, 'decision_facts', 'decision_fact_codes'),
    normative_sources: explicitField(explicit, 'normative_sources', 'normative_source_keys'),
  };
  for (const axis of Object.keys(AXIS_WEIGHTS)) {
    if (values[axis].length) explicitAxes.add(axis);
    else values[axis] = list(derived[axis]);
    values[axis] = [...new Set(values[axis].map(value => String(value).trim()).filter(Boolean))];
  }
  return {
    content_id: entry.content_id,
    title_ko: entry.title_ko,
    axes: values,
    explicit_axes: [...explicitAxes],
  };
}

function axisSimilarity(axis, left, right) {
  if (axis === 'normative_sources') return overlapSimilarity(left, right);
  if (axis === 'time_scope') return overlapSimilarity(left, right);
  return textSimilarity(left, right);
}

function hasCoreConflict(axis, left, right, leftExplicit, rightExplicit) {
  if (!coreAxes.has(axis) || !left.length || !right.length) return false;
  const similarity = axisSimilarity(axis, left, right);
  if (axis === 'time_scope') {
    if (leftExplicit && rightExplicit) return similarity === 0;
    const generic = normalizeKoreanText('현행 일반');
    const hasGeneric = [...left, ...right].some(value => normalizeKoreanText(value) === generic);
    return !hasGeneric && similarity === 0;
  }
  return leftExplicit && rightExplicit && similarity < 0.2;
}

function isDirectlyRelated(leftEntry, rightEntry) {
  return (leftEntry.related_content_ids || []).includes(rightEntry.content_id)
    || (rightEntry.related_content_ids || []).includes(leftEntry.content_id);
}

export function compareQuestionSignatures(leftSignature, rightSignature, options = {}) {
  const components = {};
  const conflicts = [];
  let score = 0;
  const rawSimilarities = Object.fromEntries(Object.keys(AXIS_WEIGHTS).map(axis => [
    axis,
    axisSimilarity(axis, leftSignature.axes[axis], rightSignature.axes[axis]),
  ]));
  const sourceSimilarity = overlapSimilarity(
    leftSignature.axes.normative_sources,
    rightSignature.axes.normative_sources,
  );
  const semanticContextSimilarity = textSimilarity(
    [leftSignature.axes.life_event, leftSignature.axes.legal_effect],
    [rightSignature.axes.life_event, rightSignature.axes.legal_effect],
  );
  const actorSimilarity = textSimilarity(leftSignature.axes.actor, rightSignature.axes.actor);
  const corroboratedSameRule = sourceSimilarity >= 0.5
    && actorSimilarity >= 0.6
    && semanticContextSimilarity >= 0.26;
  const corroboratedSameProcedure = rawSimilarities.life_event >= 0.75
    && rawSimilarities.procedure_or_forum >= 0.8
    && rawSimilarities.legal_effect >= 0.65
    && rawSimilarities.time_scope >= 0.5;
  const corroboratedFloors = {
    actor: 0.85,
    life_event: 0.85,
    user_goal: 0.9,
    procedure_or_forum: 0.9,
    legal_effect: 0.85,
    time_scope: 0.85,
    decision_facts: 0.75,
  };
  for (const [axis, weight] of Object.entries(AXIS_WEIGHTS)) {
    let similarity = rawSimilarities[axis];
    if ((corroboratedSameRule || corroboratedSameProcedure)
      && leftSignature.axes[axis].length && rightSignature.axes[axis].length
      && corroboratedFloors[axis]) {
      similarity = Math.max(similarity, corroboratedFloors[axis]);
    }
    const points = Math.round(weight * similarity * 100) / 100;
    components[axis] = {weight, similarity: Math.round(similarity * 1000) / 1000, points};
    score += points;
    if (hasCoreConflict(
      axis,
      leftSignature.axes[axis],
      rightSignature.axes[axis],
      leftSignature.explicit_axes.includes(axis),
      rightSignature.explicit_axes.includes(axis),
    )) conflicts.push(axis);
  }
  score = Math.round(score * 100) / 100;
  let classification = score >= SCORE_BANDS.duplicate_blocked
    ? 'duplicate_blocked'
    : score >= SCORE_BANDS.containment_review
      ? 'containment_review'
      : score >= SCORE_BANDS.related_required
        ? 'related_required'
        : 'distinct';
  if (conflicts.length && ['duplicate_blocked', 'containment_review'].includes(classification)) {
    classification = 'related_required';
  }
  const suggestedRelationship = classification === 'duplicate_blocked'
    ? 'merge_required'
    : isDirectlyRelated(options.leftEntry || {}, options.rightEntry || {})
      ? 'narrower_application'
      : classification === 'containment_review'
        ? 'containment_review'
        : classification === 'related_required'
          ? 'related'
          : 'distinct';
  return {
    score,
    classification,
    components,
    corroborated_same_rule: corroboratedSameRule,
    corroborated_same_procedure: corroboratedSameProcedure,
    actor_context_similarity: Math.round(actorSimilarity * 1000) / 1000,
    semantic_context_similarity: Math.round(semanticContextSimilarity * 1000) / 1000,
    core_conflicts: conflicts,
    suggested_relationship: suggestedRelationship,
  };
}

function knowledgeOf(value) {
  return value.knowledge || value;
}

export async function readPublicationDataset(filePath, metadata = {}) {
  const absolutePath = path.resolve(filePath);
  const value = JSON.parse(await readFile(absolutePath, 'utf8'));
  const knowledge = knowledgeOf(value);
  return {
    source_path: absolutePath,
    pr_number: metadata.pr_number ?? null,
    sources: knowledge.sources || [],
    rule_cards: knowledge.rule_cards || [],
    scenario_branches: knowledge.scenario_branches || [],
    content_entries: knowledge.content_entries || [],
  };
}

function pairKey(left, right) {
  return [left, right].sort().join('::');
}

export function auditSemanticOverlaps(currentDataset, candidateDatasets, options = {}) {
  const records = [];
  const seen = new Set();
  const prepare = dataset => dataset.content_entries.map(entry => ({
    dataset,
    entry,
    signature: deriveQuestionSignature(entry, dataset),
  }));
  const candidates = candidateDatasets.flatMap(prepare);
  const current = prepare(currentDataset);
  const comparisons = [
    ...candidates.flatMap(candidate => current.map(entry => [candidate, entry])),
    ...candidates.flatMap((left, index) => candidates.slice(index + 1).map(right => [left, right])),
  ];
  for (const [left, right] of comparisons) {
    if (left.dataset.source_path === right.dataset.source_path) continue;
    if (left.entry.content_id === right.entry.content_id) continue;
    const key = pairKey(left.entry.content_id, right.entry.content_id);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = compareQuestionSignatures(left.signature, right.signature, {
      leftEntry: left.entry,
      rightEntry: right.entry,
    });
    if (result.score < (options.minScore ?? 0)) continue;
    records.push({
      left: {content_id: left.entry.content_id, title_ko: left.entry.title_ko, pr_number: left.dataset.pr_number},
      right: {content_id: right.entry.content_id, title_ko: right.entry.title_ko, pr_number: right.dataset.pr_number},
      ...result,
    });
  }
  return records.sort((a, b) => b.score - a.score || a.left.content_id.localeCompare(b.left.content_id));
}

function decisionCovers(item, comparison, primaryPr) {
  const other = comparison.left.pr_number === primaryPr ? comparison.right : comparison.left;
  return (item.overlap_decisions || []).some(decision => (
    other.pr_number
      ? decision.target_pr === other.pr_number
      : decision.target_content_id === other.content_id
  ));
}

export function validateHighScoreDecisions(comparisons, queue, primaryPr) {
  if (!Number.isInteger(primaryPr) || primaryPr <= 0) return [];
  const item = queue?.items?.find(value => value.pr_number === primaryPr);
  if (!item) return [`production-queue에 #${primaryPr} 항목이 없습니다.`];
  const unresolved = [];
  for (const comparison of comparisons) {
    if (comparison.classification !== 'duplicate_blocked') continue;
    if (comparison.left.pr_number !== primaryPr && comparison.right.pr_number !== primaryPr) continue;
    if (!decisionCovers(item, comparison, primaryPr)) {
      const other = comparison.left.pr_number === primaryPr ? comparison.right : comparison.left;
      unresolved.push(`#${primaryPr}의 ${other.pr_number ? `#${other.pr_number}` : other.content_id} 중복(${comparison.score}점)이 overlap_decisions에 없습니다.`);
    }
  }
  return [...new Set(unresolved)];
}

export function validateAllHighScoreDecisions(comparisons, queue) {
  const byPr = new Map((queue?.items || []).map(item => [item.pr_number, item]));
  const unresolved = [];
  for (const comparison of comparisons) {
    if (comparison.classification !== 'duplicate_blocked') continue;
    const leftItem = byPr.get(comparison.left.pr_number);
    const rightItem = byPr.get(comparison.right.pr_number);
    let covered = false;
    if (leftItem && comparison.right.pr_number) {
      covered ||= (leftItem.overlap_decisions || []).some(value => value.target_pr === comparison.right.pr_number);
    }
    if (rightItem && comparison.left.pr_number) {
      covered ||= (rightItem.overlap_decisions || []).some(value => value.target_pr === comparison.left.pr_number);
    }
    if (leftItem && !comparison.right.pr_number) {
      covered ||= (leftItem.overlap_decisions || []).some(value => value.target_content_id === comparison.right.content_id);
    }
    if (rightItem && !comparison.left.pr_number) {
      covered ||= (rightItem.overlap_decisions || []).some(value => value.target_content_id === comparison.left.content_id);
    }
    if (!covered) unresolved.push(
      `${comparison.left.content_id} ↔ ${comparison.right.content_id} 중복(${comparison.score}점)이 overlap_decisions에 없습니다.`,
    );
  }
  return [...new Set(unresolved)];
}

export function renderKoreanReport(report) {
  const lines = [
    '공개 콘텐츠 의미중복 감사',
    `- 현재 정본: ${report.current_content_count}건`,
    `- 후보 콘텐츠: ${report.candidate_content_count}건`,
    `- 비교 결과: ${report.comparisons.length}건(최소 ${report.min_score}점)`,
    `- 중복 차단: ${report.summary.duplicate_blocked}건`,
    `- 포함관계 검토: ${report.summary.containment_review}건`,
    `- 관련 연결 필요: ${report.summary.related_required}건`,
    `- 미판정 고득점: ${report.unresolved_decisions.length}건`,
  ];
  for (const item of report.comparisons) {
    lines.push(`- [${item.classification}] ${item.score}점: ${item.left.title_ko} ↔ ${item.right.title_ko}`);
    if (item.core_conflicts.length) lines.push(`  핵심 충돌: ${item.core_conflicts.join(', ')}`);
  }
  for (const error of report.unresolved_decisions) lines.push(`- 실패: ${error}`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {topics: [], format: 'both', minScore: 50};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === '--topic') { options.topics.push(value); index += 1; }
    else if (name === '--current') { options.current = value; index += 1; }
    else if (name === '--production-queue') { options.queue = value; index += 1; }
    else if (name === '--pr-number') { options.prNumber = Number(value); index += 1; }
    else if (name === '--format') { options.format = value; index += 1; }
    else if (name === '--min-score') { options.minScore = Number(value); index += 1; }
    else if (name === '--json-out') { options.jsonOut = value; index += 1; }
    else if (name === '--prebuild') { options.prebuild = true; }
    else throw new Error(`알 수 없는 인수: ${name}`);
  }
  if (!options.topics.length && !options.prebuild) throw new Error('--topic 후보 경로가 하나 이상 필요합니다.');
  if (!['json', 'ko', 'both'].includes(options.format)) throw new Error('--format은 json, ko, both 중 하나여야 합니다.');
  if (!Number.isFinite(options.minScore) || options.minScore < 0 || options.minScore > 100) throw new Error('--min-score는 0~100이어야 합니다.');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentPath = path.resolve(options.current || path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'));
  const queuePath = path.resolve(options.queue || path.join(repoRoot, 'artifacts', 'publication', 'production-queue.json'));
  const queue = JSON.parse(await readFile(queuePath, 'utf8'));
  if (options.prebuild && !options.topics.length) {
    for (const item of queue.items) {
      if (item.change_mode !== 'new_topic') continue;
      const topicPath = path.resolve(repoRoot, item.topic_file);
      try {
        await access(topicPath);
        options.topics.push(topicPath);
      } catch {
        // 열린 PR의 topic 조각이 아직 이 브랜치에 없으면 통합 전 감사 대상이 아니다.
      }
    }
  }
  if (!options.topics.length) {
    console.log('공개 콘텐츠 의미중복 prebuild 게이트: 현재 브랜치에 통합 후보 topic이 없어 건너뜁니다.');
    return;
  }
  const queueByBasename = new Map(queue.items.map(item => [path.basename(item.topic_file), item.pr_number]));
  const candidates = [];
  for (const [index, topicPath] of options.topics.entries()) {
    const inferredPr = queueByBasename.get(path.basename(topicPath))
      || (options.topics.length === 1 && index === 0 ? options.prNumber : null);
    candidates.push(await readPublicationDataset(topicPath, {pr_number: inferredPr}));
  }
  const current = await readPublicationDataset(currentPath);
  const comparisons = auditSemanticOverlaps(current, candidates, {minScore: options.minScore});
  const unresolved = options.prebuild
    ? validateAllHighScoreDecisions(comparisons, queue)
    : validateHighScoreDecisions(comparisons, queue, options.prNumber);
  const report = {
    schema: 'rulelink_publication_semantic_overlap_report_v1',
    weights: AXIS_WEIGHTS,
    thresholds: SCORE_BANDS,
    min_score: options.minScore,
    pr_number: options.prNumber || null,
    current_content_count: current.content_entries.length,
    candidate_content_count: candidates.reduce((sum, dataset) => sum + dataset.content_entries.length, 0),
    summary: {
      duplicate_blocked: comparisons.filter(value => value.classification === 'duplicate_blocked').length,
      containment_review: comparisons.filter(value => value.classification === 'containment_review').length,
      related_required: comparisons.filter(value => value.classification === 'related_required').length,
      distinct: comparisons.filter(value => value.classification === 'distinct').length,
    },
    unresolved_decisions: unresolved,
    comparisons,
  };
  if (options.jsonOut) await writeFile(path.resolve(options.jsonOut), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (options.format === 'json' || options.format === 'both') console.log(JSON.stringify(report, null, 2));
  if (options.format === 'both') console.log('\n--- 한글 보고 ---');
  if (options.format === 'ko' || options.format === 'both') console.log(renderKoreanReport(report));
  if (unresolved.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(`공개 콘텐츠 의미중복 감사 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
