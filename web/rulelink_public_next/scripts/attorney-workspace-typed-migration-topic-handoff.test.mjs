import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {assembleKnowledge} from './compose-publication-knowledge.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const topicsRoot = path.join(repoRoot, 'artifacts', 'publication', 'topics');
const conceptsRoot = path.join(repoRoot, 'artifacts', 'publication', 'concepts');
const currentPath = path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
const boundaryId = 'content.why-attorney-workspace-is-gated';

const keepTyped = [
  'content.admin-appeal.eligibility-document-branch',
  'content.admin-appeal.application-preparation',
  'content.goods-different-from-advertisement-deadline',
  'content.digital-content-cancellation-exception',
  'content.refund-within-three-business-days',
  'content.paid-but-goods-not-supplied',
  'content.special-limited-acceptance-late-debt',
  'content.limited-acceptance-creditor-notice',
  'content.move-before-deposit-refund',
  'content.lease-registration-order-requirements',
  'content.freelancer-contract-worker-status',
  'content.verbal-delay-agreement-after-retirement',
  'content.retirement-pay-payment-deadline',
  'content.unfair-dismissal-remedy-three-months',
  'content.bank-transfer-loan-or-gift',
  'content.partial-repayment-allocation',
  'content.scope-of-guarantee-debt',
  'content.loan-and-guarantee-evidence-checklist',
  'content.shared-mobility-device-defect',
  'content.shared-mobility-public-road-defect',
  'content.shared-mobility-private-facility-defect',
  'content.shared-mobility-visible-defect-before-ride',
  'content.employee-caused-accident-employer-liability',
  'content.slip-fall-and-unsafe-facility-liability',
  'content.dog-bite-and-animal-keeper-liability',
  'content.consensual-divorce-cooling-period',
  'content.divorce-cooling-period-shortening-for-violence',
  'content.divorce-child-custody-support-parental-authority-agreement',
  'content.noncustodial-parent-child-visitation',
  'content.bank-account-seizure-and-collection-order',
  'content.property-disclosure-when-assets-unknown',
];

const needsScenarioHidden = [
  'content.three-month-inheritance-decision-period',
  'content.inheritance-renunciation-procedure',
  'content.renting-home-with-lease-registration',
  'content.accident-evidence-and-tort-limitation',
  'content.asset-transfer-harming-property-division',
  'content.when-payment-order-fits',
  'content.real-estate-reservation-deposit-meaning',
  'content.interim-payment-and-concurrent-closing',
  'content.seller-misses-title-transfer-date',
  'content.hidden-defect-after-purchase',
  'content.mistake-fraud-in-real-estate-contract',
  'content.real-estate-transaction-reporting-30-days',
  'content.broker-confirmation-explanation-checklist',
  'content.crime-victim-urgent-safety-and-support',
  'content.crime-evidence-preservation-first-steps',
  'content.how-to-file-criminal-complaint',
  'content.notice-of-prosecution-or-nonprosecution',
  'content.victim-case-information-notifications',
  'content.victim-access-to-trial-records',
  'content.compensation-order-application-deadline',
  'content.crime-victim-relief-fund-eligibility-deadline',
];

const removeCta = [
  'content.online-contract-evidence-checklist',
  'content.inheritance-assets-and-debts-checklist',
  'content.worker-status-evidence-checklist',
  'content.shared-mobility-accident-evidence-checklist',
  'content.why-attorney-workspace-is-gated',
];

const scenarioLessHidden = [
  'content.renting-home-with-lease-registration',
  'content.accident-evidence-and-tort-limitation',
  'content.crime-victim-relief-fund-eligibility-deadline',
];

const approvedCtaProjectionDigest = '2e8f67a9702e7961e9052a5c81830982b833f5f332dcbc7c9a6e8b665b209a77';

