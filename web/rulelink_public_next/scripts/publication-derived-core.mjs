import {createHash} from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DERIVED_SCHEMAS = Object.freeze({
  maintenance: 'rulelink_publication_maintenance_index_v1',
  sourceCheckQueue: 'rulelink_publication_source_check_queue_v1',
  sourceText: 'rulelink_public_source_text_library_v1',
});

export const DEFAULT_REVIEW_POLICY = Object.freeze({
  coordinate_only_days: 90,
  verified_text_days: 180,
});

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Canonical(value) {
  return sha256(canonicalJson(value));
}

export function buildMaintenanceIndex({
  bundle,
  generatedAt = bundle?.built_at,
  previousBundle = null,
  reviewPolicy = DEFAULT_REVIEW_POLICY,
  sourceTextLibrary = null,
}) {
  assertRecord(bundle, 'bundle');
  const knowledge = bundle.knowledge ?? {};
  const generatedDate = parseDate(generatedAt, 'generatedAt');
  const sources = array(knowledge.sources);
  const entries = array(knowledge.content_entries);
  const textBindingByCoordinate = new Map(
    array(sourceTextLibrary?.bindings).map(binding => [binding.coordinate_id, binding]),
  );
  const changedCoordinates = changedSourceCoordinates(previousBundle, bundle);
  const sourceReceipts = sources.map(source => {
    const checkedAt = parseDate(source.last_verified_at, `${source.coordinate_id}.last_verified_at`);
    const textBinding = textBindingByCoordinate.get(source.coordinate_id);
    const reviewDays = textBinding
      ? reviewPolicy.verified_text_days
      : reviewPolicy.coordinate_only_days;
    const nextCheckAt = new Date(checkedAt.getTime() + reviewDays * DAY_MS).toISOString();
    const evidenceHash = sha256Canonical({
      coordinate_id: source.coordinate_id,
      source_snapshot_id: source.source_snapshot_id,
      last_verified_at: source.last_verified_at,
      text_id: textBinding?.text_id ?? null,
    });
    return {
      receipt_id: `source-review.${evidenceHash.slice(0, 24)}`,
      coordinate_id: source.coordinate_id,
      source_snapshot_id: source.source_snapshot_id,
      checked_at: checkedAt.toISOString(),
      next_check_at: nextCheckAt,
      evidence_level: textBinding ? 'verified_text' : 'coordinate_only',
      evidence_hash: evidenceHash,
      status: checkedAt.getTime() > generatedDate.getTime()
        ? 'blocked'
        : Date.parse(nextCheckAt) <= generatedDate.getTime()
          ? 'review_due'
          : 'current',
    };
  });
  const sourceReceiptByCoordinate = new Map(
    sourceReceipts.map(receipt => [receipt.coordinate_id, receipt]),
  );
  const previousEntryById = new Map(
    array(previousBundle?.knowledge?.content_entries).map(entry => [entry.content_id, entry]),
  );
  const contentViews = entries.map(entry => {
    const sourceCoordinateIds = resolveContentSourceCoordinates(knowledge, entry);
    const sourceReviewReceiptIds = [];
    const invalidatedBy = [];
    const nextChecks = [];
    for (const coordinateId of sourceCoordinateIds) {
      const receipt = sourceReceiptByCoordinate.get(coordinateId);
      if (!receipt) {
        invalidatedBy.push(`source_missing:${coordinateId}`);
        continue;
      }
      sourceReviewReceiptIds.push(receipt.receipt_id);
      nextChecks.push(receipt.next_check_at);
      if (receipt.status !== 'current') {
        invalidatedBy.push(`source_${receipt.status}:${coordinateId}`);
      }
      if (changedCoordinates.has(coordinateId)) {
        const previousEntry = previousEntryById.get(entry.content_id);
        const reviewedAfterSource = (
          Date.parse(entry.reviewed_at) >= Date.parse(receipt.checked_at)
          && previousEntry
          && previousEntry.reviewed_at !== entry.reviewed_at
        );
        if (!reviewedAfterSource) {
          invalidatedBy.push(`source_changed:${coordinateId}`);
        }
      }
    }
    const status = invalidatedBy.some(value => value.startsWith('source_missing:'))
      ? 'blocked'
      : invalidatedBy.some(value => value.startsWith('source_changed:'))
        ? 'invalidated'
        : invalidatedBy.length
          ? 'review_due'
          : 'current';
    const dependencyHash = sha256Canonical({
      content_id: entry.content_id,
      reviewed_at: entry.reviewed_at,
      rule_ids: [...array(entry.rule_ids)].sort(),
      scenario_ids: [...array(entry.scenario_ids)].sort(),
      concept_ids: [...array(entry.concept_ids)].sort(),
      source_review_receipt_ids: [...sourceReviewReceiptIds].sort(),
    });
    return {
      content_id: entry.content_id,
      dependency_hash: dependencyHash,
      source_coordinate_ids: sourceCoordinateIds,
      source_review_receipt_ids: sourceReviewReceiptIds.sort(),
      next_check_at: nextChecks.sort()[0] ?? null,
      status,
      invalidated_by: invalidatedBy.sort(),
    };
  });
  const statusCounts = countBy(contentViews, item => item.status);
  return {
    schema: DERIVED_SCHEMAS.maintenance,
    generated_at: generatedDate.toISOString(),
    publication_snapshot_id: bundle.snapshot_id,
    publication_bundle_sha256: sha256Canonical(bundle),
    source_text_library_sha256: sourceTextLibrary
      ? sha256Canonical(sourceTextLibrary)
      : null,
    review_policy: {
      mode: 'source_event_with_periodic_longstop',
      coordinate_only_days: reviewPolicy.coordinate_only_days,
      verified_text_days: reviewPolicy.verified_text_days,
      content_dates_are_derived: true,
    },
    counts: {
      source_receipts: sourceReceipts.length,
      content_views: contentViews.length,
      current: statusCounts.current ?? 0,
      review_due: statusCounts.review_due ?? 0,
      invalidated: statusCounts.invalidated ?? 0,
      blocked: statusCounts.blocked ?? 0,
    },
    source_receipts: sourceReceipts,
    content_views: contentViews,
  };
}

