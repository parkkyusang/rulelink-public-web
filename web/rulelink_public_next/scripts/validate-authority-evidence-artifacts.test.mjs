import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAuthorityEvidenceFixtures,
  producerContractPayload,
  producerContractFixture,
  rawSha256,
} from './authority-evidence-test-fixtures.mjs';
import {
  AUTHORITY_EVIDENCE_PRODUCER_CONTRACT_SHA256,
  AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY,
  AUTHORITY_EVIDENCE_SOURCE_FILENAMES,
  AUTHORITY_EVIDENCE_VERIFICATION_CONTRACT,
  AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1,
  authorityEvidenceSiblingPath,
  validateAuthorityCitationAuditEvidence,
  validateAuthorityDbRegenerationEvidence,
  validateAuthorityEvidenceArtifact,
} from './validate-authority-evidence-artifacts.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const upstreamPrHeads = {
  'source-maintenance.db-pr-4': 'a94721e9ce8835f4062c4938fb60cf77650b3b1d',
  'source-maintenance.db-pr-3-p2': '9a92498bf51ec99ffa6687aa4c2145edb7673ccb',
};

test('public consumer의 producer v1 계약은 source-maintenance가 내보낸 contract fixture와 exact 일치한다', () => {
  assert.deepEqual(AUTHORITY_PUBLIC_EVIDENCE_CONTRACT_V1, producerContractFixture);
  assert.equal(rawSha256(producerContractPayload), AUTHORITY_EVIDENCE_PRODUCER_CONTRACT_SHA256);
});

test('producer가 만든 approved DB 증거와 실제 exact table 두 파일을 함께 재검증한다', async () => {
  const fixtures = createAuthorityEvidenceFixtures();
  assert.deepEqual(
    validateAuthorityDbRegenerationEvidence(fixtures.authorityDbValue, {upstreamPrHeads}),
    [],
  );
  const result = await validateAuthorityEvidenceArtifact({
    artifactId: 'authority-db-regenerated',
    payload: fixtures.authorityDbPayload,
    loadSiblingArtifact: fixtures.loadSiblingArtifact,
    context: {upstreamPrHeads},
  });
  assert.equal(result.semantic_contract, AUTHORITY_EVIDENCE_VERIFICATION_CONTRACT);
  assert.equal(
    result.referenced_artifacts[AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave1],
    fixtures.authorityDbValue.waves[0].exact_table_sha256,
  );
  assert.equal(
    result.referenced_artifacts[AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave2],
    fixtures.authorityDbValue.waves[1].exact_table_sha256,
  );
});

test('producer가 만든 approved citation 증거를 DB·exact table·full audit 원문까지 폐쇄 검증한다', async () => {
  const fixtures = createAuthorityEvidenceFixtures();
  assert.deepEqual(
    validateAuthorityCitationAuditEvidence(fixtures.citationValue, fixtures.authorityDbValue),
    [],
  );
  const result = await validateAuthorityEvidenceArtifact({
    artifactId: 'authority-citation-audit-approved',
    payload: fixtures.citationPayload,
    loadSiblingArtifact: fixtures.loadSiblingArtifact,
    context: {upstreamPrHeads},
  });
  assert.equal(result.value.approval.approved, true);
  assert.equal(
    result.referenced_artifacts[AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citationAudit],
    fixtures.citationValue.citation_full_audit.sha256,
  );
});

test('같은 producer가 만든 candidate_unapproved 증거는 public gate에서 거부한다', async () => {
  const fixtures = createAuthorityEvidenceFixtures();
  await assert.rejects(
    validateAuthorityEvidenceArtifact({
      artifactId: 'authority-db-regenerated',
      payload: fixtures.candidateDbPayload,
      loadSiblingArtifact: fixtures.loadSiblingArtifact,
      context: {upstreamPrHeads},
    }),
    /approved|approval_gates|verified_regenerated/u,
  );
});

test('exact table의 실제 바이트가 증거 내부 해시와 다르면 즉시 거부한다', async () => {
  const fixtures = createAuthorityEvidenceFixtures();
  const originalLoader = fixtures.loadSiblingArtifact;
  await assert.rejects(
    validateAuthorityEvidenceArtifact({
      artifactId: 'authority-db-regenerated',
      payload: fixtures.authorityDbPayload,
      loadSiblingArtifact: async filename => (
        filename === AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave1
          ? Buffer.from('{"schema":"forged"}\n', 'utf8')
          : originalLoader(filename)
      ),
      context: {upstreamPrHeads},
    }),
    /실제 바이트 SHA-256/u,
  );
});

