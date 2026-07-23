import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

import {auditConceptTermRelations} from '../src/lib/concept-terms.ts';

const baseline = JSON.parse(await readFile(
  new URL('../src/lib/publication-concept-identity-debt-baseline.json', import.meta.url),
  'utf8',
));

export function legacyConceptValidationOptions(concepts, snapshotId = '') {
  const conceptsById = new Map(concepts.map(concept => [concept.concept_id, concept]));
  const legacyDebt = new Map();
  if (snapshotId && snapshotId !== baseline.snapshot_id) return {legacyDebt};

  for (const debt of baseline.concepts) {
    const concept = conceptsById.get(debt.concept_id);
    if (!concept || conceptReceipt(concept) !== debt.concept_receipt) continue;
    legacyDebt.set(debt.concept_id, new Set(debt.expected_issues.map(item => item.code)));
  }
  return {legacyDebt};
}

export function auditLegacyConceptDebt(concepts, sources, snapshotId = '') {
  const issues = auditConceptTermRelations(concepts, sources);
  const conceptsById = new Map(concepts.map(concept => [concept.concept_id, concept]));
  const acknowledged = [];
  const baselineErrors = [];

  if (snapshotId && snapshotId !== baseline.snapshot_id) {
    return {acknowledged, baselineErrors, issues};
  }

  for (const debt of baseline.concepts) {
    const concept = conceptsById.get(debt.concept_id);
    if (!concept) {
      baselineErrors.push(`legacy debt 대상 개념이 없습니다: ${debt.concept_id}`);
      continue;
    }
    const receipt = conceptReceipt(concept);
    if (receipt !== debt.concept_receipt) {
      baselineErrors.push(`legacy debt 개념 영수증이 달라졌습니다: ${debt.concept_id}`);
      continue;
    }
    const actual = issues
      .filter(item => item.conceptIds.length === 1 && item.conceptIds[0] === debt.concept_id)
      .map(item => ({code: item.code, term: item.term ?? ''}))
      .sort(compareIssue);
    const expected = debt.expected_issues
      .map(item => ({code: item.code, term: item.term ?? ''}))
      .sort(compareIssue);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      baselineErrors.push(`legacy debt 탐지 결과가 기준선과 다릅니다: ${debt.concept_id}`);
      continue;
    }
    acknowledged.push(...actual.map(item => ({...item, concept_id: debt.concept_id})));
  }

  return {acknowledged, baselineErrors, issues};
}

export function conceptReceipt(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function conceptIdentityDebtBaseline() {
  return structuredClone(baseline);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function compareIssue(left, right) {
  return `${left.code}:${left.term}`.localeCompare(`${right.code}:${right.term}`, 'ko');
}
