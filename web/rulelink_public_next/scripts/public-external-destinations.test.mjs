import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  publicExternalDestinationError,
  resolveOperatorContactDestination,
  resolveOptionalWorkspaceDestination,
  resolveProcessorContactDestination,
  resolveReviewerEvidenceDestination,
  validatePublicExternalDestinations,
} from '../src/lib/public-external-destinations.ts';
import {
  resolvePublicTrustConfig,
  validatePublicTrustConfiguration,
} from '../src/lib/public-trust.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('외부 목적지는 공식원문과 분리된 역할 계약을 사용한다', () => {
  assert.deepEqual(resolveOperatorContactDestination({
    href: 'mailto:contact@rulelink.kr?subject=correction',
    label: '콘텐츠 오류 제보',
  }), {
    href: 'mailto:contact@rulelink.kr?subject=correction',
    kind: 'mailto',
    label: '콘텐츠 오류 제보',
    role: 'operator_contact',
  });
  assert.equal(resolveReviewerEvidenceDestination({
    href: '/ko/trust/reviewers/bar-001',
    label: '검토자 승인 근거',
  })?.kind, 'internal');
  assert.equal(resolveReviewerEvidenceDestination({
    href: 'https://registry.rulelink.kr/reviewers/bar-001',
    label: '검토자 승인 근거',
  })?.kind, 'external_https');
  assert.equal(resolveProcessorContactDestination({
    href: 'https://processor.rulelink.kr/privacy',
    label: '처리자 연락처',
  })?.role, 'processor_contact');
});

test('선택 작업공간은 완전하고 공개 가능한 https일 때만 CTA를 연다', () => {
  assert.equal(resolveOptionalWorkspaceDestination({}), null);
  assert.equal(resolveOptionalWorkspaceDestination({
    RULELINK_PUBLIC_LAWYER_WORKSPACE_URL: 'https://workspace.rulelink.kr',
  }), null);
  const environment = {
    RULELINK_PUBLIC_LAWYER_WORKSPACE_LABEL: '승인된 계정으로 작업공간 열기',
    RULELINK_PUBLIC_LAWYER_WORKSPACE_URL: 'https://workspace.rulelink.kr',
  };
  assert.deepEqual(validatePublicExternalDestinations(environment), []);
  assert.deepEqual(resolveOptionalWorkspaceDestination(environment), {
    href: 'https://workspace.rulelink.kr',
    kind: 'external_https',
    label: '승인된 계정으로 작업공간 열기',
    role: 'optional_workspace',
  });
});

test('placeholder·credentials·내부/특수 IP·제어문자와 역할 밖 scheme을 차단한다', () => {
  for (const href of [
    'https://TODO.example.com',
    'https://user:secret@workspace.rulelink.kr',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://192.0.2.1',
    'https://[::1]',
    'https://[fc00::1]',
    'https://[2001:db8::1]',
    'https://service.internal',
    'https://workspace.rulelink.kr/\u0007',
    'https://workspace.rulelink.kr/%0d%0aheader',
  ]) {
    assert.ok(
      publicExternalDestinationError(
        'optional_workspace',
        href,
        '승인된 계정으로 작업공간 열기',
      ),
      href,
    );
  }
  assert.ok(publicExternalDestinationError(
    'optional_workspace',
    'mailto:workspace@rulelink.kr',
    '작업공간',
  ));
  assert.ok(publicExternalDestinationError(
    'reviewer_evidence',
    'mailto:reviewer@rulelink.kr',
    '승인 근거',
  ));
  assert.equal(publicExternalDestinationError(
    'operator_contact',
    '/ko/trust#contact',
    '운영자 연락',
  ), null);
});

