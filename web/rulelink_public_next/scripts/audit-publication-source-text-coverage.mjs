import {readFile} from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(process.cwd(), '..', '..');
const [bundle, library] = await Promise.all([
  readJson(path.join(
    repositoryRoot,
    'artifacts',
    'publication',
    'current',
    'bundle.json',
  )),
  readJson(path.join(
    repositoryRoot,
    'artifacts',
    'publication',
    'derived',
    'source-text-library.json',
  )),
]);
const sources = bundle.knowledge?.sources ?? [];
const sourceByCoordinate = new Map(
  sources.map(source => [source.coordinate_id, source]),
);
const bindingByCoordinate = new Map(
  library.bindings.map(binding => [binding.coordinate_id, binding]),
);
const unresolvedByCoordinate = new Map(
  library.unresolved.map(item => [item.coordinate_id, item]),
);
const textBySourceId = new Map();
for (const text of library.texts) {
  textBySourceId.set(text.source_id, [
    ...(textBySourceId.get(text.source_id) ?? []),
    text,
  ]);
}
const unresolvedReasons = {};
const recoverableLocatorMatches = [];
for (const [coordinateId, unresolved] of unresolvedByCoordinate) {
  unresolvedReasons[unresolved.reason] = (
    unresolvedReasons[unresolved.reason] ?? 0
  ) + 1;
  const source = sourceByCoordinate.get(coordinateId);
  const candidates = (textBySourceId.get(source?.source_id) ?? [])
    .filter(text => (
      text.law_name_ko === source?.law_name_ko
      && text.article_no === source?.article_no
    ));
  if (candidates.length) {
    recoverableLocatorMatches.push({
      coordinate_id: coordinateId,
      reason: unresolved.reason,
      source_id: source.source_id,
      public_source_snapshot_id: source.source_snapshot_id,
      verified_text_hashes: candidates.map(text => text.source_hash),
    });
  }
}
const missingStates = sources
  .filter(source => (source.source_kind ?? 'statute') === 'statute')
  .filter(source => (
    !bindingByCoordinate.has(source.coordinate_id)
    && !unresolvedByCoordinate.has(source.coordinate_id)
  ))
  .map(source => source.coordinate_id);
const report = {
  schema: 'rulelink_public_source_text_coverage_audit_v1',
  publication_snapshot_id: bundle.snapshot_id,
  counts: {
    statute_coordinates: library.coverage.publication_statute_coordinates,
    verified_text: library.coverage.bound_statute_coordinates,
    link_only: library.coverage.unresolved_statute_coordinates,
    unique_verified_texts: library.coverage.unique_verified_texts,
    missing_state: missingStates.length,
    locator_match_but_version_mismatch: recoverableLocatorMatches.length,
  },
  unresolved_reasons: Object.fromEntries(
    Object.entries(unresolvedReasons).sort(([left], [right]) => (
      left.localeCompare(right, 'en')
    )),
  ),
  missing_state_coordinate_ids: missingStates,
  locator_match_but_version_mismatch: recoverableLocatorMatches,
  display_contract: {
    verified_text: '확인한 조문 문언을 페이지 안에 표시',
    link_only: '직접 표시하지 않고 공식 원문으로 연결',
  },
};
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const reasons = Object.entries(report.unresolved_reasons)
    .map(([reason, count]) => `${reason} ${count}개`)
    .join(' · ');
  process.stdout.write([
    `공식 근거 문언 상태: 정확한 문언 표시 ${report.counts.verified_text}/${report.counts.statute_coordinates} · 공식 원문 연결 ${report.counts.link_only}/${report.counts.statute_coordinates}`,
    `고유 검증 문언 ${report.counts.unique_verified_texts}개 · 상태 누락 ${report.counts.missing_state}개 · 같은 조문이지만 버전 불일치 ${report.counts.locator_match_but_version_mismatch}개`,
    reasons ? `직접 표시하지 않는 이유: ${reasons}` : '직접 표시하지 않는 근거 없음',
    '표시 계약: 정확한 버전이 결박된 조문만 페이지 안에 표시하고, 나머지는 이유를 알린 뒤 공식 원문으로 연결합니다.',
  ].join('\n') + '\n');
}
if (missingStates.length) process.exitCode = 1;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
