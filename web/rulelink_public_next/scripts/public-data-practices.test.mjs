import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  resolvePublicDataPractices,
  resolvePublicPrivacyConfig,
  validatePublicPrivacyConfiguration,
} from '../src/lib/public-data-practices.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [layout, sitemap, privacyPage, workspace, envExample] = await Promise.all([
  readFile(path.join(root, 'app/layout.tsx'), 'utf8'),
  readFile(path.join(root, 'app/sitemap.ts'), 'utf8'),
  readFile(path.join(root, 'app/ko/privacy/page.tsx'), 'utf8'),
  readFile(path.join(root, 'src/components/knowledge-action-workspace.tsx'), 'utf8'),
  readFile(path.join(root, '.env.example'), 'utf8'),
]);

export const completePrivacyEnvironment = {
  RULELINK_PUBLIC_TRUST_ENABLED: 'true',
  RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON: '[]',
  RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: '리알레 주식회사',
  RULELINK_PUBLIC_CONTACT_LABEL: '개인정보 문의',
  RULELINK_PUBLIC_CONTACT_URL: 'mailto:privacy@rulelink.kr',
  RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE:
    '법률 검토자의 승인 원장과 자격 근거를 콘텐츠별로 공개합니다.',
  RULELINK_PUBLIC_PRIVACY_ENABLED: 'true',
  RULELINK_PUBLIC_PRIVACY_VERSION: '2026-07-24-v1',
  RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE: '2026-07-24',
  RULELINK_PUBLIC_PRIVACY_WITHDRAWAL:
    '각 상세 글의 표시 초기화 버튼으로 기기 저장 상태를 즉시 삭제할 수 있습니다.',
  RULELINK_PUBLIC_HOSTING_PROVIDER: 'Vercel Inc.',
  RULELINK_PUBLIC_HOSTING_PURPOSE:
    '웹사이트 제공, 보안 유지와 오류 진단을 위한 요청 로그 처리',
  RULELINK_PUBLIC_HOSTING_DATA_TYPES_JSON: JSON.stringify([
    'IP 주소',
    '요청 시각',
    '요청 URL',
    '사용자 에이전트',
  ]),
  RULELINK_PUBLIC_HOSTING_RETENTION: '30일',
  RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON: JSON.stringify([
    '대한민국',
    '미국',
  ]),
  RULELINK_PUBLIC_HOSTING_TRANSFER_THIRD_PARTY: 'true',
  RULELINK_PUBLIC_HOSTING_TRANSFER_DESCRIPTION:
    '호스팅 제공자가 사이트 제공과 보안을 위해 위 항목을 대한민국과 미국에서 처리',
  RULELINK_PUBLIC_ANALYTICS_ENABLED: 'false',
  RULELINK_PUBLIC_ADVERTISING_ENABLED: 'false',
};

test('기본 데이터 처리 정본은 체크리스트만 활성이고 분석·광고는 denied다', () => {
  const inventory = resolvePublicDataPractices({});
  assert.deepEqual(inventory.map(item => [
    item.id,
    item.category,
    item.status,
    item.activationMode,
  ]), [
    ['device-checklist', 'functional', 'active', 'after-user-action'],
    ['analytics-disabled', 'analytics', 'disabled', 'denied'],
    ['advertising-disabled', 'advertising', 'disabled', 'denied'],
  ]);
  const checklist = inventory[0];
  assert.deepEqual(checklist.storageKeys, [
    'rulelink-checklist-v1:{content_id}:{revision_key}',
  ]);
  assert.equal(checklist.transfer.serverTransmission, false);
  assert.equal(checklist.transfer.thirdPartyTransmission, false);
  assert.match(workspace, /rulelink-checklist-v1/);
});

