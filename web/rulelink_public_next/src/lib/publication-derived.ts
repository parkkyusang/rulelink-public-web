import {readFile} from 'node:fs/promises';
import path from 'node:path';

import type {
  PublicContentMaintenanceView,
  PublicPublicationMaintenanceIndex,
  PublicSourceText,
  PublicSourceTextLibrary,
} from '@/types/publication-derived';
import type {PublicContentBundle, PublicKnowledgeEntry} from '@/types/publication';

type DerivedPublicationState = {
  maintenance: PublicPublicationMaintenanceIndex | null;
  sourceTextByCoordinate: ReadonlyMap<string, PublicSourceText>;
};

export async function loadDerivedPublicationState(
  bundle: PublicContentBundle,
): Promise<DerivedPublicationState> {
  const snapshotId = bundle.schema === 'rulelink_published_bundle_v1'
    ? bundle.snapshot_id
    : null;
  const [maintenance, sourceLibrary] = await Promise.all([
    readJson<PublicPublicationMaintenanceIndex>('maintenance-index.json'),
    readJson<PublicSourceTextLibrary>('source-text-library.json'),
  ]);
  const maintenanceMatches = (
    maintenance?.schema === 'rulelink_publication_maintenance_index_v1'
    && snapshotId !== null
    && maintenance.publication_snapshot_id === snapshotId
  );
  const libraryMatches = (
    sourceLibrary?.schema === 'rulelink_public_source_text_library_v1'
    && snapshotId !== null
    && sourceLibrary.publication_snapshot_id === snapshotId
  );
  const textById = new Map(
    libraryMatches
      ? sourceLibrary.texts.map(text => [text.text_id, text])
      : [],
  );
  return {
    maintenance: maintenanceMatches ? maintenance : null,
    sourceTextByCoordinate: new Map(
      libraryMatches
        ? sourceLibrary.bindings.flatMap(binding => {
          const text = textById.get(binding.text_id);
          return text ? [[binding.coordinate_id, text] as const] : [];
        })
        : [],
    ),
  };
}

export function visibleKnowledgeEntries(
  entries: readonly PublicKnowledgeEntry[],
  maintenance: PublicPublicationMaintenanceIndex | null,
  fallback: (entries: readonly PublicKnowledgeEntry[]) => PublicKnowledgeEntry[],
): PublicKnowledgeEntry[] {
  if (!maintenance) return fallback(entries);
  const currentIds = new Set(
    maintenance.content_views
      .filter(view => view.status === 'current')
      .map(view => view.content_id),
  );
  return entries.filter(entry => currentIds.has(entry.content_id));
}

export function maintenanceForContent(
  maintenance: PublicPublicationMaintenanceIndex | null,
  contentId: string,
): PublicContentMaintenanceView | null {
  return maintenance?.content_views.find(view => view.content_id === contentId) ?? null;
}

async function readJson<T>(filename: string): Promise<T | null> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), 'content', filename), 'utf8'),
    ) as T;
  } catch {
    return null;
  }
}
