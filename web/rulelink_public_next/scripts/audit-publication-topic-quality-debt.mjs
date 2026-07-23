import {execFileSync} from 'node:child_process';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {normalizePublicRuleCopy} from '../src/lib/public-rule-presentation.ts';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const topicsDirectory = path.join(repoRoot, 'artifacts', 'publication', 'topics');
const topicsRepoDirectory = 'artifacts/publication/topics';
const baselinePath = path.join(appRoot, 'src', 'lib', 'publication-topic-quality-debt-baseline.json');
const baselineRepoPath = 'web/rulelink_public_next/src/lib/publication-topic-quality-debt-baseline.json';
const contentTypeContractPath = path.join(appRoot, 'src', 'lib', 'knowledge-content-types.json');

const contentTypeContract = JSON.parse(await readFile(contentTypeContractPath, 'utf8'));
const canonicalContentTypes = new Set(Object.keys(contentTypeContract.canonical));
const supportedTopicSchemas = new Set([
  'rulelink_public_knowledge_topic_v1',
  'rulelink_public_topic_handoff_v1',
]);

export const QUALITY_DEBT_METRICS = [
  'duplicate_rule_copy',
  'empty_audience_situation',
  'empty_related_content_ids',
  'nonstandard_content_type',
  'duplicate_key_point_body',
  'copied_title_or_slug_search_intent',
];

export function normalizeExactContentText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function measureTopicQualityDebt(topic) {
  const ruleCards = Array.isArray(topic?.rule_cards) ? topic.rule_cards : [];
  const entries = Array.isArray(topic?.content_entries) ? topic.content_entries : [];
  return {
    duplicate_rule_copy: ruleCards.filter(rule => (
      normalizePublicRuleCopy(String(rule?.proposition_ko ?? ''))
      === normalizePublicRuleCopy(String(rule?.norm?.legal_effect_ko ?? ''))
    )).length,
    empty_audience_situation: entries.filter(entry => !String(entry?.audience_situation_ko ?? '').trim()).length,
    empty_related_content_ids: entries.filter(entry => (
      !Array.isArray(entry?.related_content_ids) || entry.related_content_ids.length === 0
    )).length,
    nonstandard_content_type: entries.filter(entry => (
      !canonicalContentTypes.has(String(entry?.content_type ?? ''))
    )).length,
    duplicate_key_point_body: entries.filter(entry => {
      const keyPoints = new Set((Array.isArray(entry?.key_points_ko) ? entry.key_points_ko : [])
        .map(normalizeExactContentText)
        .filter(Boolean));
      const bodyParagraphs = (Array.isArray(entry?.body_sections) ? entry.body_sections : [])
        .flatMap(section => Array.isArray(section?.paragraphs_ko) ? section.paragraphs_ko : [])
        .map(normalizeExactContentText)
        .filter(Boolean);
      return bodyParagraphs.some(paragraph => keyPoints.has(paragraph));
    }).length,
    copied_title_or_slug_search_intent: entries.filter(entry => {
      const copiedFrom = new Set([entry?.title_ko, entry?.slug]
        .map(normalizeExactContentText)
        .filter(Boolean));
      return (Array.isArray(entry?.search_intents_ko) ? entry.search_intents_ko : [])
        .map(normalizeExactContentText)
        .filter(Boolean)
        .some(intent => copiedFrom.has(intent));
    }).length,
  };
}