test('trust 연락과 reviewer evidence도 같은 외부 목적지 검증을 통과해야 한다', () => {
  const environment = {
    RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON: JSON.stringify([{
      evidence_url: 'https://registry.rulelink.kr/reviewers/bar-001',
      name_ko: '검토자',
      qualification_ko: '대한민국 변호사',
      reviewer_registry_id: 'reviewer.bar-001',
    }]),
    RULELINK_PUBLIC_CONTACT_LABEL: '콘텐츠 오류 제보',
    RULELINK_PUBLIC_CONTACT_URL: 'mailto:contact@rulelink.kr?subject=correction',
    RULELINK_PUBLIC_OPERATOR_LEGAL_NAME: '운영 주체',
    RULELINK_PUBLIC_REVIEW_QUALIFICATION_DISCLOSURE: '검토 자격과 승인 근거를 공개합니다.',
    RULELINK_PUBLIC_TRUST_ENABLED: 'true',
  };
  assert.deepEqual(validatePublicTrustConfiguration(environment), []);
  const config = resolvePublicTrustConfig(environment);
  assert.equal(config?.contact.destination.role, 'operator_contact');
  assert.equal(
    config?.approvedReviewers.get('reviewer.bar-001')?.evidenceDestination.role,
    'reviewer_evidence',
  );
  const privateEvidence = structuredClone(environment);
  privateEvidence.RULELINK_PUBLIC_APPROVED_REVIEWERS_JSON = JSON.stringify([{
    evidence_url: 'https://127.0.0.1/reviewer',
    name_ko: '검토자',
    qualification_ko: '대한민국 변호사',
    reviewer_registry_id: 'reviewer.bar-001',
  }]);
  assert.ok(validatePublicTrustConfiguration(privateEvidence).some(
    error => error.includes('특수목적'),
  ));
});

test('공용 링크 UI는 외부 새 탭과 mailto 경계를 접근 가능한 텍스트로 표시한다', async () => {
  const component = await readFile(
    path.join(root, 'src/components/public-external-destination-link.tsx'),
    'utf8',
  );
  assert.match(component, /rel=\{external \? 'noopener noreferrer'/);
  assert.match(component, /target=\{external \? '_blank'/);
  assert.match(component, /외부 사이트, 새 탭/);
  assert.match(component, /이메일 보내기/);
  for (const filename of [
    'app/ko/lawyer-workspace/page.tsx',
    'app/ko/trust/page.tsx',
    'app/ko/privacy/page.tsx',
    'src/components/editorial-attribution.tsx',
  ]) {
    const source = await readFile(path.join(root, filename), 'utf8');
    assert.match(source, /PublicExternalDestinationLink/, filename);
  }
});

test('공식원문은 외부 목적지 설정에 섞지 않고 기존 URL 검증과 새 탭 보호를 유지한다', async () => {
  const officialFiles = [
    'src/components/authority-reading-card.tsx',
    'src/components/knowledge-source-library.tsx',
    'app/ko/knowledge/[slug]/page.tsx',
    'app/ko/changes/[slug]/page.tsx',
    'app/ko/concepts/[slug]/page.tsx',
    'app/ko/issues/[slug]/page.tsx',
  ];
  for (const filename of officialFiles) {
    const source = await readFile(path.join(root, filename), 'utf8');
    assert.doesNotMatch(source, /PublicExternalDestinationLink/, filename);
    assert.match(source, /rel="noopener noreferrer"/, filename);
    assert.match(source, /target="_blank"/, filename);
  }
  const officialValidator = await readFile(
    path.join(root, 'src/lib/official-source-url.ts'),
    'utf8',
  );
  assert.match(officialValidator, /law\.go\.kr/);
});

test('운영 코드에는 과거 작업공간 주소가 남지 않는다', async () => {
  const files = [
    ...await sourceFiles(path.join(root, 'app')),
    ...await sourceFiles(path.join(root, 'src')),
    ...await sourceFiles(path.join(root, 'scripts')),
  ];
  for (const filename of files.filter(file => !file.endsWith('.test.mjs'))) {
    const source = await readFile(filename, 'utf8');
    assert.doesNotMatch(source, /liale-review\.lolphysical\.xyz/u, filename);
  }
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (/\.(?:ts|tsx|mjs)$/u.test(entry.name)) files.push(target);
  }
  return files;
}
