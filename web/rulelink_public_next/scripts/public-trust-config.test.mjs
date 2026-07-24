import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  resolveAdvertisingPlaceholdersEnabled,
  resolvePublicTrustConfig,
  validatePublicTrustConfiguration,
} from '../src/lib/public-trust.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [trustPage, layout, header, sitemap, envExample] = await Promise.all([
  readFile(path.join(root, 'app/ko/trust/page.tsx'), 'utf8'),
  readFile(path.join(root, 'app/layout.tsx'), 'utf8'),
  readFile(path.join(root, 'src/components/site-header.tsx'), 'utf8'),
  readFile(path.join(root, 'app/sitemap.ts'), 'utf8'),
  readFile(path.join(root, '.env.example'), 'utf8'),
]);

const validEnvironment = {
  RULELINK_PUBLIC_TRUST_ENABLED: 'true',
  RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: '검증용 운영 법인',
  RULELINK_PUBLIC_CONTACT_LABEL: '오류 제보',
  RULELINK_PUBLIC_CONTACT_URL: 'mailto:trust@example.test',
  RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE:
    '검증용 법률 검토 자격을 콘텐츠별로 공개합니다.',
};

test('기본 023 환경에서는 신뢰 페이지·편집자 표지·광고 준비 영역을 공개하지 않는다', () => {
  assert.equal(resolvePublicTrustConfig({}), null);
  assert.equal(resolveAdvertisingPlaceholdersEnabled({}), false);
  assert.deepEqual(validatePublicTrustConfiguration({}), []);
  assert.match(layout, /hasTrustPage=\{Boolean\(trustConfig\)\}/);
  assert.match(header, /hasTrustPage \? <a href="\/ko\/trust">/);
  assert.match(sitemap, /\.\.\.\(trustConfig \? \[\{/);
});

test('신뢰 페이지 활성화는 실제 법인·연락·자격 공개값을 모두 요구한다', () => {
  const errors = validatePublicTrustConfiguration({
    RULELINK_PUBLIC_TRUST_ENABLED: 'true',
  });
  for (const field of [
    'RULELINK_PUBLIC_OPERATOR_LEGAL_NAME',
    'RULELINK_PUBLIC_CONTACT_LABEL',
    'RULELINK_PUBLIC_CONTACT_URL',
    'RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE',
  ]) assert.ok(errors.some(error => error.includes(field)), field);

  const placeholderErrors = validatePublicTrustConfiguration({
    ...validEnvironment,
    RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: 'TODO',
  });
  assert.ok(placeholderErrors.some(error => /예시·미정/.test(error)));

  assert.deepEqual(validatePublicTrustConfiguration(validEnvironment), []);
  assert.equal(
    resolvePublicTrustConfig(validEnvironment)?.operatorLegalName,
    '검증용 운영 법인',
  );
});

test('편집자 표지나 광고를 신뢰 공개정보보다 먼저 켤 수 없다', () => {
  assert.match(
    validatePublicTrustConfiguration(
      {RULELINK_PUBLIC_TRUST_ENABLED: 'false'},
      {hasEditorialAttribution: true},
    ).join('\n'),
    /편집자 표지/,
  );
  assert.match(
    validatePublicTrustConfiguration({
      RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED: 'true',
      RULELINK_PUBLIC_TRUST_ENABLED: 'false',
    }).join('\n'),
    /광고 준비 영역/,
  );
  assert.equal(resolveAdvertisingPlaceholdersEnabled({
    ...validEnvironment,
    RULELINK_PUBLIC_AD_PLACEHOLDERS_ENABLED: 'true',
  }), true);
});

test('공개 신뢰 페이지는 저장소로 증명하는 운영 경계와 설정 필드를 사용한다', () => {
  for (const phrase of [
    '운영·콘텐츠 제작',
    '자동화·AI 사용 범위',
    '출처·최신성',
    '수정·이의제기',
    '광고 독립성',
  ]) assert.match(trustPage, new RegExp(phrase));
  for (const field of [
    'RULELINK_PUBLIC_OPERATOR_LEGAL_NAME',
    'RULELINK_PUBLIC_CONTACT_LABEL',
    'RULELINK_PUBLIC_CONTACT_URL',
    'RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE',
  ]) assert.match(envExample, new RegExp(field));
  assert.doesNotMatch(trustPage, /lolphysical\.xyz|liale-review/);
});
