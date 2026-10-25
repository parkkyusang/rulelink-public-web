import assert from 'node:assert/strict';
import {readFile as rawReadFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256Canonical} from './publication-derived-core.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const read = async p => JSON.parse(await rawReadFile(path.join(root, p), 'utf8'));
const [previous, current, evidence] = await Promise.all([
  read('artifacts/publication/snapshots/kr-knowledge-core-20260726-024/bundle.json'),
  read('artifacts/publication/current/bundle.json'),
  read('artifacts/publication/coverage/source-check-20261025.json'),
]);
const oldSources = new Map(previous.knowledge.sources.map(x => [x.coordinate_id, x]));
const checks = new Map(evidence.source_checks.map(x => [x.coordinate_id, x]));
const oldEntries = new Map([...previous.knowledge.content_entries, ...previous.knowledge.concept_cards].map(x => [x.content_id ?? x.concept_id, x]));
const currentEntries = new Map([...current.knowledge.content_entries, ...current.knowledge.concept_cards].map(x => [x.content_id ?? x.concept_id, x]));
const oldBriefs = new Map(previous.change_briefs.map(x => [x.change_brief_id, x]));
const currentBriefs = new Map(current.change_briefs.map(x => [x.change_brief_id, x]));
const oldAssertions = new Map(previous.assertions.map(x => [x.assertion_id, x]));

export function projectReviewedMetadata(value) {
  if (Array.isArray(value)) return value.map(projectReviewedMetadata);
  if (!value || typeof value !== 'object') return value;
  if (value.coordinate_id && oldSources.has(value.coordinate_id)) {
    const old = oldSources.get(value.coordinate_id), check = checks.get(value.coordinate_id);
    assert.equal(sha256Canonical(value), check?.resulting_source_sha256, `현재 근거 점검 불일치: ${value.coordinate_id}`);
    assert.equal(sha256Canonical(old), check?.original_source_sha256, `과거 승인 근거 불일치: ${value.coordinate_id}`);
    return structuredClone(old);
  }
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projectReviewedMetadata(item)]));
  const id = value.content_id ?? value.concept_id;
  if (oldEntries.has(id) && value.reviewed_at && value.expires_at) {
    const active = currentEntries.get(id), old = oldEntries.get(id);
    assert.equal(value.reviewed_at, active.reviewed_at, `현재 검토일 변조: ${id}`);
    assert.equal(value.expires_at, active.expires_at, `현재 만료일 변조: ${id}`);
    result.reviewed_at = old.reviewed_at; result.expires_at = old.expires_at;
  }
  if (oldBriefs.has(value.change_brief_id)) {
    assert.equal(value.reviewed_at, currentBriefs.get(value.change_brief_id).reviewed_at, '현재 변화 안내 검토일 변조');
    assert.equal(value.expires_at, currentBriefs.get(value.change_brief_id).expires_at, '현재 변화 안내 만료일 변조');
    result.reviewed_at = oldBriefs.get(value.change_brief_id).reviewed_at;
    result.expires_at = oldBriefs.get(value.change_brief_id).expires_at;
  }
  if (oldAssertions.has(value.assertion_id)) {
    const old = oldAssertions.get(value.assertion_id);
    result.source_coordinates = value.source_coordinates.map((coordinate, index) => {
      const before = old.source_coordinates[index];
      if (sha256Canonical(coordinate) === sha256Canonical(before)) return coordinate;
      const candidates = current.knowledge.sources.filter(source => source.source_id === coordinate.source_id && source.source_snapshot_id === coordinate.source_snapshot_id);
      assert.ok(candidates.some(source => {
        const original = oldSources.get(source.coordinate_id);
        return original?.source_id === before.source_id && original?.source_snapshot_id === before.source_snapshot_id && checks.get(source.coordinate_id)?.resulting_source_sha256 === sha256Canonical(source);
      }), `변화 근거 메타 이관 증거 누락: ${value.assertion_id}`);
      const restored = {...coordinate};
      for (const key of ['source_id', 'source_snapshot_id', 'source_hash', 'last_verified_at']) {
        if (Object.hasOwn(before, key)) restored[key] = before[key]; else delete restored[key];
      }
      return restored;
    });
  }
  return result;
}

// 옛 인계 승인 시험의 입력 경계 전용. 실제 제품/출판 검증은 현재 데이터를 그대로 사용한다.
export async function readReviewedTopicFile(filename, options) {
  const raw = await rawReadFile(filename, options);
  const absolute = filename instanceof URL ? fileURLToPath(filename) : path.resolve(filename);
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (!relative.startsWith('artifacts/publication/topics/') && !relative.startsWith('artifacts/publication/concepts/') && relative !== 'artifacts/publication/current/bundle.json') return raw;
  const projected = JSON.stringify(projectReviewedMetadata(JSON.parse(raw.toString('utf8'))));
  return typeof raw === 'string' ? projected : Buffer.from(projected);
}
