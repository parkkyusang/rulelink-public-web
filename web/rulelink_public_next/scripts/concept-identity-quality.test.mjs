import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  auditConceptIdentityPolicyRegistry,
  auditConceptTermRelations,
  conceptIdentityPolicyRegistry,
  conceptTermValidationIssueKey,
  validateConceptTermRelations,
} from '../src/lib/concept-terms.ts';
import {
  auditLegacyConceptDebt,
  conceptIdentityPolicyReceipt,
  legacyConceptValidationOptions,
  validateConceptIdentityPolicyReceipt,
} from './concept-identity-governance.mjs';
import {
  validatePublicationConceptIdentity,
} from './validate-publication-concept-identity.mjs';

const root = process.cwd();
const fixture = JSON.parse(await read('scripts/fixtures/concept-identity-quality.json'));
const matcherFixture = JSON.parse(await read('scripts/fixtures/concept-term-matcher.json'));
const currentBundle = JSON.parse(await read('../../artifacts/publication/current/bundle.json'));

test('개념 정체성 편집 정책은 버전형 레지스트리와 결정론적 영수증으로 고정한다', () => {
  assert.deepEqual(auditConceptIdentityPolicyRegistry(conceptIdentityPolicyRegistry), []);
  assert.equal(
    conceptIdentityPolicyReceipt(conceptIdentityPolicyRegistry),
    conceptIdentityPolicyRegistry.policy_receipt,
  );
  assert.ok(conceptIdentityPolicyRegistry.terms.every(item => (
    item.meaning_domain.length > 0 && item.reason_ko.length > 0
  )));
  assert.ok(conceptIdentityPolicyRegistry.terms
    .filter(item => ['forbidden_alias_pair', 'decision_fact_not_alias'].includes(item.policy_kind))
    .every(item => item.target_preferred_term_ko?.length > 0));

  const duplicate = structuredClone(conceptIdentityPolicyRegistry);
  duplicate.terms.push({
    ...duplicate.terms[0],
    term_ko: ` ${duplicate.terms[0].term_ko} `,
  });
  assert.match(
    auditConceptIdentityPolicyRegistry(duplicate).join('\n'),
    /정규화 기준으로 중복/,
  );
});

test('정책 내용이나 버전이 바뀌고 영수증이 그대로면 명령 검증 경로가 실패한다', async () => {
  const staleVersion = structuredClone(conceptIdentityPolicyRegistry);
  staleVersion.policy_version = fixture.stale_policy_receipt.next_policy_version;

  const staleTerms = structuredClone(conceptIdentityPolicyRegistry);
  staleTerms.terms.push(fixture.stale_policy_receipt.added_term);

  for (const staleRegistry of [staleVersion, staleTerms]) {
    assert.notEqual(
      conceptIdentityPolicyReceipt(staleRegistry),
      staleRegistry.policy_receipt,
    );
    assert.throws(
      () => validateConceptIdentityPolicyReceipt(staleRegistry),
      /정책 영수증이 실제 정책 내용과 다릅니다/,
    );
    await assert.rejects(
      validatePublicationConceptIdentity({
        bundlePath: path.join(root, '../../artifacts/publication/current/bundle.json'),
        policyRegistry: staleRegistry,
      }),
      /정책 영수증이 실제 정책 내용과 다릅니다/,
    );
  }
});

test('상속인·법정상속인·공동상속인·피상속인은 네 canonical concept 정체성으로 검증한다', () => {
  assert.deepEqual(
    matcherFixture.concepts.map(concept => concept.preferred_term_ko),
    ['상속인', '법정상속인', '공동상속인', '피상속인'],
  );
  assert.equal(new Set(matcherFixture.concepts.map(concept => concept.concept_id)).size, 4);
  assert.doesNotThrow(() => validateConceptTermRelations(matcherFixture.concepts, matcherFixture.sources));
});