test('공개 런타임에는 광고·분석·쿠키·비콘 코드가 없고 localStorage 소유자는 하나다', async () => {
  const files = [
    ...await sourceFiles(path.join(root, 'app')),
    ...await sourceFiles(path.join(root, 'src')),
  ];
  const rows = await Promise.all(files.map(async filename => ({
    filename,
    source: await readFile(filename, 'utf8'),
  })));
  for (const row of rows) {
    assert.doesNotMatch(
      row.source,
      /(?:googletag|google-analytics|doubleclick|gtag\s*\(|sendBeacon\s*\(|document\.cookie|<iframe)/iu,
      row.filename,
    );
  }
  const storageOwners = rows
    .filter(row => /(?:localStorage|sessionStorage)/u.test(row.source))
    .map(row => path.relative(root, row.filename).replaceAll('\\', '/'));
  assert.deepEqual(storageOwners, [
    'src/components/knowledge-action-workspace.tsx',
  ]);
});

test('기본 설정은 privacy 404·footer/sitemap 링크 0의 resolver 상태다', () => {
  assert.equal(resolvePublicPrivacyConfig({}), null);
  assert.deepEqual(validatePublicPrivacyConfiguration({}), []);
  assert.match(privacyPage, /if \(!config\) notFound\(\)/);
  assert.match(layout, /privacyConfig \? <a href="\/ko\/privacy">/);
  assert.match(sitemap, /\.\.\.\(privacyConfig \? \[\{/);
});

test('완전한 운영 사실만 privacy와 hosting inventory를 연다', () => {
  assert.deepEqual(
    validatePublicPrivacyConfiguration(completePrivacyEnvironment),
    [],
  );
  const config = resolvePublicPrivacyConfig(completePrivacyEnvironment);
  assert.ok(config);
  assert.equal(config.trust.operatorLegalName, '리알레 주식회사');
  assert.deepEqual(config.inventory.map(item => item.id), [
    'hosting-request-logs',
    'device-checklist',
    'analytics-disabled',
    'advertising-disabled',
  ]);
  assert.deepEqual(config.inventory[0].dataTypes, [
    'IP 주소',
    '요청 시각',
    '요청 URL',
    '사용자 에이전트',
  ]);
  assert.equal(config.inventory[0].transfer.thirdPartyTransmission, true);
});

test('privacy 필수 사실·자리표시자·잘못된 날짜는 fail-closed다', () => {
  for (const field of [
    'RULELINK_PUBLIC_PRIVACY_VERSION',
    'RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE',
    'RULELINK_PUBLIC_PRIVACY_WITHDRAWAL',
    'RULELINK_PUBLIC_HOSTING_PROVIDER',
    'RULELINK_PUBLIC_HOSTING_PURPOSE',
    'RULELINK_PUBLIC_HOSTING_DATA_TYPES_JSON',
    'RULELINK_PUBLIC_HOSTING_RETENTION',
    'RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON',
    'RULELINK_PUBLIC_HOSTING_TRANSFER_THIRD_PARTY',
    'RULELINK_PUBLIC_HOSTING_TRANSFER_DESCRIPTION',
  ]) {
    const environment = {...completePrivacyEnvironment};
    delete environment[field];
    assert.ok(
      validatePublicPrivacyConfiguration(environment).some(
        error => error.includes(field),
      ),
      field,
    );
    assert.equal(resolvePublicPrivacyConfig(environment), null);
  }
  assert.ok(validatePublicPrivacyConfiguration({
    ...completePrivacyEnvironment,
    RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE: '2026-02-30',
  }).some(error => error.includes('EFFECTIVE_DATE')));
  assert.ok(validatePublicPrivacyConfiguration({
    ...completePrivacyEnvironment,
    RULELINK_PUBLIC_HOSTING_PROVIDER: 'TODO provider',
  }).some(error => error.includes('HOSTING_PROVIDER')));
});

test('분석·광고 활성화는 검증된 CMP가 있어도 현재 구현에서 거부한다', () => {
  for (const field of [
    'RULELINK_PUBLIC_ANALYTICS_ENABLED',
    'RULELINK_PUBLIC_ADVERTISING_ENABLED',
  ]) {
    const withoutCmp = validatePublicPrivacyConfiguration({
      ...completePrivacyEnvironment,
      [field]: 'true',
    });
    assert.ok(withoutCmp.some(error => error.includes('CERTIFIED_CMP_PROVIDER')));
    const withCmp = validatePublicPrivacyConfiguration({
      ...completePrivacyEnvironment,
      [field]: 'true',
      RULELINK_PUBLIC_CERTIFIED_CMP_PROVIDER: 'Certified Consent Platform',
    });
    assert.ok(withCmp.some(error => error.includes('지원하지 않습니다')));
    assert.equal(resolvePublicPrivacyConfig({
      ...completePrivacyEnvironment,
      [field]: 'true',
      RULELINK_PUBLIC_CERTIFIED_CMP_PROVIDER: 'Certified Consent Platform',
    }), null);
  }
});

test('화면·설정 예시는 단일 inventory와 필요한 운영 필드를 소비한다', () => {
  for (const phrase of [
    'config.inventory.map',
    'data-practice-status',
    '서버 전송',
    '제3자 전송',
    '수탁·이전 설명',
  ]) assert.match(privacyPage, new RegExp(phrase));
  for (const field of [
    'RULELINK_PUBLIC_PRIVACY_ENABLED',
    'RULELINK_PUBLIC_PRIVACY_VERSION',
    'RULELINK_PUBLIC_HOSTING_DATA_TYPES_JSON',
    'RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON',
    'RULELINK_PUBLIC_ANALYTICS_ENABLED',
    'RULELINK_PUBLIC_ADVERTISING_ENABLED',
  ]) assert.match(envExample, new RegExp(field));
  assert.doesNotMatch(privacyPage, /lolphysical\.xyz|google-analytics|doubleclick/i);
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (/\.(?:ts|tsx)$/u.test(entry.name)) files.push(target);
  }
  return files;
}
