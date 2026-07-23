import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comparisonBodySections,
  comparisonReadingContract,
  validateComparisonReadingContract,
  validateProvisionReadingCard,
} from './publication-comparison-reading-contract.mjs';

const source = {coordinate_id: 'coord.test.statute-0001'};
const pin = {source_coordinate_id: source.coordinate_id, paragraph_no: '제1항', authority_role: 'rule'};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matrixFixture(kind) {
  const subjects = [
    {subject_id: 'a', label_ko: '비교 대상 A'},
    {subject_id: 'b', label_ko: '비교 대상 B'},
  ];
  const matrix = {
    matrix_id: `matrix.${kind}`,
    kind,
    title_ko: '두 제도를 같은 기준으로 비교합니다',
    subjects,
    axes: comparisonReadingContract.required_axes[kind].map(([axis_key, title_ko]) => ({
      axis_key,
      title_ko,
      cells: subjects.map(subject => ({
        subject_id: subject.subject_id,
        value_ko: `${title_ko}에 관한 ${subject.label_ko}의 기준입니다.`,
        source_pinpoints: [pin],
      })),
    })),
    selection_paths: subjects.map(subject => ({
      path_id: `path.${subject.subject_id}`,
      question_ko: `${subject.label_ko}의 요건에 해당합니까?`,
      decision_facts_ko: [`${subject.label_ko}의 적용요건을 충족했는지 확인합니다.`],
      outcome: {
        type: 'subject_only',
        subject_ids: [subject.subject_id],
        explanation_ko: `${subject.label_ko} 경로를 먼저 확인합니다.`,
      },
      source_pinpoints: [pin],
    })),
    source_pinpoints: [pin],
  };
  return {
    content_id: `content.fixture-${kind}`,
    source_coordinate_ids: [source.coordinate_id],
    comparison_matrix: matrix,
    body_sections: comparisonBodySections(matrix),
  };
}

function knowledgeFor(entry, extra = {}) {
  return {
    sources: [source],
    content_entries: [entry],
    provision_reading_cards: [],
    ...extra,
  };
}

for (const kind of Object.keys(comparisonReadingContract.required_axes)) {
  test(`${kind} 비교행렬 양성 fixture는 8개 필수축과 도달 가능한 선택 경로를 만족한다`, () => {
    const entry = matrixFixture(kind);
    assert.equal(entry.comparison_matrix.axes.length, 8);
    assert.deepEqual(validateComparisonReadingContract(entry, knowledgeFor(entry)), []);
  });
}

const failureFixtures = [
  {
    name: '비교 대상이 2개보다 적으면 실패한다',
    mutate(entry) {
      entry.comparison_matrix.subjects.pop();
      for (const axis of entry.comparison_matrix.axes) axis.cells.pop();
      entry.comparison_matrix.selection_paths.pop();
      entry.body_sections = comparisonBodySections(entry.comparison_matrix);
    },
    expected: '2개 이상 4개 이하',
  },
  {
    name: '비교 대상 식별자가 중복되면 실패한다',
    mutate(entry) {
      entry.comparison_matrix.subjects[1].subject_id = 'a';
    },
    expected: 'subject_id가 중복',
  },
  {
    name: '지원하지 않는 비교 종류면 실패한다',
    mutate(entry) {
      entry.comparison_matrix.kind = 'unknown_kind';
    },
    expected: '지원하지 않는 비교 종류',
  },
  {
    name: '종류별 8개 필수축이 빠지면 실패한다',
    mutate(entry) {
      entry.comparison_matrix.axes.pop();
      entry.body_sections = comparisonBodySections(entry.comparison_matrix);
    },
    expected: '정해진 8개 축',
  },
  {
    name: '비교축에서 한 대상의 셀이 빠지면 실패한다',
    mutate(entry) {
      entry.comparison_matrix.axes[0].cells.pop();
    },
    expected: '모든 비교 대상',
  },
  {
    name: '존재하지 않는 공식 근거 위치면 실패한다',
    mutate(entry) {
      entry.comparison_matrix.axes[0].cells[0].source_pinpoints[0].source_coordinate_id = 'coord.missing';
    },
    expected: '존재하지 않는 공식 근거',
  },
  {
    name: '선택 경로로 도달하지 못하는 비교 대상이 있으면 실패한다',
    mutate(entry) {
      entry.comparison_matrix.selection_paths.pop();
    },
    expected: '도달할 수 없는 비교 대상',
  },
  {
    name: '정본 행렬과 호환 본문이 다르면 실패한다',
    mutate(entry) {
      entry.body_sections[0].paragraphs_ko[0] = '자의적으로 고친 본문';
    },
    expected: '결정론적 호환 산출물',
  },
];

assert.equal(failureFixtures.length, 8);
for (const fixture of failureFixtures) {
  test(fixture.name, () => {
    const entry = clone(matrixFixture('concept_boundary'));
    fixture.mutate(entry);
    const errors = validateComparisonReadingContract(entry, knowledgeFor(entry));
    assert.ok(errors.some(error => error.includes(fixture.expected)), errors.join('\n'));
  });
}

test('공유 조문 읽기 카드는 8개 독자 구획과 근거 위치를 가진다', () => {
  const card = {
    reading_card_id: 'reading.compensation-order',
    title_ko: '배상명령 조문 읽기',
    question_ko: '배상명령을 신청할 수 있습니까?',
    summary_ko: '대상 범죄부터 금지사유와 다음 행동까지 순서대로 확인합니다.',
    sections: comparisonReadingContract.provision_sections.map(([role, title_ko]) => ({
      section_id: `section.${role}`,
      role,
      title_ko,
      explanation_ko: `${title_ko}를 공식 조문에 따라 확인합니다.`,
      source_pinpoints: [pin],
    })),
    source_pinpoints: [pin],
  };
  assert.deepEqual(validateProvisionReadingCard(card, new Set([source.coordinate_id])), []);

  const entry = {...matrixFixture('remedy_path'), provision_reading_card_refs: [card.reading_card_id]};
  assert.deepEqual(validateComparisonReadingContract(entry, knowledgeFor(entry, {provision_reading_cards: [card]})), []);
});
