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
  RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON: JSON.stringify([{
    evidence_url: 'https://rulelink.kr/ko/trust/reviewers/kr-bar-2026-001',
    name_ko: '김법률',
    qualification_ko: '대한민국 변호사',
    reviewer_registry_id: 'reviewer.kr-bar.2026-001',
  }]),
  RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: '룰링크 정보서비스 운영 주체',
  RULELINK_PUBLIC_CONTACT_LABEL: '오류 제보',
  RULELINK_PUBLIC_CONTACT_URL: 'mailto:corrections@rulelink.kr',
  RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE:
    '법률 검토자의 승인 원장과 자격 근거를 콘텐츠별로 공개합니다.',
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
    RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: 'TODO 법인',
  });
  assert.ok(placeholderErrors.some(error => /시험·예시·미정/.test(error)));

  assert.deepEqual(validatePublicTrustConfiguration(validEnvironment), []);
  assert.equal(
    resolvePublicTrustConfig(validEnvironment)?.operatorLegalName,
    '룰링크 정보서비스 운영 주체',
  );
});

test('신원·https·내부경로·mailto 경계를 공용 검증기로 닫는다', () => {
  for (const value of [
    '테스트 운영사',
    'sample reviewer',
    'fixture 자격',
    '가상 법인',
    '예시 담당자',
  ]) {
    const errors = validatePublicTrustConfiguration({
      ...validEnvironment,
      RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: value,
    });
    assert.ok(errors.some(error => /시험·예시·미정/.test(error)), value);
  }
  for (const url of [
    'https://?',
    'https://user:password@rulelink.kr/contact',
    'mailto:not-an-address',
    'mailto:corrections@rulelink.kr?redirect=https://evil.invalid',
  ]) {
    const errors = validatePublicTrustConfiguration({
      ...validEnvironment,
      RULELINK_PUBLIC_CONTACT_URL: url,
    });
    assert.ok(errors.some(error => /RULELINK_PUBLIC_CONTACT_URL/.test(error)), url);
  }
  assert.deepEqual(validatePublicTrustConfiguration({
    ...validEnvironment,
    RULELINK_PUBLIC_CONTACT_URL:
      'mailto:corrections@rulelink.kr?subject=%EC%98%A4%EB%A5%98%20%EC%A0%9C%EB%B3%B4',
  }), []);
});

test('편집자 표지는 승인 reviewer registry 참조가 없으면 공개할 수 없다', () => {
  const attribution = {
    author: {
      kind: 'organization',
      name_ko: '룰링크 콘텐츠 운영팀',
      role_ko: '법률정보 작성·편집',
    },
    legal_reviewer: {
      reviewer_registry_id: 'reviewer.kr-bar.2026-999',
      reviewed_at: '2026-07-23T00:00:00+09:00',
      review_areas_ko: ['상속'],
    },
  };
  const errors = validatePublicTrustConfiguration(validEnvironment, {
    editorialAttributions: [attribution],
  });
  assert.ok(errors.some(error => /승인 참조.*없습니다/.test(error)));
  assert.deepEqual(validatePublicTrustConfiguration(validEnvironment, {
    editorialAttributions: [{
      ...attribution,
      legal_reviewer: {
        ...attribution.legal_reviewer,
        reviewer_registry_id: 'reviewer.kr-bar.2026-001',
      },
    }],
  }), []);
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
    'RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON',
  ]) assert.match(envExample, new RegExp(field));
  assert.doesNotMatch(trustPage, /lolphysical\.xyz|liale-review/);
});
