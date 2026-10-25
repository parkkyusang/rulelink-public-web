import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalSha256} from './publication-coverage-core.mjs';

export const portableBundleHash = text => createHash('sha256').update(text.replace(/\r\n?/gu, '\n')).digest('hex');
function semantic(entity) {
  const result = structuredClone(entity);
  delete result.reviewed_at; delete result.expires_at;
  // composer가 scenario에서 다시 계산하는 투영 필드이며 법률 문안은 아니다.
  if (result.lawyer_workspace_entry) delete result.lawyer_workspace_entry.decision_facts_ko;
  return result;
}
export function migrateCoverage({manifest, domains, previous, current, previousHash, currentHash, evidence, evaluation, release}) {
  assert.equal(manifest.base_snapshot_id, previous.snapshot_id, '이전 출판본 불일치');
  assert.equal(manifest.base_bundle_sha256, previousHash, '이전 출판 해시 불일치');
  assert.equal(evidence.previous_snapshot_id, previous.snapshot_id, '점검 기준 출판본 불일치');
  assert.equal(evidence.previous_bundle_sha256, canonicalSha256(previous), '점검 기준 해시 불일치');
  assert.equal(evaluation.verified_result_receipts.length, 0, '검증결과가 있으면 별도 재평가 필요');
  assert.equal(release.releases.length, 0, '출시증거가 있으면 별도 이관 필요');
  for (const collection of ['source_authority_units', 'source_version_bridges', 'authority_reading_units', 'authority_bindings']) {
    assert.deepEqual(current.knowledge[collection], previous.knowledge[collection], `권위자료 변경은 자동이관 불가: ${collection}`);
  }
  const next = structuredClone(domains);
  const sourceMap = new Map(current.knowledge.sources.map(x => [x.coordinate_id, x]));
  const previousSourceMap = new Map(previous.knowledge.sources.map(x => [x.coordinate_id, x]));
  const checks = new Map(evidence.source_checks.map(x => [x.coordinate_id, x]));
  const migrated = [];
  for (const domain of next) for (const unit of domain.units) {
    for (const [collection, key, ids] of [
      ['content_entries', 'content_id', unit.canonical_content_ids],
      ['rule_cards', 'rule_id', unit.required_rule_ids],
      ['scenario_branches', 'scenario_id', unit.required_scenario_ids],
      ['authority_bindings', 'binding_id', unit.required_authority_binding_ids],
    ]) for (const id of ids) {
      const before = previous.knowledge[collection].find(x => x[key] === id);
      const after = current.knowledge[collection].find(x => x[key] === id);
      assert.ok(before && after, `검토대상 누락: ${id}`);
      assert.deepEqual(semantic(after), semantic(before), `의미 변경은 자동이관 불가: ${id}`);
    }
    for (const requirement of unit.source_version_requirements) {
      const source = sourceMap.get(requirement.coordinate_id), check = checks.get(requirement.coordinate_id);
      const oldSource = previousSourceMap.get(requirement.coordinate_id);
      assert.ok(oldSource, `이전 근거 누락: ${requirement.coordinate_id}`);
      assert.equal(requirement.source_snapshot_id, oldSource.source_snapshot_id, '이전 단위 판본 결박 불일치');
      assert.equal(requirement.last_verified_at, oldSource.last_verified_at, '이전 단위 확인일 결박 불일치');
      assert.ok(source && check && !check.historical, `현재 근거점검 누락: ${requirement.coordinate_id}`);
      assert.equal(check.resulting_source_sha256, canonicalSha256(source), '점검 후 근거 변조');
      requirement.source_snapshot_id = source.source_snapshot_id;
      requirement.last_verified_at = source.last_verified_at;
    }
    migrated.push(unit.coverage_unit_id);
  }
  return {manifest: {...manifest, base_snapshot_id: current.snapshot_id, base_bundle_sha256: currentHash}, domains: next, migrated};
}

async function main() {
  const root = path.resolve('../..');
  const read = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
  const base = 'artifacts/publication/coverage/';
  const manifest = await read(base + 'coverage-manifest.json');
  const oldText = await readFile(path.join(root, 'artifacts/publication/snapshots', manifest.base_snapshot_id, 'bundle.json'), 'utf8');
  const newText = await readFile(path.join(root, 'artifacts/publication/current/bundle.json'), 'utf8');
  const result = migrateCoverage({manifest, domains: await Promise.all(manifest.domain_files.map(read)),
    previous: JSON.parse(oldText), current: JSON.parse(newText), previousHash: portableBundleHash(oldText), currentHash: portableBundleHash(newText),
    evidence: await read(base + 'source-check-20261025.json'), evaluation: await read(manifest.evaluation_scope_receipt_file), release: await read(manifest.release_evidence_file)});
  if (process.argv.includes('--write')) {
    await writeFile(path.join(root, base, 'coverage-manifest.json'), JSON.stringify(result.manifest, null, 2) + '\n');
    for (let i=0; i<manifest.domain_files.length; i++) await writeFile(path.join(root, manifest.domain_files[i]), JSON.stringify(result.domains[i], null, 2) + '\n');
  }
  console.log(JSON.stringify({write:process.argv.includes('--write'),snapshot:result.manifest.base_snapshot_id,units:result.migrated,verified_results:0,release_verified:false,scope_ko:'근거 점검 후 구조·판본 재결박이며 법률평가 정답·전문가 검토·출시 재승인이 아닙니다.'},null,2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