const keepRelationDigests = {
  'content.admin-appeal.application-preparation': 'f65acef6257914cbcb956dce947754d77be8b5d3fb3ba77803e4b2771271c26f',
  'content.admin-appeal.eligibility-document-branch': '6f919a6cf4ecf9a949579d23836c9ca29bf28c7c240124fbc308dd51bface63c',
  'content.bank-account-seizure-and-collection-order': '8b30ada802434d5eeb01ec80c70dacb1d87bcfbaaaeed64a7e32e923b5e7079b',
  'content.bank-transfer-loan-or-gift': 'ce9de3926ee121d37e0ea88d2262463ecdabb8fa5c64719301cf9770c2f391d4',
  'content.consensual-divorce-cooling-period': 'b5ece6538c898e83397f0a3301830dc34cf24377c4aec9dfc3f6b5694e23522c',
  'content.digital-content-cancellation-exception': 'f136d55849d1c40bbb94817888ad263eafe0ed91d3714382ecb300f432bebbd4',
  'content.divorce-child-custody-support-parental-authority-agreement': 'a7e1965a703fda61bbf3cca7a41b20618f07c65134f18e2a23c9b570fa5eb4f2',
  'content.divorce-cooling-period-shortening-for-violence': 'eab7fd954dbac9ef754c56b6cc40eca1e542d26545b7a1ec1a40436e8f31fe01',
  'content.dog-bite-and-animal-keeper-liability': 'd429ae6ee07f75cb6366ec74af12253aa39d7f2e28c5e9f1315932cb8d2cdc70',
  'content.employee-caused-accident-employer-liability': '5eb101b683631b658c7169c34a2c5599ef0f22397dfa5e1d5969a427e4ad5e78',
  'content.freelancer-contract-worker-status': '3ea7a3bb9d2e84ea4b23c1dc9961aef65c708a5e100e5647f942e1b262d42608',
  'content.goods-different-from-advertisement-deadline': 'c91fd35398b4a978e3a592c78439647db161f2c87be505a7cb2f6c66b18f219f',
  'content.lease-registration-order-requirements': '7e53774789f2b0279c8db1a87b2c700afc0cf070129c3aebe35e69e403879d6a',
  'content.limited-acceptance-creditor-notice': '2ee5ef5642b63d21324fd0046a1effbb66a2635fb8ad4d37f4d21f2caf5824c6',
  'content.loan-and-guarantee-evidence-checklist': 'b3e4e327c097cc30eeed6cfdf51373ccd8680d6ce8ada73f216149f0b6ed36ca',
  'content.move-before-deposit-refund': '00fb305aff9344470c6b3df12b09c34d9b3566e525c96f4fdd279eceb22f73d0',
  'content.noncustodial-parent-child-visitation': '8971ad325ebc613f586d37a464a566fde12e2639704c8475ab1fee823fc63f73',
  'content.paid-but-goods-not-supplied': 'd66983eedd57d3ed0796cd098edfeb93ce173bfd118934986e2d1c2732acd614',
  'content.partial-repayment-allocation': '9e6a5506b55d2a4754402d21194f1396af17fba430286e5bbdb4f3931d8e7a21',
  'content.property-disclosure-when-assets-unknown': '55f8c3ed38719b4a8457d83839e31ab5f7e64d30f5a58a2de25e82bb290cb931',
  'content.refund-within-three-business-days': 'ea6d8e9d72e995d415108df0c574df62c7b7d126e028966768f5a7fccf0c91ab',
  'content.retirement-pay-payment-deadline': '8384c4bd7a6e7a7ef2205c56a2da336a98eaaa8edf25d0a868f03a0c691249ed',
  'content.scope-of-guarantee-debt': '3700f7b7d6ac30f3aa200548fcb2841377b266ca20746c286484ab7f1fcc00ac',
  'content.shared-mobility-device-defect': '512505859f02e1eccf40f06acbb58b3a81f45579c4d8c3b4ba992659c0bffdea',
  'content.shared-mobility-private-facility-defect': '07dd4cb511e43a8e4f7597a7f3d22be89f95750d2b29eb4a7526b40710a81c69',
  'content.shared-mobility-public-road-defect': 'd48dfde55ebc061a4186481edf435b2867b9120711773cd3f1c3eae0ccfe3a03',
  'content.shared-mobility-visible-defect-before-ride': '3f0224f9b4759b150b51990fcb609de43bbc579f0a332176e94cb7b30f69975a',
  'content.slip-fall-and-unsafe-facility-liability': '4ba37e42c20d6cdcf1341d9c8cdedefbed7d42e776afa5c5302bf42cd73d41cb',
  'content.special-limited-acceptance-late-debt': '2ee5ef5642b63d21324fd0046a1effbb66a2635fb8ad4d37f4d21f2caf5824c6',
  'content.unfair-dismissal-remedy-three-months': 'd1fded1d3c7911a920237049ee3904536b09f2265abafe8ad2b0d41683ddd019',
  'content.verbal-delay-agreement-after-retirement': '9a00bf0e9a342ee4d1f215be4a00fb8ae63e760b6fc1db44e63b512353e42788',
};

