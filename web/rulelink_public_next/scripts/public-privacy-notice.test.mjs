import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {resolvePublicPrivacyNoticeConfig} from '../src/lib/public-privacy-notice.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [page, envExample, noticeSource] = await Promise.all([
  readFile(path.join(root, 'app/ko/privacy/page.tsx'), 'utf8'),
  readFile(path.join(root, '.env.example'), 'utf8'),
  readFile(path.join(root, 'src/lib/public-privacy-notice.ts'), 'utf8'),
]);

const environment = {
  RULELINK_PUBLIC_PRIVACY_NOTICE_ENABLED: 'true',
  RULELINK_PUBLIC_TRUST_ENABLED: 'true',
  RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON: '[]',
  RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: '박규상',
  RULELINK_PUBLIC_CONTACT_LABEL: 'nonef.bak@gmail.com',
  RULELINK_PUBLIC_CONTACT_URL: 'mailto:nonef.bak@gmail.com',
  RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE: '전문 법률 검토자의 자격과 개별 검토 여부는 현재 별도로 공시하지 않습니다',
};

test('privacy notice is opt-in and requires a valid public trust contact', () => {
  assert.equal(resolvePublicPrivacyNoticeConfig({}), null);
  assert.equal(resolvePublicPrivacyNoticeConfig({
    RULELINK_PUBLIC_PRIVACY_NOTICE_ENABLED: 'true',
  }), null);
  const notice = resolvePublicPrivacyNoticeConfig(environment);
  assert.ok(notice);
  assert.equal(notice.effectiveDate, '2026-10-31');
  assert.equal(notice.trust.operatorLegalName, '박규상');
  assert.equal(notice.trust.contact.href, 'mailto:nonef.bak@gmail.com');
  assert.match(notice.inquiryRetention, /30일/u);
  assert.match(notice.inquiryRetention, /분쟁 대응/u);
});

test('privacy notice keeps the factual boundary explicit', () => {
  for (const phrase of [
    '브라우저 저장소',
    '서버나 제3자에게 자동 전송하지 않으며',
    '방문 분석 또는 광고 제공을 위한 스크립트가 활성화되어 있지 않습니다',
    'Vercel의 구체적인 보관기간, 처리 지역 또는 국외이전의 법적 근거를 확정해 적지 않습니다',
    'RULELINK_PUBLIC_PRIVACY_NOTICE_ENABLED',
  ]) {
    assert.match(`${page}\n${envExample}\n${noticeSource}`, new RegExp(phrase, 'u'));
  }
  assert.match(noticeSource, /문의 처리가 끝난 날부터 30일 이내 삭제합니다/u);
  assert.doesNotMatch(page, /한국에서만 처리|보관기간 1일|개인정보를 전혀 수집하지/u);
});
