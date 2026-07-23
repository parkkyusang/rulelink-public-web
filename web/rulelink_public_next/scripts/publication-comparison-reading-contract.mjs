import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const contract = JSON.parse(readFileSync(
  fileURLToPath(new URL('../src/lib/publication-comparison-reading-contract.json', import.meta.url)),
  'utf8',
));

const allowedAuthorityRoles = new Set(['rule', 'exception', 'procedure', 'effect', 'deadline', 'interpretation']);
const allowedOutcomes = new Set(contract.selection_outcomes);
const requiredProvisionRoles = contract.provision_sections.map(([role]) => role);

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function unique(items) {
  return new Set(items).size === items.length;
}

export function comparisonBodySections(matrix) {
  return matrix.axes.map(axis => ({
    heading_ko: axis.title_ko,
    paragraphs_ko: matrix.subjects.map(subject => {
      const cell = axis.cells.find(candidate => candidate.subject_id === subject.subject_id);
      if (!cell) throw new Error(`비교축 ${axis.axis_key}에 ${subject.subject_id} 값이 없습니다.`);
      return `${subject.label_ko} · ${cell.value_ko}`;
    }),
  }));
}

function validatePinpoints(pinpoints, label, sourceIds, errors, {minimum = 1} = {}) {
  if (!Array.isArray(pinpoints)) {
    errors.push(`${label}.source_pinpoints는 배열이어야 합니다.`);
    return;
  }
  if (pinpoints.length < minimum) errors.push(`${label}에는 근거 위치가 ${minimum}개 이상 필요합니다.`);
  for (const [index, pinpoint] of pinpoints.entries()) {
    const name = `${label}.source_pinpoints[${index}]`;
    if (!record(pinpoint)) {
      errors.push(`${name}는 객체여야 합니다.`);
      continue;
    }
    if (!sourceIds.has(pinpoint.source_coordinate_id)) errors.push(`${name}가 존재하지 않는 공식 근거를 참조합니다: ${String(pinpoint.source_coordinate_id)}`);
    if (!allowedAuthorityRoles.has(pinpoint.authority_role)) errors.push(`${name}.authority_role이 올바르지 않습니다.`);
    for (const key of ['paragraph_no', 'item_no', 'subitem_no', 'note_ko']) {
      if (pinpoint[key] !== undefined && !nonEmpty(pinpoint[key])) errors.push(`${name}.${key}는 비어 있지 않은 문자열이어야 합니다.`);
    }
  }
}

export function validateProvisionReadingCard(card, sourceIds, label = '조문 읽기 카드') {
  const errors = [];
  if (!record(card)) return [`${label}는 객체여야 합니다.`];
  for (const key of ['reading_card_id', 'title_ko', 'question_ko', 'summary_ko']) {
    if (!nonEmpty(card[key])) errors.push(`${label}.${key}가 필요합니다.`);
  }
  const sections = Array.isArray(card.sections) ? card.sections : [];
  if (!Array.isArray(card.sections)) errors.push(`${label}.sections는 배열이어야 합니다.`);
  const roles = sections.map(section => section?.role);
  if (JSON.stringify(roles) !== JSON.stringify(requiredProvisionRoles)) {
    errors.push(`${label}는 대상→절차 단계→범위→합의→금지→자료→다음 행동→근거 추적 순서의 8개 구획을 가져야 합니다.`);
  }
  for (const [index, section] of sections.entries()) {
    const name = `${label}.sections[${index}]`;
    if (!record(section)) {
      errors.push(`${name}는 객체여야 합니다.`);
      continue;
    }
    for (const key of ['section_id', 'title_ko', 'explanation_ko']) if (!nonEmpty(section[key])) errors.push(`${name}.${key}가 필요합니다.`);
    validatePinpoints(section.source_pinpoints, name, sourceIds, errors);
  }
  validatePinpoints(card.source_pinpoints, label, sourceIds, errors);
  return errors;
}

