import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  conceptIdentityPolicyRegistry,
  validateConceptTermRelations,
} from '../src/lib/concept-terms.ts';
import {
  auditLegacyConceptDebt,
  legacyConceptValidationOptions,
  validateConceptIdentityPolicyReceipt,
} from './concept-identity-governance.mjs';

export async function validatePublicationConceptIdentity({
  bundlePath = path.resolve(
    process.cwd(),
    '..',
    '..',
    'artifacts',
    'publication',
    'current',
    'bundle.json',
  ),
  policyRegistry = conceptIdentityPolicyRegistry,
} = {}) {
  validateConceptIdentityPolicyReceipt(policyRegistry);

  const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  const concepts = bundle.knowledge?.concept_cards ?? [];
  const sources = bundle.knowledge?.sources ?? [];
  const audit = auditLegacyConceptDebt(concepts, sources, bundle.snapshot_id);
  if (audit.baselineErrors.length) {
    throw new Error(audit.baselineErrors.join('\n'));
  }
  validateConceptTermRelations(
    concepts,
    sources,
    legacyConceptValidationOptions(concepts, bundle.snapshot_id),
  );
  for (const debt of audit.acknowledged) {
    console.log(`legacy concept debt 확인: ${debt.concept_id} / ${debt.code} / ${debt.term}`);
  }
  console.log(`법률개념 정체성 감사 통과: ${bundle.snapshot_id}, ${concepts.length}개 개념`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bundlePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : undefined;
  try {
    await validatePublicationConceptIdentity({bundlePath});
  } catch (error) {
    console.error(`법률개념 정체성 감사 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
