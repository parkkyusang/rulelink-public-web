import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  publicationStatusCounts,
  renderPublicationStatusSection,
  replacePublicationStatusSection,
  validatePublicationStatusSection,
} from './sync-readme-publication-status.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [readme, bundle] = await Promise.all([
  readFile(path.resolve(root, '..', '..', 'README.md'), 'utf8'),
  readFile(path.resolve(root, '..', '..', 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8').then(JSON.parse),
]);

test('README 공개본 현황은 현재 승인 번들에서 결정론적으로 생성한다', () => {
  assert.doesNotThrow(() => validatePublicationStatusSection(readme, bundle));
  const section = renderPublicationStatusSection(bundle);
  const counts = publicationStatusCounts(bundle);

  assert(section.includes(`\`${bundle.snapshot_id}\``));
  assert(section.includes(`생활법률 지식: ${counts.knowledgeEntries}개`));
  assert(section.includes(`법리카드: ${counts.ruleCards}개`));
  assert(section.includes(`사실분기: ${counts.scenarioBranches}개`));
  assert(section.includes(`공식 근거 좌표: ${counts.sources}개`));
});

test('README 공개본 검증과 쓰기는 LF·CRLF에서 같은 의미를 보존한다', () => {
  const lfReadme = readme.replace(/\r\n?/gu, '\n');
  const crlfReadme = lfReadme.replace(/\n/gu, '\r\n');

  assert.doesNotThrow(() => validatePublicationStatusSection(lfReadme, bundle));
  assert.doesNotThrow(() => validatePublicationStatusSection(crlfReadme, bundle));

  const nextLf = replacePublicationStatusSection(lfReadme, bundle);
  const nextCrlf = replacePublicationStatusSection(crlfReadme, bundle);
  assert.equal(nextLf.includes('\r\n'), false);
  assert.equal(nextCrlf.replace(/\r\n/gu, '').includes('\n'), false);
  assert.doesNotThrow(() => validatePublicationStatusSection(nextLf, bundle));
  assert.doesNotThrow(() => validatePublicationStatusSection(nextCrlf, bundle));
});

test('혼합 줄바꿈과 단독 CR은 검증·쓰기를 모두 닫힌 상태로 거부한다', () => {
  const lfReadme = readme.replace(/\r\n?/gu, '\n');
  const mixedSection = lfReadme.replace(
    '<!-- RULELINK_PUBLICATION_STATUS:START -->\n',
    '<!-- RULELINK_PUBLICATION_STATUS:START -->\r\n',
  );
  const mixedOutsideSection = lfReadme.replace(
    '\n## 최신성 일일 점검',
    '\r\n## 최신성 일일 점검',
  );
  const bareCr = lfReadme.replace(/\n/gu, '\r');

  assert.throws(
    () => validatePublicationStatusSection(mixedSection, bundle),
    /LF와 CRLF 줄바꿈이 섞여 있습니다/,
  );
  assert.throws(
    () => replacePublicationStatusSection(mixedOutsideSection, bundle),
    /LF와 CRLF 줄바꿈이 섞여 있습니다/,
  );
  assert.throws(
    () => validatePublicationStatusSection(bareCr, bundle),
    /단독 CR 줄바꿈은 지원하지 않습니다/,
  );
});

test('스냅샷이나 공개 수치가 바뀌면 LF·CRLF 모두 거부한다', () => {
  const lfReadme = readme
    .replace(/\r\n?/gu, '\n')
    .replace(bundle.snapshot_id, `${bundle.snapshot_id}-wrong`);
  const crlfReadme = lfReadme.replace(/\n/gu, '\r\n');

  assert.throws(
    () => validatePublicationStatusSection(lfReadme, bundle),
    /현재 공개본 정보가 승인 번들과 다릅니다/,
  );
  assert.throws(
    () => validatePublicationStatusSection(crlfReadme, bundle),
    /현재 공개본 정보가 승인 번들과 다릅니다/,
  );
});
