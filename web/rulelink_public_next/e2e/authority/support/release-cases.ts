import {readFile} from 'node:fs/promises';
import path from 'node:path';

import type {PublishedBundle} from '@/types/publication';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');

export type AuthorityReleaseCases = {
  authorityRoutes: string[];
  knowledgeRoute: string;
  publicationSnapshotId: string;
  zeroStateRoute: string;
};

export async function resolveAuthorityReleaseCases(): Promise<AuthorityReleaseCases> {
  const bundlePath = process.env.RULELINK_AUTHORITY_RELEASE_BUNDLE
    ? path.resolve(process.env.RULELINK_AUTHORITY_RELEASE_BUNDLE)
    : path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json');
  const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as PublishedBundle;
  const expectedSnapshot = process.env.RULELINK_AUTHORITY_RELEASE_SNAPSHOT_ID;
  if (!expectedSnapshot) {
    throw new Error(
      '024 release gate 미충족: RULELINK_AUTHORITY_RELEASE_SNAPSHOT_ID가 필요합니다.',
    );
  }
  if (bundle.snapshot_id !== expectedSnapshot || !/-024(?:$|-)/.test(bundle.snapshot_id)) {
    throw new Error(
      `024 release gate 미충족: local bundle ${bundle.snapshot_id}`
      + ` != expected ${expectedSnapshot}`,
    );
  }
  const knowledge = bundle.knowledge;
  if (!knowledge) {
    throw new Error('024 release gate 미충족: knowledge index가 없습니다.');
  }
  const entry = knowledge.content_entries.find(
    candidate => candidate.content_id === 'content.compensation-order-eligible-damages',
  );
  if (!entry) {
    throw new Error(
      '024 release gate 미충족: content.compensation-order-eligible-damages가 없습니다.',
    );
  }
  const bindingById = new Map(
    (knowledge.authority_bindings ?? []).map(binding => [binding.binding_id, binding]),
  );
  const readingById = new Map(
    (knowledge.authority_reading_units ?? [])
      .map(unit => [unit.authority_reading_unit_id, unit]),
  );
  const readings = (entry.authority_binding_ids ?? [])
    .map(bindingId => bindingById.get(bindingId))
    .filter((binding): binding is NonNullable<typeof binding> => Boolean(binding))
    .map(binding => readingById.get(binding.to_authority_reading_unit_id))
    .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit));
  if (!readings.length) {
    throw new Error(
      '024 release gate 미충족: 배상명령 표본의 authority binding이 없습니다.',
    );
  }
  const authorityRoutes = [...new Set(readings.map(unit => (
    `/ko/authorities/${unit.route_key.law_key}/${unit.route_key.article_no}`
  )))];
  const zeroEntry = knowledge.content_entries.find(
    candidate => (
      candidate.content_id === 'content.legal-heir-order-and-spouse'
      && !(candidate.authority_binding_ids ?? []).length
    ),
  );
  if (!zeroEntry) {
    throw new Error(
      '024 release gate 미충족: 023 zero-state control이 없거나 authority에 결박됐습니다.',
    );
  }
  return {
    authorityRoutes,
    knowledgeRoute: `/ko/knowledge/${entry.slug}`,
    publicationSnapshotId: bundle.snapshot_id,
    zeroStateRoute: `/ko/knowledge/${zeroEntry.slug}`,
  };
}