export function buildSourceCheckQueue({
  bundle,
  maintenanceIndex,
  attentionWindowDays = 30,
  generatedAt = maintenanceIndex?.generated_at,
}) {
  assertRecord(bundle, 'bundle');
  assertRecord(maintenanceIndex, 'maintenanceIndex');
  if (!Number.isInteger(attentionWindowDays) || attentionWindowDays < 0) {
    throw new Error('attentionWindowDays must be a non-negative integer');
  }
  const generatedDate = parseDate(generatedAt, 'generatedAt');
  const attentionCutoff = new Date(
    generatedDate.getTime() + attentionWindowDays * DAY_MS,
  );
  const sourceByCoordinate = new Map(
    array(bundle?.knowledge?.sources).map(source => [source.coordinate_id, source]),
  );
  const viewsByCoordinate = new Map();
  for (const view of array(maintenanceIndex.content_views)) {
    for (const coordinateId of array(view.source_coordinate_ids)) {
      viewsByCoordinate.set(coordinateId, [
        ...array(viewsByCoordinate.get(coordinateId)),
        view,
      ]);
    }
  }

  const items = [];
  for (const receipt of array(maintenanceIndex.source_receipts)) {
    const views = array(viewsByCoordinate.get(receipt.coordinate_id));
    const changed = views.some(view => (
      array(view.invalidated_by)
        .includes(`source_changed:${receipt.coordinate_id}`)
    ));
    const state = receipt.status === 'blocked'
      ? 'blocked'
      : changed
        ? 'invalidated'
        : receipt.status === 'review_due'
          ? 'due'
          : Date.parse(receipt.next_check_at) <= attentionCutoff.getTime()
            ? 'upcoming'
            : 'scheduled';
    const source = sourceByCoordinate.get(receipt.coordinate_id);
    if (!source) continue;
    const dependencyDigest = sha256Canonical(
      views
        .map(view => ({
          content_id: view.content_id,
          dependency_hash: view.dependency_hash,
        }))
        .sort((left, right) => left.content_id.localeCompare(right.content_id, 'en')),
    );
    const taskFingerprint = sha256Canonical({
      coordinate_id: receipt.coordinate_id,
      evidence_hash: receipt.evidence_hash,
      state,
    });
    items.push({
      task_id: `source-check.${taskFingerprint.slice(0, 24)}`,
      coordinate_id: receipt.coordinate_id,
      official_url: source.official_url,
      expected_source_snapshot_id: receipt.source_snapshot_id,
      expected_evidence_hash: receipt.evidence_hash,
      evidence_level: receipt.evidence_level,
      due_at: receipt.next_check_at,
      state,
      check_method: receipt.evidence_level === 'verified_text'
        ? 'canonical_text_hash'
        : 'locator_resolution',
      dependency_selector: {
        kind: 'maintenance_index_coordinate',
        dependent_content_count: views.length,
        dependency_digest: dependencyDigest,
      },
      detection_policy: {
        deterministic_only: true,
        llm_allowed: false,
        llm_token_budget: 0,
      },
    });
  }
  items.sort((left, right) => (
    sourceCheckPriority(left.state) - sourceCheckPriority(right.state)
    || left.due_at.localeCompare(right.due_at)
    || left.coordinate_id.localeCompare(right.coordinate_id, 'en')
  ));
  const stateCounts = countBy(items, item => item.state);
  return {
    schema: DERIVED_SCHEMAS.sourceCheckQueue,
    generated_at: generatedDate.toISOString(),
    publication_snapshot_id: bundle.snapshot_id,
    publication_bundle_sha256: sha256Canonical(bundle),
    maintenance_index_sha256: sha256Canonical(maintenanceIndex),
    policy: {
      attention_window_days: attentionWindowDays,
      detection_stage: 'deterministic_zero_token',
      unchanged_sources_create_content_work: false,
      changed_sources_require_claim_impact_review: true,
    },
    counts: {
      total: items.length,
      blocked: stateCounts.blocked ?? 0,
      invalidated: stateCounts.invalidated ?? 0,
      due: stateCounts.due ?? 0,
      upcoming: stateCounts.upcoming ?? 0,
      scheduled: stateCounts.scheduled ?? 0,
    },
    items,
  };
}