const manifest = await readJson(path.join(topicsRoot, 'manifest.json'));
const current = await readJson(currentPath);
const topics = await Promise.all(manifest.topics.map(item => readJson(path.join(topicsRoot, item.file))));
const concepts = await Promise.all((manifest.concepts ?? []).map(item => readJson(path.join(conceptsRoot, item.file))));
const knowledge = assembleKnowledge(manifest, topics, concepts, {snapshotId: current.snapshot_id});
const candidateById = new Map(knowledge.content_entries.map(entry => [entry.content_id, entry]));
const scenarioById = new Map(knowledge.scenario_branches.map(scenario => [scenario.scenario_id, scenario]));
const classified = new Set([...keepTyped, ...needsScenarioHidden, ...removeCta]);

test('current는 legacy 57 원본 또는 typed 31 / hidden 26 최종 상태로만 존재한다', () => {
  assert.equal(keepTyped.length, 31);
  assert.equal(needsScenarioHidden.length, 21);
  assert.equal(removeCta.length, 5);
  assert.equal(classified.size, 57);

  const currentById = new Map(
    current.knowledge.content_entries.map(entry => [entry.content_id, entry]),
  );
  const legacyIds = current.knowledge.content_entries
    .filter(entry => entry.lawyer_workspace_entry)
    .map(entry => entry.content_id)
    .sort();
  const typedIds = current.knowledge.content_entries
    .filter(entry => entry.product_roles?.includes('concierge_entry'))
    .map(entry => entry.content_id)
    .sort();
  const classifiedIds = [...classified].sort();
  const keepIds = [...keepTyped].sort();

  const isLegacySource = (
    JSON.stringify(legacyIds) === JSON.stringify(classifiedIds)
    && typedIds.length === 0
    && classifiedIds.every(id => (
      !currentById.get(id)?.product_roles?.includes('concierge_entry')
    ))
  );
  const isTypedTarget = (
    JSON.stringify(legacyIds) === JSON.stringify(keepIds)
    && JSON.stringify(typedIds) === JSON.stringify(keepIds)
    && keepTyped.every(id => (
      currentById.get(id)?.product_roles?.includes('concierge_entry')
      && currentById.get(id)?.lawyer_workspace_entry
    ))
    && [...needsScenarioHidden, ...removeCta].every(id => (
      !currentById.get(id)?.product_roles?.includes('concierge_entry')
      && !currentById.get(id)?.lawyer_workspace_entry
    ))
  );

  assert.equal(
    Number(isLegacySource) + Number(isTypedTarget),
    1,
    'source legacy57 또는 target typed31/hidden26 중 정확히 하나여야 하며 부분 이관은 허용하지 않습니다.',
  );
});