export function sumQualityDebt(topicMeasurements) {
  const totals = Object.fromEntries(QUALITY_DEBT_METRICS.map(metric => [metric, 0]));
  for (const measurement of Object.values(topicMeasurements)) {
    for (const metric of QUALITY_DEBT_METRICS) totals[metric] += measurement[metric] ?? 0;
  }
  return totals;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateBaselineShape(baseline, label) {
  const errors = [];
  if (baseline?.schema !== 'rulelink_publication_topic_quality_debt_baseline_v1') {
    errors.push(`${label}: 지원하지 않는 기준선 스키마입니다.`);
    return errors;
  }
  if (!baseline.topics || typeof baseline.topics !== 'object' || Array.isArray(baseline.topics)) {
    errors.push(`${label}: topics 객체가 필요합니다.`);
    return errors;
  }
  for (const [file, entry] of Object.entries(baseline.topics)) {
    if (!/^[a-z0-9-]+\.json$/u.test(file)) errors.push(`${label}: 주제 파일명이 올바르지 않습니다: ${file}`);
    if (typeof entry?.topic_id !== 'string' || !entry.topic_id.trim()) errors.push(`${label}: ${file}의 topic_id가 필요합니다.`);
    for (const metric of QUALITY_DEBT_METRICS) {
      if (!isNonNegativeInteger(entry?.[metric])) errors.push(`${label}: ${file}.${metric}은 0 이상의 정수여야 합니다.`);
    }
  }
  const expectedTotals = sumQualityDebt(baseline.topics);
  for (const metric of QUALITY_DEBT_METRICS) {
    if (baseline.totals?.[metric] !== expectedTotals[metric]) {
      errors.push(`${label}: totals.${metric}이 주제별 합계와 다릅니다.`);
    }
  }
  return errors;
}

export function auditTopicQualityDebt({topics, baseline, previousBaseline = null, baseTopics = null}) {
  const errors = [
    ...validateBaselineShape(baseline, '현재 기준선'),
    ...(previousBaseline ? validateBaselineShape(previousBaseline, '이전 기준선') : []),
  ];
  if (errors.length) return {errors: [...new Set(errors)], measurements: {}, totals: {}};

  if (previousBaseline) {
    for (const [file, previous] of Object.entries(previousBaseline.topics)) {
      const current = baseline.topics[file];
      if (!current) {
        errors.push(`기준선에서 기존 주제를 제거할 수 없습니다: ${file}`);
        continue;
      }
      for (const metric of QUALITY_DEBT_METRICS) {
        if (current[metric] > previous[metric]) {
          errors.push(`기준선 상향 금지: ${file}.${metric} ${previous[metric]} -> ${current[metric]}`);
        }
      }
    }
    for (const [file, current] of Object.entries(baseline.topics)) {
      if (previousBaseline.topics[file]) continue;
      for (const metric of QUALITY_DEBT_METRICS) {
        if (current[metric] !== 0) errors.push(`새 주제 기준선은 0이어야 합니다: ${file}.${metric}=${current[metric]}`);
      }
    }
  }

  const measurements = {};
  const baseMeasurements = baseTopics
    ? Object.fromEntries(Object.entries(baseTopics).map(([file, topic]) => [file, measureTopicQualityDebt(topic)]))
    : null;
  for (const [file, topic] of Object.entries(topics)) {
    const measured = measureTopicQualityDebt(topic);
    measurements[file] = {topic_id: topic.topic_id ?? topic.topic_hubs?.[0]?.hub_id ?? '', ...measured};
    const allowed = baseline.topics[file];
    if (!allowed) {
      for (const metric of QUALITY_DEBT_METRICS) {
        if (measured[metric] !== 0) errors.push(`새 주제 품질부채 금지: ${file}.${metric}=${measured[metric]}`);
        if (baseMeasurements?.[file]?.[metric] !== undefined && baseMeasurements[file][metric] !== 0) {
          errors.push(`기준선 미등록 주제의 기준 SHA 실제값은 0이어야 합니다: ${file}.${metric}=${baseMeasurements[file][metric]}`);
        }
      }
      continue;
    }
    if (allowed.topic_id !== measurements[file].topic_id) {
      errors.push(`${file}의 topic_id가 기준선과 다릅니다: ${measurements[file].topic_id}`);
    }
    for (const metric of QUALITY_DEBT_METRICS) {
      if (measured[metric] > allowed[metric]) {
        errors.push(`기존 주제 품질부채 증가 금지: ${file}.${metric} ${allowed[metric]} -> ${measured[metric]}`);
      }
    }
    if (baseMeasurements) {
      const baseMeasured = baseMeasurements[file];
      if (!baseMeasured) {
        for (const metric of QUALITY_DEBT_METRICS) {
          if (measured[metric] !== 0) errors.push(`기준 SHA에 없던 새 주제 품질부채 금지: ${file}.${metric}=${measured[metric]}`);
        }
      } else {
        for (const metric of QUALITY_DEBT_METRICS) {
          if (baseMeasured[metric] > allowed[metric]) {
            errors.push(`기준 SHA 실제값이 정적 상한을 초과합니다: ${file}.${metric} ${baseMeasured[metric]} > ${allowed[metric]}`);
          }
          if (measured[metric] > baseMeasured[metric]) {
            errors.push(`개선된 품질부채 되돌림 금지: ${file}.${metric} ${baseMeasured[metric]} -> ${measured[metric]}`);
          }
        }
      }
    }
  }
  for (const file of Object.keys(baseline.topics)) {
    if (!topics[file]) errors.push(`기준선 주제 원본을 찾을 수 없습니다: ${file}`);
  }

  return {
    errors: [...new Set(errors)],
    measurements,
    baseMeasurements,
    totals: sumQualityDebt(measurements),
  };
}

export async function loadPublicationTopics() {
  const topics = {};
  for (const file of (await readdir(topicsDirectory)).sort((a, b) => a.localeCompare(b, 'en'))) {
    if (!/^[a-z0-9-]+\.json$/u.test(file) || file === 'manifest.json') continue;
    const topic = JSON.parse(await readFile(path.join(topicsDirectory, file), 'utf8'));
    if (supportedTopicSchemas.has(topic?.schema)) topics[file] = topic;
  }
  return topics;
}

export function loadPublicationTopicsAtRef(baseRef) {
  if (!baseRef) return null;
  const listed = execFileSync('git', ['ls-tree', '-r', '--name-only', baseRef, '--', topicsRepoDirectory], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const topics = {};
  for (const repoPath of listed.split(/\r?\n/u).filter(Boolean).sort((a, b) => a.localeCompare(b, 'en'))) {
    const file = path.posix.basename(repoPath);
    if (!/^[a-z0-9-]+\.json$/u.test(file) || file === 'manifest.json') continue;
    const topic = JSON.parse(execFileSync('git', ['show', `${baseRef}:${repoPath}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    if (supportedTopicSchemas.has(topic?.schema)) topics[file] = topic;
  }
  return topics;
}

function readPreviousBaseline(baseRef) {
  if (!baseRef) return null;
  try {
    const content = execFileSync('git', ['show', `${baseRef}:${baselineRepoPath}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(content);
  } catch (error) {
    const message = String(error?.stderr ?? error?.message ?? '');
    if (/does not exist|exists on disk, but not in|Path .* does not exist/iu.test(message)) return null;
    throw new Error(`이전 기준선 조회 실패: ${message.trim() || baseRef}`);
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? '' : '';
}

async function main() {
  const args = process.argv.slice(2);
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const topics = await loadPublicationTopics();
  const baseRef = option(args, '--base');
  const previousBaseline = readPreviousBaseline(baseRef);
  const baseTopics = loadPublicationTopicsAtRef(baseRef);
  const result = auditTopicQualityDebt({topics, baseline, previousBaseline, baseTopics});
  if (result.errors.length) {
    console.error(`주제 품질부채 래칫 실패: ${result.errors.length}건`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`주제 품질부채 래칫 통과: ${Object.keys(result.measurements).length}개 주제`);
  console.log(`현재 main 주제 원본 합계: 법리문장 중복 ${result.totals.duplicate_rule_copy} / 대상상황 공백 ${result.totals.empty_audience_situation} / 관련콘텐츠 공백 ${result.totals.empty_related_content_ids} / 비표준 유형 ${result.totals.nonstandard_content_type} / 핵심요점-본문 중복 ${result.totals.duplicate_key_point_body} / 제목·슬러그 검색어 복사 ${result.totals.copied_title_or_slug_search_intent}`);
  console.log('운영 snapshot 021 감사값: 법리문장 중복 119 / 대상상황 공백 71 / 관련콘텐츠 공백 42 / 비표준 유형 8 / 핵심요점-본문 중복 0 / 제목·슬러그 검색어 복사 71');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch(error => {
    console.error(`주제 품질부채 래칫 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