export function validateSourceTextLibrary(library, bundle) {
  const errors = [];
  if (library?.schema !== DERIVED_SCHEMAS.sourceText) {
    errors.push('source_text_library_schema_invalid');
    return errors;
  }
  if (library.publication_snapshot_id !== bundle?.snapshot_id) {
    errors.push('source_text_library_snapshot_mismatch');
  }
  if (library.publication_bundle_sha256 !== sha256Canonical(bundle)) {
    errors.push('source_text_library_bundle_hash_mismatch');
  }
  const sourceByCoordinate = new Map(
    array(bundle?.knowledge?.sources).map(source => [source.coordinate_id, source]),
  );
  const statuteCoordinateIds = new Set(
    array(bundle?.knowledge?.sources)
      .filter(source => (source.source_kind ?? 'statute') === 'statute')
      .map(source => source.coordinate_id),
  );
  const textById = new Map();
  for (const text of array(library.texts)) {
    if (textById.has(text.text_id)) {
      errors.push(`source_text_duplicate:${text.text_id}`);
      continue;
    }
    textById.set(text.text_id, text);
    const actualHash = `sha256:${sha256(text.official_text_ko ?? '')}`;
    if (actualHash !== text.source_hash) {
      errors.push(`source_text_hash_mismatch:${text.text_id}`);
    }
    if (text.text_id !== `text.${actualHash.slice('sha256:'.length)}`) {
      errors.push(`source_text_id_mismatch:${text.text_id}`);
    }
  }
  const boundCoordinates = new Set();
  for (const binding of array(library.bindings)) {
    if (boundCoordinates.has(binding.coordinate_id)) {
      errors.push(`source_text_binding_duplicate:${binding.coordinate_id}`);
      continue;
    }
    boundCoordinates.add(binding.coordinate_id);
    const source = sourceByCoordinate.get(binding.coordinate_id);
    if (!source) {
      errors.push(`source_text_binding_source_missing:${binding.coordinate_id}`);
      continue;
    }
    if (source.source_snapshot_id !== binding.public_source_snapshot_id) {
      errors.push(`source_text_binding_snapshot_mismatch:${binding.coordinate_id}`);
    }
    const text = textById.get(binding.text_id);
    if (!text) {
      errors.push(`source_text_binding_text_missing:${binding.coordinate_id}`);
      continue;
    }
    const publicDigest = binding.public_source_snapshot_id.replace(/^snapshot:/u, '');
    if (
      !/^[a-f0-9]{32,64}$/u.test(publicDigest)
      || !text.source_hash.slice('sha256:'.length).startsWith(publicDigest)
    ) {
      errors.push(`source_text_binding_version_mismatch:${binding.coordinate_id}`);
    }
    if (
      (source.source_kind ?? 'statute') !== 'statute'
      || source.law_name_ko !== text.law_name_ko
      || source.article_no !== text.article_no
    ) {
      errors.push(`source_text_binding_locator_mismatch:${binding.coordinate_id}`);
    }
  }
  const unresolvedCoordinates = new Set();
  for (const unresolved of array(library.unresolved)) {
    if (unresolvedCoordinates.has(unresolved.coordinate_id)) {
      errors.push(`source_text_unresolved_duplicate:${unresolved.coordinate_id}`);
      continue;
    }
    unresolvedCoordinates.add(unresolved.coordinate_id);
    if (!statuteCoordinateIds.has(unresolved.coordinate_id)) {
      errors.push(`source_text_unresolved_source_missing:${unresolved.coordinate_id}`);
    }
    if (boundCoordinates.has(unresolved.coordinate_id)) {
      errors.push(`source_text_state_conflict:${unresolved.coordinate_id}`);
    }
  }
  for (const coordinateId of statuteCoordinateIds) {
    if (
      !boundCoordinates.has(coordinateId)
      && !unresolvedCoordinates.has(coordinateId)
    ) {
      errors.push(`source_text_state_missing:${coordinateId}`);
    }
  }
  if (
    library?.coverage?.publication_statute_coordinates !== statuteCoordinateIds.size
    || library?.coverage?.bound_statute_coordinates !== boundCoordinates.size
    || library?.coverage?.unique_verified_texts !== textById.size
    || library?.coverage?.unresolved_statute_coordinates !== unresolvedCoordinates.size
  ) {
    errors.push('source_text_coverage_counts_mismatch');
  }
  return errors;
}