test('합성 후보에는 검증된 typed CTA 31건만 남고 나머지 26건은 숨긴다', () => {
  const visible = knowledge.content_entries
    .filter(entry => entry.product_roles?.includes('concierge_entry') || entry.lawyer_workspace_entry)
    .map(entry => entry.content_id)
    .sort();
  assert.deepEqual(visible, [...keepTyped].sort());

  for (const id of [...needsScenarioHidden, ...removeCta]) {
    const entry = candidateById.get(id);
    assert.ok(entry, `${id}: 후보 콘텐츠가 존재해야 합니다.`);
    assert.ok(!entry.product_roles?.includes('concierge_entry'), `${id}: concierge_entry 숨김 실패`);
    assert.ok(!entry.lawyer_workspace_entry, `${id}: legacy 작업공간 링크 숨김 실패`);
  }
  for (const id of scenarioLessHidden) {
    assert.equal(candidateById.get(id)?.scenario_ids.length, 0, `${id}: scenario-less 정본 전제가 바뀌었습니다.`);
    assert.ok(!candidateById.get(id)?.lawyer_workspace_entry, `${id}: scenario 없이 CTA가 노출됐습니다.`);
  }
});

test('31건은 gate·scenario·decision facts·concierge boundary를 모두 닫는다', () => {
  assert.equal(Object.keys(keepRelationDigests).length, 31);
  for (const id of keepTyped) {
    const entry = candidateById.get(id);
    assert.ok(entry, `${id}: 후보 콘텐츠 누락`);
    assert.deepEqual(entry.product_roles, ['user_orientation', 'concierge_entry'], `${id}: product role`);
    assert.equal(entry.lawyer_workspace_entry?.href, '/ko/lawyer-workspace', `${id}: href`);
    assert.equal(entry.lawyer_workspace_entry?.audience, 'verified_attorney', `${id}: audience`);
    assert.equal(entry.lawyer_workspace_entry?.gate_id, 'verified_attorney_v1', `${id}: gate`);
    assert.ok(entry.lawyer_workspace_entry.decision_scenario_ids.length > 0, `${id}: decision scenario 없음`);
    assert.deepEqual(
      entry.lawyer_workspace_entry.decision_scenario_ids,
      entry.scenario_ids,
      `${id}: 전체 content scenario를 빠짐없이 decision scenario로 사용해야 합니다.`,
    );
    assert.deepEqual(
      entry.lawyer_workspace_entry.decision_facts_ko,
      entry.lawyer_workspace_entry.decision_scenario_ids.map(scenarioId => scenarioById.get(scenarioId)?.decision_fact_ko),
      `${id}: scenario에서 투영한 decision facts 불일치`,
    );
    const boundaryEdges = entry.related_edges.filter(edge => (
      edge.target_kind === 'content'
      && edge.target_id === boundaryId
      && edge.relation_type === 'concierge_boundary'
    ));
    assert.equal(boundaryEdges.length, 1, `${id}: concierge boundary는 정확히 하나여야 합니다.`);
    assert.equal(boundaryEdges[0].label_ko, '변호사 전용 작업공간의 자격 경계 확인');
    assert.deepEqual(entry.related_edges.at(-1), boundaryEdges[0], `${id}: CTA 경계 간선만 마지막에 추가해야 합니다.`);
    assert.equal(entry.related_content_ids.at(-1), boundaryId, `${id}: legacy projection도 경계 대상만 마지막에 추가해야 합니다.`);
    assert.deepEqual(
      entry.related_content_ids,
      entry.related_edges.filter(edge => edge.target_kind === 'content').map(edge => edge.target_id),
      `${id}: typed relation legacy projection`,
    );
    assert.equal(
      digest(nonBoundaryRelations(entry)),
      keepRelationDigests[id],
      `${id}: 기존 비경계 관계의 대상·순서·유형·라벨 회귀`,
    );
    assert.ok(candidateById.has(boundaryId), `${id}: boundary target 누락`);
  }
});