test('조작 exact table에 맞춰 evidence 해시까지 바꿔도 행 재산출 검증을 우회하지 못한다', async () => {
  const fixtures = createAuthorityEvidenceFixtures();
  const dbValue = clone(fixtures.authorityDbValue);
  const wave1 = JSON.parse(
    (await fixtures.loadSiblingArtifact(AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave1)).toString('utf8'),
  );
  wave1.units[0].text_ko = '조작된 문언';
  const forgedWave = Buffer.from(`${JSON.stringify(wave1, null, 2)}\n`, 'utf8');
  dbValue.waves[0].exact_table_sha256 = rawSha256(forgedWave);
  const forgedDb = Buffer.from(`${JSON.stringify(dbValue, null, 2)}\n`, 'utf8');
  await assert.rejects(
    validateAuthorityEvidenceArtifact({
      artifactId: 'authority-db-regenerated',
      payload: forgedDb,
      loadSiblingArtifact: async filename => (
        filename === AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave1
          ? forgedWave
          : fixtures.loadSiblingArtifact(filename)
      ),
      context: {upstreamPrHeads},
    }),
    /text_hash가 실제 text_ko와 다릅니다/u,
  );
});

test('citation full audit 파일의 bytes 또는 재산출 수치가 다르면 거부한다', async () => {
  const fixtures = createAuthorityEvidenceFixtures();
  const audit = JSON.parse(
    (await fixtures.loadSiblingArtifact(AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citationAudit)).toString('utf8'),
  );
  audit.empty_text_unit_count = 0;
  const forgedAudit = Buffer.from(`${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  const citation = clone(fixtures.citationValue);
  citation.citation_full_audit.sha256 = rawSha256(forgedAudit);
  const forgedCitation = Buffer.from(`${JSON.stringify(citation, null, 2)}\n`, 'utf8');
  await assert.rejects(
    validateAuthorityEvidenceArtifact({
      artifactId: 'authority-citation-audit-approved',
      payload: forgedCitation,
      loadSiblingArtifact: async filename => (
        filename === AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citationAudit
          ? forgedAudit
          : fixtures.loadSiblingArtifact(filename)
      ),
      context: {upstreamPrHeads},
    }),
    /citation_full_audit이 exact table과 대상 인벤토리 재산출값과 다릅니다/u,
  );
});

test('resolved citation 대상 인벤토리를 조작하고 연결 해시를 다시 써도 재산출 검증을 우회하지 못한다', async () => {
  const fixtures = createAuthorityEvidenceFixtures();
  const auditFilename = AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citationAudit;
  const auditPath = `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${auditFilename}`;
  const audit = JSON.parse(fixtures.approvedFiles.get(auditPath).toString('utf8'));
  const resolved = audit.target_inventory.find(
    row => row.inventory_status === 'resolved_target_verified',
  );
  resolved.target_article_exists = false;
  const forgedAudit = Buffer.from(`${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  const citation = clone(fixtures.citationValue);
  citation.citation_full_audit.sha256 = rawSha256(forgedAudit);
  const forgedCitation = Buffer.from(`${JSON.stringify(citation, null, 2)}\n`, 'utf8');

  await assert.rejects(
    validateAuthorityEvidenceArtifact({
      artifactId: 'authority-citation-audit-approved',
      payload: forgedCitation,
      context: {upstreamPrHeads},
      loadSiblingArtifact: async filename =>
        filename === auditFilename ? forgedAudit : fixtures.loadSiblingArtifact(filename),
    }),
    /대상 인벤토리 재산출값과 다릅니다/u,
  );
});

test('upstream PR head·활성 DB 전체검사·producer provenance의 자기진술 변조를 거부한다', () => {
  const fixtures = createAuthorityEvidenceFixtures();
  const value = clone(fixtures.authorityDbValue);
  value.upstream.pr3_p2_sha = '9'.repeat(40);
  value.active_db_verification.integrity_check_mode = 'quick_check';
  value.provenance.generator_source_state = 'working_tree_uncommitted';
  const errors = validateAuthorityDbRegenerationEvidence(value, {upstreamPrHeads});
  assert.ok(errors.some(error => error.includes('queue 선행 PR head')));
  assert.ok(errors.some(error => error.includes('전체 SQLite integrity_check')));
  assert.ok(errors.some(error => error.includes('committed')));
});

test('linked evidence는 승인 디렉터리의 안전한 sibling filename으로만 해석한다', () => {
  const evidencePath =
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation}`;
  assert.equal(
    authorityEvidenceSiblingPath(evidencePath, AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave1),
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave1}`,
  );
  assert.throws(
    () => authorityEvidenceSiblingPath(evidencePath, '../outside.json'),
    /승인 디렉터리 밖/u,
  );
});
