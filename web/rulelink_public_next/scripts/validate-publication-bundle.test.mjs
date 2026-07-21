import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const validatorPath = fileURLToPath(new URL('./validate-publication-bundle.mjs', import.meta.url));

test('최소 승인 출판본을 허용한다', async () => {
  const result = await validate(baseBundle());
  assert.equal(result.status, 0, result.stderr);
});

test('내부 편집 미리보기 스키마를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.schema = 'rulelink_editorial_preview_bundle_v1';
  bundle.preview_only = true;
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /공개 빌드.*허용/);
});

test('미승인 법령변화 브리핑을 거부한다', async () => {
  const bundle = baseBundle();
  bundle.change_briefs = [{
    change_brief_id: 'brief.one',
    editorial_status: 'legal_reviewed',
    assertion_ids: [],
  }];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /승인 상태가 아닙니다/);
});

test('공개 지식 근거의 원문 해시를 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.sources[0].source_hash = 'sha256:not-public';
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source_hash/);
});

test('공개 지식의 끊어진 참조를 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.content_entries[0].rule_ids = ['rule.missing'];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /존재하지 않는 참조/);
});

test('허용되지 않은 컨시어지 주소를 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.content_entries[0].concierge_entry.href = 'https://example.com/review';
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /컨시어지 주소/);
});

test('내부 사건 경로와 내부 필드를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.internal_path = 'C:\\Users\\example\\inbox\\jobs\\one';
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /내부 전용 필드|내부 경로/);
});


test('재검토 기한이 지난 문제카드를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.cards = [{
    issue_card_id: 'issue.expired',
    editorial_status: 'approved',
    reviewed_at: '2026-07-01T00:00:00+09:00',
    expires_at: '2026-07-21T11:59:00+09:00',
    assertion_ids: [],
  }];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /재검토 기한이 지났습니다/);
});

test('재검토 기한이 지난 지식 콘텐츠를 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.content_entries[0].expires_at = '2026-07-21T11:59:00+09:00';
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /재검토 기한이 지났습니다/);
});

test('시행일이 도래한 시행 예정 브리핑을 거부한다', async () => {
  const bundle = baseBundle();
  bundle.change_briefs = [changeBrief({
    lifecycle: 'future_effective',
    effective_date: '2026-07-21',
  })];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /시행일이 도래했으므로 시행 예정 상태일 수 없습니다/);
});

test('미래 시행일을 최근 시행으로 표시한 브리핑을 거부한다', async () => {
  const bundle = baseBundle();
  bundle.change_briefs = [changeBrief({
    lifecycle: 'recently_effective',
    effective_date: '2026-07-22',
  })];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /시행일 전이므로 최근 시행 상태일 수 없습니다/);
});

test('검증되지 않은 주장 근거를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.assertions = [{
    assertion_id: 'assertion.unverified',
    source_coordinates: [{
      source_snapshot_id: 'snapshot.unverified',
      official_url: 'https://www.law.go.kr/법령/테스트법',
      last_verified_at: '2026-07-21T00:00:00+00:00',
      validation_status: 'unverified',
    }],
  }];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /검증 상태가 아닙니다/);
});

test('미래 근거 점검시각을 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.sources[0].last_verified_at = '2026-07-22T00:00:00+09:00';
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /검증 기준시각보다 미래/);
});

async function validate(payload) {
  const taskTemp = await mkdtemp(path.join(tmpdir(), 'rulelink-publication-guard-'));
  const bundlePath = path.join(taskTemp, 'bundle.json');
  await writeFile(bundlePath, JSON.stringify(payload), 'utf8');
  try {
    return spawnSync(process.execPath, [validatorPath], {
      cwd: taskTemp,
      encoding: 'utf8',
      env: {
        ...process.env,
        RULELINK_WEB_BUNDLE_PATH: bundlePath,
        RULELINK_VALIDATION_NOW: '2026-07-21T12:00:00+09:00',
      },
    });
  } finally {
    await rm(taskTemp, {recursive: true, force: true});
  }
}

function baseBundle() {
  return {
    schema: 'rulelink_published_bundle_v1',
    snapshot_id: 'snapshot.test',
    built_at: '2026-07-21T00:00:00+00:00',
    source_snapshot_id: 'source.test',
    jurisdiction: 'KR',
    locale: 'ko-KR',
    cards: [],
    assertions: [],
    change_briefs: [],
    file_hashes: {},
  };
}


function changeBrief(overrides = {}) {
  return {
    change_brief_id: 'brief.lifecycle',
    editorial_status: 'approved',
    lifecycle: 'future_effective',
    effective_date: '2026-08-01',
    reviewed_at: '2026-07-21T09:00:00+09:00',
    expires_at: '2026-10-21T00:00:00+09:00',
    assertion_ids: [],
    ...overrides,
  };
}

function knowledgeBundle() {
  return {
    ...baseBundle(),
    knowledge: {
      schema: 'rulelink_public_knowledge_index_v1',
      sources: [{
        coordinate_id: 'source.one',
        source_id: 'law.one',
        official_url: 'https://www.law.go.kr/법령/테스트법',
        source_snapshot_id: 'snapshot.one',
        last_verified_at: '2026-07-21T00:00:00+00:00',
      }],
      rule_cards: [{
        rule_id: 'rule.one',
        title_ko: '법리',
        proposition_ko: '검증용 법리입니다.',
        norm: {actor_ko: '당사자', conditions_ko: '요건', legal_effect_ko: '효과'},
        source_coordinate_ids: ['source.one'],
      }],
      scenario_branches: [{
        scenario_id: 'scenario.one',
        question_ko: '사실이 존재합니까?',
        decision_fact_ko: '판단 사실',
        when_true_ko: '법리가 적용됩니다.',
        when_false_ko: '추가 검토가 필요합니다.',
        rule_ids: ['rule.one'],
        source_coordinate_ids: ['source.one'],
      }],
      content_entries: [{
        content_id: 'content.one',
        content_type: 'doctrine_explainer',
        editorial_status: 'approved',
        reviewed_at: '2026-07-21T00:00:00+00:00',
        expires_at: '2026-10-21T00:00:00+00:00',
        slug: 'content-one',
        title_ko: '검증 콘텐츠',
        one_line_answer_ko: '검증 콘텐츠입니다.',
        audience_situation_ko: '법률정보를 찾는 경우',
        rule_ids: ['rule.one'],
        scenario_ids: ['scenario.one'],
        source_coordinate_ids: ['source.one'],
        hub_ids: ['hub.one'],
        related_content_ids: [],
        concierge_entry: {
          question_ko: '개별 검토가 필요합니까?',
          decision_facts_ko: ['구체적 사실'],
          href: 'https://liale-review.lolphysical.xyz',
        },
      }],
      topic_hubs: [{
        hub_id: 'hub.one',
        slug: 'hub-one',
        title_ko: '검증 허브',
        description_ko: '검증용 주제입니다.',
        content_ids: ['content.one'],
      }],
    },
  };
}
