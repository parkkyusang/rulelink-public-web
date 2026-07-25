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
import {parsePublicContactHref} from '../src/lib/public-trust.ts';

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
  RULELINK_PUBLIC_DESTRUCTION_PROCEDURE:
    '보유기간이 끝나거나 처리 목적이 달성된 항목을 확인한 뒤 지체 없이 파기합니다.',
  RULELINK_PUBLIC_DESTRUCTION_METHOD:
    '전자 기록은 복구할 수 없는 방식으로 삭제하고 종이 기록은 분쇄합니다.',
  RULELINK_PUBLIC_RIGHTS_DESCRIPTION:
    '정보주체는 열람·정정·삭제·처리정지를 요구할 수 있습니다.',
  RULELINK_PUBLIC_RIGHTS_EXERCISE_METHOD:
    '공개 연락처로 본인 확인에 필요한 최소 정보와 요청 내용을 보냅니다.',
  RULELINK_PUBLIC_LEGAL_REPRESENTATIVE_RIGHTS:
    '법정대리인은 적법한 대리권을 확인한 뒤 같은 방법으로 권리를 행사할 수 있습니다.',
  RULELINK_PUBLIC_PRIVACY_RESPONSIBLE_ROLE:
    '개인정보 보호 및 고충처리 담당 부서',
  RULELINK_PUBLIC_PRIVACY_SAFEGUARDS_JSON: JSON.stringify([
    '최소권한 접근통제',
    '전송구간 암호화',
    '보존기간 만료 자동 삭제',
  ]),
  RULELINK_PUBLIC_HOSTING_PROVIDER: 'Vercel Inc.',
  RULELINK_PUBLIC_HOSTING_PROVIDER_CONTACT: 'mailto:privacy@vercel.com',
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
  RULELINK_PUBLIC_THIRD_PARTY_PROVISION_JSON: JSON.stringify({
    enabled: false,
    statement: '호스팅 요청 로그를 독립된 제3자에게 제공하지 않습니다.',
  }),
  RULELINK_PUBLIC_PROCESSING_OUTSOURCING_JSON: JSON.stringify({
    enabled: true,
    details: {
      practiceIds: ['hosting-request-logs'],
      safeguards: '계약과 접근통제로 처리 목적 밖 이용을 제한',
    },
  }),
  RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON: JSON.stringify({
    enabled: true,
    details: {
      legalBasis: '정보주체 동의가 아닌 서비스 제공 계약 이행에 필요한 처리 근거',
      practiceIds: ['hosting-request-logs'],
      countries: ['미국'],
      timingAndMethod: '페이지 요청 시 암호화된 네트워크로 이전',
      refusalMethodAndEffect: '사이트 이용을 중단해 이전을 거부할 수 있으나 페이지 제공이 제한됩니다.',
    },
  }),
  RULELINK_PUBLIC_AUTOMATIC_COLLECTION_JSON: JSON.stringify({
    enabled: false,
    statement: '쿠키·광고 식별자·분석 도구를 사용하지 않습니다.',
  }),
  RULELINK_PUBLIC_ANALYTICS_ENABLED: 'false',
  RULELINK_PUBLIC_ADVERTISING_ENABLED: 'false',
};

test('기본 데이터 처리 정본은 기기 내 선택 기능만 활성이고 분석·광고는 denied다', () => {
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
  assert.equal(checklist.transfer.thirdPartyProvision, false);
  assert.match(workspace, /rulelink-checklist-v1/);
});

test('공개 런타임에는 광고·분석·쿠키·비콘 코드가 없고 localStorage 소유자가 정본과 일치한다', async () => {
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
  assert.equal(config.inventory[0].transfer.thirdPartyProvision, false);
  assert.equal(config.inventory[0].transfer.processingOutsourcing, true);
  assert.equal(config.inventory[0].transfer.internationalTransfer, true);
  assert.equal(config.processingOutsourcing.enabled, true);
});