export function validateComparisonReadingContract(entry, knowledge = {}) {
  const errors = [];
  const matrix = entry?.comparison_matrix;
  const sources = Array.isArray(knowledge.sources) ? knowledge.sources : [];
  const sourceIds = new Set(sources.map(source => source?.coordinate_id).filter(nonEmpty));
  const entrySourceIds = new Set(Array.isArray(entry?.source_coordinate_ids) ? entry.source_coordinate_ids : []);
  const contentIds = new Set((knowledge.content_entries ?? []).map(item => item?.content_id).filter(nonEmpty));
  const sharedCards = Array.isArray(knowledge.provision_reading_cards) ? knowledge.provision_reading_cards : [];
  const sharedCardIds = new Set(sharedCards.map(card => card?.reading_card_id).filter(nonEmpty));

  for (const card of sharedCards) errors.push(...validateProvisionReadingCard(card, sourceIds, `공유 조문 읽기 카드 ${card?.reading_card_id ?? '(식별자 없음)'}`));

  if (entry?.provision_reading_card) {
    errors.push(...validateProvisionReadingCard(entry.provision_reading_card, sourceIds, '인라인 조문 읽기 카드'));
  }
  if (entry?.provision_reading_card_refs !== undefined) {
    if (!Array.isArray(entry.provision_reading_card_refs)) errors.push('provision_reading_card_refs는 배열이어야 합니다.');
    else {
      if (!unique(entry.provision_reading_card_refs)) errors.push('provision_reading_card_refs에 중복이 있습니다.');
      for (const ref of entry.provision_reading_card_refs) if (!sharedCardIds.has(ref)) errors.push(`존재하지 않는 조문 읽기 카드 참조입니다: ${String(ref)}`);
    }
  }

  if (!matrix) return errors;
  if (!record(matrix)) return [...errors, 'comparison_matrix는 객체여야 합니다.'];
  for (const key of ['matrix_id', 'title_ko']) if (!nonEmpty(matrix[key])) errors.push(`comparison_matrix.${key}가 필요합니다.`);

  const requiredAxes = contract.required_axes[matrix.kind]?.map(([key]) => key);
  if (!requiredAxes) errors.push(`지원하지 않는 비교 종류입니다: ${String(matrix.kind)}`);

  const subjects = Array.isArray(matrix.subjects) ? matrix.subjects : [];
  if (!Array.isArray(matrix.subjects) || subjects.length < 2 || subjects.length > 4) {
    errors.push('comparison_matrix.subjects는 2개 이상 4개 이하여야 합니다.');
  }
  const subjectIds = subjects.map(subject => subject?.subject_id);
  if (!unique(subjectIds)) errors.push('comparison_matrix.subjects의 subject_id가 중복됩니다.');
  for (const [index, subject] of subjects.entries()) {
    if (!record(subject) || !nonEmpty(subject.subject_id) || !nonEmpty(subject.label_ko)) {
      errors.push(`comparison_matrix.subjects[${index}]의 식별자와 한글 이름이 필요합니다.`);
    }
  }
  const subjectIdSet = new Set(subjectIds.filter(nonEmpty));

  const axes = Array.isArray(matrix.axes) ? matrix.axes : [];
  if (!Array.isArray(matrix.axes)) errors.push('comparison_matrix.axes는 배열이어야 합니다.');
  const axisKeys = axes.map(axis => axis?.axis_key);
  if (requiredAxes && JSON.stringify(axisKeys) !== JSON.stringify(requiredAxes)) {
    errors.push(`${matrix.kind} 비교행렬은 정해진 8개 축을 계약 순서대로 가져야 합니다.`);
  }
  if (!unique(axisKeys)) errors.push('comparison_matrix.axes의 axis_key가 중복됩니다.');
  for (const [axisIndex, axis] of axes.entries()) {
    const axisName = `comparison_matrix.axes[${axisIndex}]`;
    if (!record(axis) || !nonEmpty(axis.axis_key) || !nonEmpty(axis.title_ko)) {
      errors.push(`${axisName}의 축 식별자와 한글 제목이 필요합니다.`);
      continue;
    }
    const cells = Array.isArray(axis.cells) ? axis.cells : [];
    if (!Array.isArray(axis.cells)) errors.push(`${axisName}.cells는 배열이어야 합니다.`);
    const cellSubjectIds = cells.map(cell => cell?.subject_id);
    if (JSON.stringify(cellSubjectIds) !== JSON.stringify(subjectIds)) {
      errors.push(`${axisName}는 모든 비교 대상을 같은 순서로 한 번씩 설명해야 합니다.`);
    }
    for (const [cellIndex, cell] of cells.entries()) {
      const cellName = `${axisName}.cells[${cellIndex}]`;
      if (!record(cell) || !subjectIdSet.has(cell.subject_id) || !nonEmpty(cell.value_ko)) {
        errors.push(`${cellName}의 비교 대상과 설명이 올바르지 않습니다.`);
        continue;
      }
      validatePinpoints(cell.source_pinpoints, cellName, sourceIds, errors);
    }
    if (axis.source_pinpoints !== undefined) validatePinpoints(axis.source_pinpoints, axisName, sourceIds, errors);
  }

  const paths = Array.isArray(matrix.selection_paths) ? matrix.selection_paths : [];
  if (!Array.isArray(matrix.selection_paths) || paths.length === 0) errors.push('comparison_matrix.selection_paths는 하나 이상이어야 합니다.');
  const pathIds = paths.map(path => path?.path_id);
  if (!unique(pathIds)) errors.push('comparison_matrix.selection_paths의 path_id가 중복됩니다.');
  const reachedSubjects = new Set();
  for (const [index, path] of paths.entries()) {
    const name = `comparison_matrix.selection_paths[${index}]`;
    if (!record(path) || !nonEmpty(path.path_id) || !nonEmpty(path.question_ko)) {
      errors.push(`${name}의 식별자와 질문이 필요합니다.`);
      continue;
    }
    if (!Array.isArray(path.decision_facts_ko) || path.decision_facts_ko.length === 0 || path.decision_facts_ko.some(value => !nonEmpty(value))) {
      errors.push(`${name}.decision_facts_ko에는 실제 결정사실이 하나 이상 필요합니다.`);
    }
    if (!record(path.outcome) || !allowedOutcomes.has(path.outcome.type) || !nonEmpty(path.outcome.explanation_ko)) {
      errors.push(`${name}.outcome이 올바르지 않습니다.`);
    } else {
      const outcomeIds = Array.isArray(path.outcome.subject_ids) ? path.outcome.subject_ids : [];
      if (!unique(outcomeIds) || outcomeIds.some(id => !subjectIdSet.has(id))) errors.push(`${name}.outcome.subject_ids가 비교 대상을 올바르게 참조하지 않습니다.`);
      if (path.outcome.type === 'subject_only' && outcomeIds.length !== 1) errors.push(`${name}의 subject_only 결과에는 비교 대상 하나가 필요합니다.`);
      if (path.outcome.type === 'both' && outcomeIds.length < 2) errors.push(`${name}의 both 결과에는 비교 대상 둘 이상이 필요합니다.`);
      if (path.outcome.type === 'sequential' && outcomeIds.length < 2) errors.push(`${name}의 sequential 결과에는 순서가 있는 비교 대상 둘 이상이 필요합니다.`);
      if (path.outcome.type === 'other_path' && outcomeIds.length !== 0) errors.push(`${name}의 other_path 결과에는 비교 대상이 없어야 합니다.`);
      for (const id of outcomeIds) reachedSubjects.add(id);
      for (const id of path.outcome.next_content_ids ?? []) if (!contentIds.has(id)) errors.push(`${name}가 존재하지 않는 다음 콘텐츠를 참조합니다: ${String(id)}`);
    }
    validatePinpoints(path.source_pinpoints, name, sourceIds, errors);
  }
  for (const subjectId of subjectIdSet) if (!reachedSubjects.has(subjectId)) errors.push(`선택 경로로 도달할 수 없는 비교 대상입니다: ${subjectId}`);
  validatePinpoints(matrix.source_pinpoints, 'comparison_matrix', sourceIds, errors);

  const usedPinpoints = [
    ...(matrix.source_pinpoints ?? []),
    ...axes.flatMap(axis => [
      ...(axis?.source_pinpoints ?? []),
      ...(axis?.cells ?? []).flatMap(cell => cell?.source_pinpoints ?? []),
    ]),
    ...paths.flatMap(path => path?.source_pinpoints ?? []),
  ];
  for (const pinpoint of usedPinpoints) {
    if (record(pinpoint) && !entrySourceIds.has(pinpoint.source_coordinate_id)) {
      errors.push(`비교행렬 근거 ${String(pinpoint.source_coordinate_id)}가 content.source_coordinate_ids에 없습니다.`);
    }
  }

  try {
    const expected = comparisonBodySections(matrix);
    if (JSON.stringify(entry.body_sections) !== JSON.stringify(expected)) {
      errors.push('comparison_matrix가 정본이므로 body_sections는 결정론적 호환 산출물과 같아야 합니다.');
    }
  } catch (error) {
    errors.push(`comparison_matrix에서 body_sections를 만들 수 없습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
  return [...new Set(errors)];
}

export {contract as comparisonReadingContract};