test('snapshot 022의 잘못 합쳐진 상속인 별칭은 정확한 legacy debt로만 허용한다', () => {
  const concepts = currentBundle.knowledge.concept_cards;
  const sources = currentBundle.knowledge.sources;
  const audit = auditLegacyConceptDebt(concepts, sources, currentBundle.snapshot_id);
  const legacyOptions = legacyConceptValidationOptions(concepts, currentBundle.snapshot_id);

  assert.deepEqual(audit.baselineErrors, []);
  assert.deepEqual(
    audit.acknowledged.map(item => [item.concept_id, item.code, item.term]),
    [
      ['concept.kr.inheritance.legal_heir', 'protected-canonical-term-as-alias', '공동상속인'],
      ['concept.kr.inheritance.legal_heir', 'protected-canonical-term-as-alias', '법정상속인'],
    ],
  );
  assert.doesNotThrow(() => validateConceptTermRelations(
    concepts,
    sources,
    legacyOptions,
  ));
  const allowedKeys = legacyOptions.legacyDebt.get('concept.kr.inheritance.legal_heir');
  assert.deepEqual(
    [...allowedKeys].sort(),
    [
      conceptTermValidationIssueKey('protected-canonical-term-as-alias', '공동상속인'),
      conceptTermValidationIssueKey('protected-canonical-term-as-alias', '법정상속인'),
    ].sort(),
  );
  assert.equal(allowedKeys.has('protected-canonical-term-as-alias'), false);

  const wrongTerm = structuredClone(
    concepts.find(concept => concept.concept_id === 'concept.kr.inheritance.legal_heir'),
  );
  wrongTerm.aliases_ko = ['피상속인'];
  assert.throws(
    () => validateConceptTermRelations([wrongTerm], sources, legacyOptions),
    /피상속인/,
  );
  assert.throws(
    () => validateConceptTermRelations(
      concepts,
      sources,
      legacyConceptValidationOptions(concepts),
    ),
    /별도 canonical concept 정체성/,
  );

  const modified = structuredClone(concepts);
  modified.find(concept => concept.concept_id === 'concept.kr.inheritance.legal_heir').version = '1.0.1';
  assert.throws(
    () => validateConceptTermRelations(
      modified,
      sources,
      legacyConceptValidationOptions(modified, currentBundle.snapshot_id),
    ),
    /별도 canonical concept 정체성/,
  );
  assert.throws(
    () => validateConceptTermRelations(
      concepts,
      sources,
      legacyConceptValidationOptions(concepts, 'kr-knowledge-core-20260724-023'),
    ),
    /별도 canonical concept 정체성/,
  );
});

test('narrower·broader·related는 존재하는 대상을 역방향으로 연결하고 자기참조를 금지한다', () => {
  const sources = matcherFixture.sources;

  const missingTarget = structuredClone(matcherFixture.concepts);
  missingTarget[0].term_relations.find(item => item.relation === 'narrower').target_concept_id = 'concept.missing';
  assert.ok(issueCodes(missingTarget, sources).has('semantic-relation-target-not-found'));

  const missingInverse = structuredClone(matcherFixture.concepts);
  missingInverse[1].term_relations = [];
  assert.ok(issueCodes(missingInverse, sources).has('semantic-relation-missing-inverse'));

  const missingRelatedInverse = structuredClone(matcherFixture.concepts);
  missingRelatedInverse[3].term_relations = [];
  assert.ok(issueCodes(missingRelatedInverse, sources).has('semantic-relation-missing-inverse'));

  const selfReference = structuredClone(matcherFixture.concepts);
  const relation = selfReference[0].term_relations.find(item => item.relation === 'narrower');
  relation.target_concept_id = selfReference[0].concept_id;
  relation.term_ko = selfReference[0].preferred_term_ko;
  assert.ok(issueCodes(selfReference, sources).has('semantic-relation-self-reference'));
});

test('narrower·broader 계층 순환은 역방향 쌍이 완전해도 실패한다', () => {
  const sources = [{coordinate_id: 'source.hierarchy'}];
  const concepts = [
    hierarchyConcept('concept.a', '개념 가', 'concept.b', '개념 나', 'concept.c', '개념 다'),
    hierarchyConcept('concept.b', '개념 나', 'concept.c', '개념 다', 'concept.a', '개념 가'),
    hierarchyConcept('concept.c', '개념 다', 'concept.a', '개념 가', 'concept.b', '개념 나'),
  ];

  assert.ok(issueCodes(concepts, sources).has('semantic-relation-cycle'));
  assert.throws(
    () => validateConceptTermRelations(concepts, sources),
    /계층에 순환/,
  );
});

test('원본은 전역 별칭으로 금지하고 법역을 한정한 채무 원금 정체성은 허용한다', () => {
  assert.ok(issueCodes([fixture.polysemy.invalid], []).has('ambiguous-global-alias'));
  assert.doesNotThrow(() => validateConceptTermRelations([fixture.polysemy.valid], []));
});

test('노동 후속 개념은 임금 정체성과 근로자성 판단자료를 별칭으로 합치지 않는다', () => {
  for (const item of fixture.labor_alias_boundaries) {
    const issues = auditConceptTermRelations([item.concept], [])
      .filter(issue => issue.code === item.expected_code);
    assert.deepEqual(issues.map(issue => issue.term), item.expected_terms, item.name);
  }
});

test('노동 별칭 경계는 대상 개념 쌍에만 적용하고 정상적인 제도 개념 별칭은 허용한다', () => {
  assert.doesNotThrow(() => validateConceptTermRelations(
    fixture.allowed_scoped_aliases.concepts,
    fixture.allowed_scoped_aliases.sources,
  ));
});

function issueCodes(concepts, sources) {
  return new Set(auditConceptTermRelations(concepts, sources).map(item => item.code));
}

function hierarchyConcept(conceptId, preferred, narrowerId, narrowerTerm, broaderId, broaderTerm) {
  return {
    concept_id: conceptId,
    preferred_term_ko: preferred,
    aliases_ko: [],
    term_relations: [
      {
        term_ko: narrowerTerm,
        relation: 'narrower',
        target_concept_id: narrowerId,
        source_coordinate_ids: ['source.hierarchy'],
      },
      {
        term_ko: broaderTerm,
        relation: 'broader',
        target_concept_id: broaderId,
        source_coordinate_ids: ['source.hierarchy'],
      },
    ],
  };
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}