export function validateMaintenanceIndex(index, bundle, sourceTextLibrary) {
  const errors = [];
  if (index?.schema !== DERIVED_SCHEMAS.maintenance) {
    errors.push('maintenance_schema_invalid');
    return errors;
  }
  if (index.publication_snapshot_id !== bundle?.snapshot_id) {
    errors.push('maintenance_snapshot_mismatch');
  }
  if (index.publication_bundle_sha256 !== sha256Canonical(bundle)) {
    errors.push('maintenance_bundle_hash_mismatch');
  }
  if (
    index.source_text_library_sha256
    !== (sourceTextLibrary ? sha256Canonical(sourceTextLibrary) : null)
  ) {
    errors.push('maintenance_source_library_hash_mismatch');
  }
  const sourceIds = new Set(
    array(bundle?.knowledge?.sources).map(source => source.coordinate_id),
  );
  const contentIds = new Set(
    array(bundle?.knowledge?.content_entries).map(entry => entry.content_id),
  );
  const receiptById = new Map();
  for (const receipt of array(index.source_receipts)) {
    if (receiptById.has(receipt.receipt_id)) {
      errors.push(`maintenance_receipt_duplicate:${receipt.receipt_id}`);
    }
    receiptById.set(receipt.receipt_id, receipt);
    if (!sourceIds.has(receipt.coordinate_id)) {
      errors.push(`maintenance_receipt_source_missing:${receipt.coordinate_id}`);
    }
  }
  const viewIds = new Set();
  for (const view of array(index.content_views)) {
    if (viewIds.has(view.content_id)) {
      errors.push(`maintenance_content_duplicate:${view.content_id}`);
    }
    viewIds.add(view.content_id);
    if (!contentIds.has(view.content_id)) {
      errors.push(`maintenance_content_missing:${view.content_id}`);
    }
    for (const receiptId of array(view.source_review_receipt_ids)) {
      if (!receiptById.has(receiptId)) {
        errors.push(`maintenance_content_receipt_missing:${view.content_id}:${receiptId}`);
      }
    }
    if (view.status === 'current' && array(view.invalidated_by).length) {
      errors.push(`maintenance_current_has_invalidation:${view.content_id}`);
    }
  }
  for (const contentId of contentIds) {
    if (!viewIds.has(contentId)) {
      errors.push(`maintenance_content_view_missing:${contentId}`);
    }
  }
  return errors;
}

