import fs from 'node:fs';
import path from 'node:path';

import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import type {TestInfo} from '@playwright/test';

type EvidenceOptions = {
  outputFile?: string;
};

export type AuthorityEvidenceCase = {
  artifacts?: Record<string, string>;
  dom?: Record<string, unknown>;
  failures?: Array<{
    actual?: unknown;
    assertion: string;
    expected?: unknown;
    selector?: string;
  }>;
  id: string;
  interaction?: Record<string, unknown>;
  measurements?: Record<string, unknown>;
  publicationSnapshotId?: string;
  route: string;
  status?: 'passed' | 'failed' | 'skipped';
  viewport?: {height: number; width: number};
  zeroState?: Record<string, unknown>;
};

export async function attachAuthorityEvidence(
  testInfo: TestInfo,
  evidence: AuthorityEvidenceCase,
): Promise<void> {
  await testInfo.attach('authority-evidence', {
    body: Buffer.from(JSON.stringify(evidence)),
    contentType: 'application/json',
  });
}

export default class AuthorityEvidenceReporter implements Reporter {
  private readonly cases: AuthorityEvidenceCase[] = [];
  private readonly outputFile: string;

  constructor(options: EvidenceOptions = {}) {
    this.outputFile = options.outputFile
      ?? 'test-results/authority-024/authority-release-evidence.json';
  }

  onBegin(_config: FullConfig): void {
    fs.mkdirSync(path.dirname(this.outputFile), {recursive: true});
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const evidenceAttachments = result.attachments
      .filter(attachment => attachment.name === 'authority-evidence');
    const artifacts = Object.fromEntries(
      result.attachments
        .filter(attachment => attachment.path)
        .map(attachment => [attachment.name, attachment.path!]),
    );
    if (!evidenceAttachments.length) {
      this.cases.push({
        artifacts,
        failures: result.errors.map(error => ({
          actual: error.message,
          assertion: 'Playwright test completed without authority evidence',
        })),
        id: test.titlePath().join(' > '),
        route: '',
        status: normalizeStatus(result.status),
      });
      return;
    }
    for (const attachment of evidenceAttachments) {
      try {
        const parsed = JSON.parse(
          attachment.body
            ? attachment.body.toString('utf8')
            : fs.readFileSync(attachment.path!, 'utf8'),
        ) as AuthorityEvidenceCase;
        parsed.status = normalizeStatus(result.status);
        parsed.artifacts = {...parsed.artifacts, ...artifacts};
        parsed.failures = [
          ...(parsed.failures ?? []),
          ...result.errors.map(error => ({
            actual: error.message,
            assertion: 'Playwright assertion',
          })),
        ];
        this.cases.push(parsed);
      } catch (error) {
        this.cases.push({
          artifacts,
          failures: [{
            actual: error instanceof Error ? error.message : String(error),
            assertion: 'authority evidence attachment parse',
          }],
          id: test.titlePath().join(' > '),
          route: '',
          status: 'failed',
        });
      }
    }
  }

  onEnd(result: FullResult): void {
    const zeroState = this.cases.find(item => item.zeroState)?.zeroState ?? null;
    const publicationSnapshotId = this.cases
      .map(item => item.publicationSnapshotId)
      .find(Boolean) ?? null;
    const payload = {
      schema: 'rulelink_authority_release_evidence_v1',
      release_id: process.env.RULELINK_AUTHORITY_TEST_MODE === 'release'
        ? '024'
        : '023-authority-browser-fixture',
      runtime_commit: 'ef842c1e4357edf4746090b49ff55846628f46f6',
      base_url: process.env.RULELINK_AUTHORITY_TEST_MODE === 'release'
        ? (process.env.RULELINK_AUTHORITY_RELEASE_BASE_URL ?? null)
        : `http://127.0.0.1:${process.env.RULELINK_AUTHORITY_FIXTURE_PORT ?? '8891'}`,
      publication_snapshot_id: publicationSnapshotId,
      tested_at: new Date().toISOString(),
      status: result.status,
      cases: this.cases,
      zero_state: zeroState,
    };
    fs.writeFileSync(this.outputFile, `${JSON.stringify(payload, null, 2)}\n`);
  }
}

function normalizeStatus(
  status: TestResult['status'],
): 'passed' | 'failed' | 'skipped' {
  if (status === 'passed') return 'passed';
  if (status === 'skipped') return 'skipped';
  return 'failed';
}