test('privacy 필수 사실·자리표시자·잘못된 날짜는 fail-closed다', () => {
  for (const field of [
    'RULELINK_PUBLIC_PRIVACY_VERSION',
    'RULELINK_PUBLIC_PRIVACY_EFFECTIVE_DATE',
    'RULELINK_PUBLIC_PRIVACY_WITHDRAWAL',
    'RULELINK_PUBLIC_HOSTING_PROVIDER',
    'RULELINK_PUBLIC_HOSTING_PROVIDER_CONTACT',
    'RULELINK_PUBLIC_HOSTING_PURPOSE',
    'RULELINK_PUBLIC_HOSTING_DATA_TYPES_JSON',
    'RULELINK_PUBLIC_HOSTING_RETENTION',
    'RULELINK_PUBLIC_HOSTING_PROCESSING_REGIONS_JSON',
    'RULELINK_PUBLIC_DESTRUCTION_PROCEDURE',
    'RULELINK_PUBLIC_DESTRUCTION_METHOD',
    'RULELINK_PUBLIC_RIGHTS_DESCRIPTION',
    'RULELINK_PUBLIC_RIGHTS_EXERCISE_METHOD',
    'RULELINK_PUBLIC_LEGAL_REPRESENTATIVE_RIGHTS',
    'RULELINK_PUBLIC_PRIVACY_RESPONSIBLE_ROLE',
    'RULELINK_PUBLIC_PRIVACY_SAFEGUARDS_JSON',
    'RULELINK_PUBLIC_THIRD_PARTY_PROVISION_JSON',
    'RULELINK_PUBLIC_PROCESSING_OUTSOURCING_JSON',
    'RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON',
    'RULELINK_PUBLIC_AUTOMATIC_COLLECTION_JSON',
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
  assert.ok(validatePublicPrivacyConfiguration({
    ...completePrivacyEnvironment,
    RULELINK_PUBLIC_HOSTING_PROVIDER_CONTACT: 'not-a-public-contact',
  }).some(error => error.includes('HOSTING_PROVIDER_CONTACT')));
  assert.ok(validatePublicPrivacyConfiguration({
    ...completePrivacyEnvironment,
    RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON: JSON.stringify({
      enabled: true,
      details: {practiceIds: ['hosting-request-logs']},
    }),
  }).some(error => error.includes('INTERNATIONAL_TRANSFER')));
  assert.ok(validatePublicPrivacyConfiguration({
    ...completePrivacyEnvironment,
    RULELINK_PUBLIC_PROCESSING_OUTSOURCING_JSON: JSON.stringify({
      enabled: true,
      details: {
        practiceIds: ['unregistered-biometric-store'],
        safeguards: '접근 통제',
      },
    }),
  }).some(error => error.includes('알 수 없는 활성 처리 항목')));
  assert.ok(validatePublicPrivacyConfiguration({
    ...completePrivacyEnvironment,
    RULELINK_PUBLIC_INTERNATIONAL_TRANSFER_JSON: JSON.stringify({
      enabled: true,
      details: {
        legalBasis: '서비스 제공 계약',
        practiceIds: ['hosting-request-logs'],
        countries: ['독일'],
        timingAndMethod: '요청 시 전송',
        refusalMethodAndEffect: '이용 중단 시 전송되지 않음',
      },
    }),
  }).some(error => error.includes('처리지역에 없습니다')));
});

test('공용 연락처 파서는 mailto query를 링크에만 보존하고 주소와 분리한다', () => {
  assert.deepEqual(
    parsePublicContactHref('mailto:privacy@rulelink.kr?subject=privacy'),
    {
      address: 'privacy@rulelink.kr',
      href: 'mailto:privacy@rulelink.kr?subject=privacy',
      kind: 'email',
    },
  );
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
    '제3자 제공',
    '처리위탁',
    '국외이전',
    '파기절차',
    '안전성 확보조치',
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