export function validateSourceCheckQueue(queue, maintenanceIndex, bundle) {
  const errors = [];
  if (queue?.schema !== DERIVED_SCHEMAS.sourceCheckQueue) {
    errors.push('source_check_queue_schema_invalid');
    return errors;
  }
  if (queue.publication_snapshot_id !== bundle?.snapshot_id) {
    errors.push('source_check_queue_snapshot_mismatch');
  }
  if (queue.publication_bundle_sha256 !== sha256Canonical(bundle)) {
    errors.push('source_check_queue_bundle_hash_mismatch');
  }
  if (queue.maintenance_index_sha256 !== sha256Canonical(maintenanceIndex)) {
    errors.push('source_check_queue_maintenance_hash_mismatch');
  }
  if (
    !Number.isInteger(queue?.policy?.attention_window_days)
    || queue.policy.attention_window_days < 0
  ) {
    errors.push('source_check_queue_attention_window_invalid');
    return errors;
  }
  const expected = buildSourceCheckQueue({
    bundle,
    maintenanceIndex,
    attentionWindowDays: queue?.policy?.attention_window_days,
    generatedAt: queue.generated_at,
  });
  if (canonicalJson(queue) !== canonicalJson(expected)) {
    errors.push('source_check_queue_projection_mismatch');
  }
  for (const item of array(queue.items)) {
    if (
      item?.detection_policy?.llm_allowed !== false
      || item?.detection_policy?.llm_token_budget !== 0
    ) {
      errors.push(`source_check_queue_detection_not_zero_token:${item?.task_id ?? '?'}`);
    }
  }
  return errors;
}

export function resolveContentSourceCoordinates(knowledge, entry) {
  const scenarioById = new Map(
    array(knowledge.scenario_branches).map(item => [item.scenario_id, item]),
  );
  const ruleById = new Map(
    array(knowledge.rule_cards).map(item => [item.rule_id, item]),
  );
  const conceptById = new Map(
    array(knowledge.concept_cards).map(item => [item.concept_id, item]),
  );
  const scenarios = array(entry.scenario_ids)
    .map(id => scenarioById.get(id))
    .filter(Boolean);
  const ruleIds = new Set([
    ...array(entry.rule_ids),
    ...scenarios.flatMap(item => array(item.rule_ids)),
  ]);
  const rules = [...ruleIds].map(id => ruleById.get(id)).filter(Boolean);
  const conceptIds = new Set([
    ...array(entry.concept_ids),
    ...array(knowledge.concept_cards)
      .filter(concept => array(concept.related_content_ids).includes(entry.content_id))
      .map(concept => concept.concept_id),
  ]);
  const concepts = [...conceptIds].map(id => conceptById.get(id)).filter(Boolean);
  return [...new Set([
    ...array(entry.source_coordinate_ids),
    ...rules.flatMap(item => array(item.source_coordinate_ids)),
    ...scenarios.flatMap(item => array(item.source_coordinate_ids)),
    ...concepts.flatMap(item => array(item.source_coordinate_ids)),
    ...concepts.flatMap(item => array(item.assertions)
      .flatMap(assertion => array(assertion.source_coordinate_ids))),
  ])].sort();
}

function changedSourceCoordinates(previousBundle, bundle) {
  if (!previousBundle) return new Set();
  const previous = new Map(
    array(previousBundle?.knowledge?.sources).map(source => [source.coordinate_id, source]),
  );
  return new Set(
    array(bundle?.knowledge?.sources)
      .filter(source => {
        const before = previous.get(source.coordinate_id);
        return !before
          || before.source_snapshot_id !== source.source_snapshot_id
          || before.last_verified_at !== source.last_verified_at;
      })
      .map(source => source.coordinate_id),
  );
}

function parseDate(value, label) {
  const date = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) {
    throw new Error(`${label}:valid_date_required`);
  }
  return date;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}:object_required`);
  }
}

function countBy(values, key) {
  const result = {};
  for (const value of values) {
    const name = key(value);
    result[name] = (result[name] ?? 0) + 1;
  }
  return result;
}

function sourceCheckPriority(state) {
  return {
    blocked: 0,
    invalidated: 1,
    due: 2,
    upcoming: 3,
    scheduled: 4,
  }[state] ?? 9;
}
