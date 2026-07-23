import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY,
  AUTHORITY_EVIDENCE_SOURCE_FILENAMES,
} from './validate-authority-evidence-artifacts.mjs';

const fixtureRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'authority-public-evidence',
);
const approvedRoot = path.join(fixtureRoot, 'approved');
const candidateRoot = path.join(fixtureRoot, 'candidate');

export const producerContractPayload = readFileSync(
  path.join(fixtureRoot, 'authority_public_evidence_contract_v1.json'),
);
export const producerContractFixture = JSON.parse(producerContractPayload.toString('utf8'));
export const sourceCiWorkflowPayload = readFileSync(
  path.join(fixtureRoot, 'authority-024-evidence-attestation.yml'),
);

export function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function gitBlobSha1(value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash('sha1')
    .update(Buffer.from(`blob ${body.length}\0`, 'utf8'))
    .update(body)
    .digest('hex');
}

function readFixture(root, filename) {
  return readFileSync(path.join(root, filename));
}

export function createAuthorityEvidenceFixtures() {
  const approvedFiles = new Map([
    [
      `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db}`,
      readFixture(approvedRoot, AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db),
    ],
    [
      `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation}`,
      readFixture(approvedRoot, AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation),
    ],
    [
      `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave1}`,
      readFixture(approvedRoot, AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave1),
    ],
    [
      `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave2}`,
      readFixture(approvedRoot, AUTHORITY_EVIDENCE_SOURCE_FILENAMES.wave2),
    ],
    [
      `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citationAudit}`,
      readFixture(approvedRoot, AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citationAudit),
    ],
  ]);
  const candidateDbPayload = readFixture(
    candidateRoot,
    'authority-db-regenerated.preview.json',
  );
  const candidateCitationPayload = readFixture(
    candidateRoot,
    'authority-citation-audit-approved.preview.json',
  );
  const dbPath =
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.db}`;
  const citationPath =
    `${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${AUTHORITY_EVIDENCE_SOURCE_FILENAMES.citation}`;
  return {
    approvedFiles,
    authorityDbPayload: approvedFiles.get(dbPath),
    citationPayload: approvedFiles.get(citationPath),
    authorityDbValue: JSON.parse(approvedFiles.get(dbPath).toString('utf8')),
    citationValue: JSON.parse(approvedFiles.get(citationPath).toString('utf8')),
    candidateDbPayload,
    candidateCitationPayload,
    loadSiblingArtifact: async filename => {
      const payload = approvedFiles.get(`${AUTHORITY_EVIDENCE_REPOSITORY_DIRECTORY}/${filename}`);
      if (!payload) throw new Error(`알 수 없는 producer sibling fixture: ${filename}`);
      return payload;
    },
  };
}

export function githubContentsFixture(repositoryPath, payload) {
  return {
    type: 'file',
    path: repositoryPath,
    encoding: 'base64',
    content: payload.toString('base64'),
    size: payload.length,
    sha: gitBlobSha1(payload),
  };
}
