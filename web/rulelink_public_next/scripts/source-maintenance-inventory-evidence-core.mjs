import {
  createHash,
  verify as verifySignature,
} from 'node:crypto';
import path from 'node:path';

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map(item => JSON.parse(canonicalJson(item))),
    );
  }
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, JSON.parse(canonicalJson(value[key]))]),
    ),
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hasExactKeys(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key))
  );
}

function parseJson(raw, label, workId) {
  try {
    return JSON.parse(Buffer.from(raw).toString('utf8'));
  } catch {
    throw new Error(`${label} JSON을 읽을 수 없습니다: ${workId}`);
  }
}

/**
 * 서명된 source inventory의 의미만 검증하는 순수 코어다.
 *
 * 이 함수는 파일·네트워크를 읽지 않고, production queue의 비공개
 * 브랜드나 영수증을 발급하지 않는다. 운영 발급기는 고정된 정본
 * 입출력으로 원시 바이트를 확보한 뒤 이 함수를 호출한다.
 */
export function validateSourceMaintenanceInventoryEvidenceCore({
  workId,
  evidenceRef,
  artifactRaw,
  trustPolicyRaw,
  remoteManifestRaw,
  activeGraphRaw,
  ancestryComparison,
  auditedOn,
  expectedTopicId,
  expectedTargetDomainId,
  expectedSourceCount,
  expectedArtifactSha256,
}) {
  const matched =
    /^source-locator-selection:([^@]+)@sha256:([0-9a-f]{64})$/u.exec(
      evidenceRef,
    );
  if (
    !matched ||
    matched[1] !== workId ||
    matched[2] !== expectedArtifactSha256
  ) {
    throw new Error(`source locator 선택 증거 형식 오류: ${evidenceRef}`);
  }
  if (sha256(artifactRaw) !== expectedArtifactSha256) {
    throw new Error(`source locator 선택 산출물 해시 불일치: ${workId}`);
  }

  const artifact = parseJson(
    artifactRaw,
    'source locator 선택 산출물',
    workId,
  );
  const trustPolicy = parseJson(
    trustPolicyRaw,
    'source maintenance inventory trust policy',
    workId,
  );
  if (
    !hasExactKeys(trustPolicy, [
      'schema',
      'status',
      'issuer',
      'source_repository',
      'trusted_root_commit_sha',
      'inventory_manifest_path',
      'active_graph_path',
      'keys',
    ]) ||
    trustPolicy.schema !==
      'rulelink_source_maintenance_inventory_trust_policy_v1' ||
    trustPolicy.status !== 'active' ||
    typeof trustPolicy.issuer !== 'string' ||
    trustPolicy.issuer.length === 0 ||
    typeof trustPolicy.source_repository !== 'string' ||
    trustPolicy.source_repository.length === 0 ||
    !/^[^/\s]+\/[^/\s]+$/u.test(trustPolicy.source_repository) ||
    !/^[0-9a-f]{40}$/u.test(trustPolicy.trusted_root_commit_sha ?? '') ||
    ![
      trustPolicy.inventory_manifest_path,
      trustPolicy.active_graph_path,
    ].every(
      repositoryPath =>
        typeof repositoryPath === 'string' &&
        repositoryPath.length > 0 &&
        !path.posix.isAbsolute(repositoryPath) &&
        !repositoryPath.split('/').includes('..'),
    ) ||
    !Array.isArray(trustPolicy.keys) ||
    trustPolicy.keys.length === 0
  ) {
    throw new Error(
      'source maintenance inventory trust policy가 활성 정본이 아닙니다.',
    );
  }
  if (
    !hasExactKeys(artifact, [
      'schema',
      'work_id',
      'topic_id',
      'target_domain_id',
      'inventory_manifest',
      'inventory_signature',
      'selected_coordinate_ids',
    ]) ||
    artifact.schema !== 'rulelink_source_locator_selection_v2' ||
    artifact.work_id !== workId ||
    artifact.topic_id !== expectedTopicId ||
    artifact.target_domain_id !== expectedTargetDomainId ||
    !Number.isInteger(expectedSourceCount) ||
    expectedSourceCount < 1 ||
    !Array.isArray(artifact.selected_coordinate_ids) ||
    artifact.selected_coordinate_ids.length !== expectedSourceCount ||
    new Set(artifact.selected_coordinate_ids).size !==
      artifact.selected_coordinate_ids.length
  ) {
    throw new Error(`source locator 선택 산출물 구조 오류: ${workId}`);
  }

  const manifest = artifact.inventory_manifest;
  const signature = artifact.inventory_signature;
  const auditedOnEnd = Date.parse(`${auditedOn}T23:59:59.999Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(auditedOn ?? '') ||
    !Number.isFinite(auditedOnEnd) ||
    !hasExactKeys(manifest, [
      'schema',
      'inventory_id',
      'issuer',
      'source_repository',
      'source_commit_sha',
      'active_graph_sha256',
      'generated_at',
      'sources',
    ]) ||
    manifest.schema !== 'rulelink_source_maintenance_inventory_v1' ||
    manifest.issuer !== trustPolicy.issuer ||
    manifest.source_repository !== trustPolicy.source_repository ||
    !/^[0-9a-f]{40}$/u.test(manifest.source_commit_sha ?? '') ||
    !/^[0-9a-f]{64}$/u.test(manifest.active_graph_sha256 ?? '') ||
    !Number.isFinite(Date.parse(manifest.generated_at ?? '')) ||
    Date.parse(manifest.generated_at) > auditedOnEnd ||
    !Array.isArray(manifest.sources) ||
    manifest.sources.length === 0 ||
    !hasExactKeys(signature, [
      'algorithm',
      'issuer',
      'key_id',
      'signature_base64',
    ]) ||
    signature.algorithm !== 'Ed25519' ||
    signature.issuer !== trustPolicy.issuer ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(signature.signature_base64 ?? '')
  ) {
    throw new Error(`source maintenance inventory 구조 오류: ${workId}`);
  }
  const trustedKey = trustPolicy.keys.find(
    key =>
      hasExactKeys(key, [
        'algorithm',
        'key_id',
        'public_key_pem',
      ]) &&
      key.algorithm === signature.algorithm &&
      key.key_id === signature.key_id &&
      typeof key.public_key_pem === 'string' &&
      key.public_key_pem.length > 0,
  );
  if (
    !trustedKey ||
    !verifySignature(
      null,
      Buffer.from(canonicalJson(manifest), 'utf8'),
      trustedKey.public_key_pem,
      Buffer.from(signature.signature_base64, 'base64'),
    )
  ) {
    throw new Error(`source maintenance inventory 서명 불일치: ${workId}`);
  }
  if (
    !['ahead', 'identical'].includes(ancestryComparison?.status) ||
    !Number.isInteger(ancestryComparison?.ahead_by) ||
    ancestryComparison.ahead_by < 0 ||
    (
      manifest.source_commit_sha ===
        trustPolicy.trusted_root_commit_sha &&
      (
        ancestryComparison.status !== 'identical' ||
        ancestryComparison.ahead_by !== 0
      )
    )
  ) {
    throw new Error(
      `source maintenance inventory commit이 승인 root의 후손이 아닙니다: ${workId}`,
    );
  }

  const remoteManifest = parseJson(
    remoteManifestRaw,
    'source maintenance inventory 원천',
    workId,
  );
  if (canonicalJson(remoteManifest) !== canonicalJson(manifest)) {
    throw new Error(
      `source maintenance inventory가 승인 commit 원시 행과 다릅니다: ${workId}`,
    );
  }
  if (sha256(activeGraphRaw) !== manifest.active_graph_sha256) {
    throw new Error(
      `source maintenance active graph 원시 바이트 해시가 다릅니다: ${workId}`,
    );
  }

  const locatorKeys = [
    'coordinate_id',
    'source_id',
    'source_snapshot_id',
    'law_name_ko',
    'article_no',
    'official_url',
    'last_verified_at',
    'target_domain_ids',
  ];
  const sourceByCoordinateId = new Map();
  for (const source of manifest.sources) {
    const verifiedAt = Date.parse(source?.last_verified_at ?? '');
    if (
      !hasExactKeys(source, locatorKeys) ||
      !locatorKeys
        .filter(key => key !== 'target_domain_ids')
        .every(
          key =>
            typeof source[key] === 'string' &&
            source[key].length > 0,
        ) ||
      !Array.isArray(source.target_domain_ids) ||
      source.target_domain_ids.length === 0 ||
      new Set(source.target_domain_ids).size !==
        source.target_domain_ids.length ||
      !source.target_domain_ids.includes(artifact.target_domain_id) ||
      !/^https:\/\//u.test(source.official_url) ||
      !Number.isFinite(verifiedAt) ||
      verifiedAt > auditedOnEnd
    ) {
      throw new Error(
        'source maintenance inventory locator가 승인 범위를 ' +
          `벗어났습니다: ${source?.coordinate_id ?? '?'}`,
      );
    }
    if (sourceByCoordinateId.has(source.coordinate_id)) {
      throw new Error(
        `source maintenance inventory locator 중복: ${source.coordinate_id}`,
      );
    }
    sourceByCoordinateId.set(source.coordinate_id, source);
  }
  const locators = artifact.selected_coordinate_ids.map(coordinateId => {
    const source = sourceByCoordinateId.get(coordinateId);
    if (!source) {
      throw new Error(
        `선택된 source locator가 서명된 inventory에 없습니다: ${coordinateId}`,
      );
    }
    const {target_domain_ids: _targetDomainIds, ...locator} = source;
    return locator;
  });

  const proof = sha256(canonicalJson({
    verificationMethod: 'source_locator_selection_v2',
    evidenceRef,
    artifactSha256: expectedArtifactSha256,
    trustPolicySha256: sha256(trustPolicyRaw),
    trustedRootCommitSha: trustPolicy.trusted_root_commit_sha,
    inventoryManifestPath: trustPolicy.inventory_manifest_path,
    activeGraphPath: trustPolicy.active_graph_path,
    inventoryManifestSha256: sha256(canonicalJson(manifest)),
    inventoryManifestRawSha256: sha256(remoteManifestRaw),
    inventorySignature: signature.signature_base64,
    activeGraphSha256: manifest.active_graph_sha256,
    sourceCommitSha: manifest.source_commit_sha,
    selectedCoordinateIds: [...artifact.selected_coordinate_ids].sort(),
  }));
  return {
    proof,
    selection: {
      work_id: workId,
      target_domain_id: artifact.target_domain_id,
      inventory_id: manifest.inventory_id,
      active_graph_sha256: manifest.active_graph_sha256,
      source_commit_sha: manifest.source_commit_sha,
      locators: locators.sort((left, right) =>
        left.coordinate_id.localeCompare(right.coordinate_id, 'en'),
      ),
    },
  };
}