test('비경계 관계의 type·label·order·target 변조는 exact fixture를 통과하지 못한다', () => {
  const entry = candidateById.get('content.admin-appeal.eligibility-document-branch');
  const baseline = nonBoundaryRelations(entry);
  const expected = keepRelationDigests[entry.content_id];
  assert.equal(digest(baseline), expected);

  const mutations = [
    value => { value.related_edges[0].relation_type = 'comparison'; },
    value => { value.related_edges[0].label_ko += ' 변조'; },
    value => { value.related_edges.reverse(); value.related_content_ids.reverse(); },
    value => {
      value.related_edges[0].target_id = 'content.admin-appeal.documents-law-change';
      value.related_content_ids[0] = 'content.admin-appeal.documents-law-change';
    },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(baseline);
    mutate(value);
    assert.notEqual(digest(value), expected);
  }
});

test('13개 주제에서는 CTA 이관이 소유하는 필드와 경계 관계만 exact digest로 고정한다', () => {
  assert.equal(digest(ctaOwnedProjection(topics)), approvedCtaProjectionDigest);
});

test('일반 콘텐츠 개선은 CTA projection과 독립이고 CTA 소유 필드 변조는 차단한다', () => {
  const unrelatedChange = structuredClone(topics);
  findContent(unrelatedChange, 'content.real-estate-reservation-deposit-meaning').audience_situation_ko += ' 보강';
  assert.equal(digest(ctaOwnedProjection(unrelatedChange)), approvedCtaProjectionDigest);

  const mutations = [
    value => { findContent(value, keepTyped[0]).product_roles = ['user_orientation']; },
    value => { findContent(value, keepTyped[0]).lawyer_workspace_entry.href = '/ko/other'; },
    value => { findContent(value, keepTyped[0]).lawyer_workspace_entry.gate_id = 'unverified'; },
    value => { findContent(value, keepTyped[0]).lawyer_workspace_entry.decision_scenario_ids.reverse(); },
    value => {
      const entry = findContent(value, keepTyped[0]);
      entry.related_edges.find(edge => edge.relation_type === 'concierge_boundary').label_ko += ' 변조';
    },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(topics);
    mutate(value);
    assert.notEqual(digest(ctaOwnedProjection(value)), approvedCtaProjectionDigest);
  }
});

function ctaOwnedProjection(topicDocuments) {
  return topicDocuments.flatMap(topic => (topic.content_entries ?? [])
    .filter(entry => classified.has(entry.content_id))
    .map(entry => ({
      content_id: entry.content_id,
      product_roles: entry.product_roles ?? null,
      lawyer_workspace_entry: entry.lawyer_workspace_entry ?? null,
      boundary_related_content_indexes: (entry.related_content_ids ?? [])
        .flatMap((id, index) => id === boundaryId ? [index] : []),
      boundary_edges: (entry.related_edges ?? [])
        .flatMap((edge, index) => (
          edge.target_kind === 'content'
          && edge.target_id === boundaryId
          && edge.relation_type === 'concierge_boundary'
        ) ? [{index, ...edge}] : []),
    }))
    .sort((left, right) => left.content_id.localeCompare(right.content_id)));
}

function findContent(topicDocuments, contentId) {
  const entry = topicDocuments
    .flatMap(topic => topic.content_entries ?? [])
    .find(candidate => candidate.content_id === contentId);
  assert.ok(entry, `${contentId}: fixture 콘텐츠가 존재해야 합니다.`);
  return entry;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nonBoundaryRelations(entry) {
  return {
    related_content_ids: entry.related_content_ids.filter(id => id !== boundaryId),
    related_edges: entry.related_edges.filter(edge => !(
      edge.target_kind === 'content'
      && edge.target_id === boundaryId
      && edge.relation_type === 'concierge_boundary'
    )),
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
