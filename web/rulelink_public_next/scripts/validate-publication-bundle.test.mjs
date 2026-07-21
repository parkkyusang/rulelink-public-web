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

test('공개 지식의 실천 안내가 부족하면 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.content_entries[0].action_steps_ko = [];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /action_steps_ko는 2개 이상/);
});

test('공개 지식의 완성 본문이 비어 있으면 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.content_entries[0].body_sections[0].paragraphs_ko = [];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /paragraphs_ko는 1개 이상/);
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

test('공개 지식 근거의 URL이 법령명과 조문번호에 맞지 않으면 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.sources[0].official_url = 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%ED%85%8C%EC%8A%A4%ED%8A%B8%EB%B2%95/%EC%A0%9C2%EC%A1%B0';
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /법령명·조문번호와 일치하는 안정 주소/);
});

test('공개 지식 근거의 법령명이나 조문번호가 없으면 거부한다', async () => {
  const bundle = knowledgeBundle();
  delete bundle.knowledge.sources[0].article_no;
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /article_no가 유효한 조문 표기가 아닙니다/);
});

test('미래 근거 점검시각을 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.sources[0].last_verified_at = '2026-07-22T00:00:00+09:00';
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /검증 기준시각보다 미래/);
});


test('법령변화의 끊어진 문제카드 참조를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.change_briefs = [changeBrief({related_issue_card_ids: ['issue.missing']})];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /related_issue_card_ids.*존재하지 않는 참조/);
});

test('공개 주제의 끊어진 문제카드 참조를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.catalog = {
    schema: 'rulelink_public_catalog_v1',
    topics: [{topic_id: 'topic.one', issue_card_ids: ['issue.missing']}],
  };
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /공개 주제.*존재하지 않는 참조/);
});

test('승인 문제카드와 법령변화의 정상 연결을 허용한다', async () => {
  const bundle = baseBundle();
  bundle.cards = [issueCard()];
  bundle.change_briefs = [changeBrief({related_issue_card_ids: ['issue.one']})];
  const result = await validate(bundle);
  assert.equal(result.status, 0, result.stderr);
});


test('중복된 문제카드 공개 URL 식별자를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.cards = [
    issueCard(),
    issueCard({issue_card_id: 'issue.two'}),
  ];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /공개 URL 식별자가 중복됩니다/);
});

test('공개 URL에 부적합한 법령변화 식별자를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.change_briefs = [changeBrief({slug: '한글 주소'})];
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /영문 소문자·숫자·하이픈/);
});

test('중복된 지식 콘텐츠 공개 URL 식별자를 거부한다', async () => {
  const bundle = knowledgeBundle();
  bundle.knowledge.content_entries.push({
    ...bundle.knowledge.content_entries[0],
    content_id: 'content.two',
  });
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /지식 콘텐츠의 공개 URL 식별자가 중복됩니다/);
});


test('공개 콘텐츠가 있는데 해시 영수증이 없는 출판본을 거부한다', async () => {
  const bundle = baseBundle();
  bundle.cards = [issueCard()];
  bundle.file_hashes = {};
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /파일 해시 영수증이 필요합니다/);
});

test('형식이 잘못된 출판 파일 해시를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.file_hashes = {'issue:one': 'not-a-sha256'};
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /소문자 64자리 SHA-256/);
});

test('내부 경로 형태의 출판 파일 해시 키를 거부한다', async () => {
  const bundle = baseBundle();
  bundle.file_hashes = {'C:\\internal\\approval.json': 'a'.repeat(64)};
  const result = await validate(bundle);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /공개할 수 없는 키/);
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
    file_hashes: {'fixture:approval': 'a'.repeat(64)},
  };
}



function issueCard(overrides = {}) {
  return {
    issue_card_id: 'issue.one',
    slug: 'issue-one',
    editorial_status: 'approved',
    reviewed_at: '2026-07-21T09:00:00+09:00',
    expires_at: '2026-10-21T00:00:00+09:00',
    assertion_ids: [],
    ...overrides,
  };
}

function changeBrief(overrides = {}) {
  return {
    change_brief_id: 'brief.lifecycle',
    slug: 'brief-lifecycle',
    editorial_status: 'approved',
    lifecycle: 'future_effective',
    effective_date: '2026-08-01',
    reviewed_at: '2026-07-21T09:00:00+09:00',
    expires_at: '2026-10-21T00:00:00+09:00',
    related_issue_card_ids: [],
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
        source_id: 'test_law_ko_0001',
        law_name_ko: '테스트법',
        article_no: '제1조',
        official_url: 'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%ED%85%8C%EC%8A%A4%ED%8A%B8%EB%B2%95/%EC%A0%9C1%EC%A1%B0',
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
        key_points_ko: ['적용 기준을 확인합니다.', '사실관계를 구분합니다.'],
        action_steps_ko: ['기준일을 확인합니다.', '관련 자료를 보관합니다.'],
        facts_to_check_ko: ['기준일', '당사자 지위'],
        caution_ko: '구체적인 사실에 따라 결론이 달라질 수 있습니다.',
        search_intents_ko: ['검증 콘텐츠'],
        body_sections: [{
          heading_ko: '판단 순서',
          paragraphs_ko: ['기준과 사실을 순서대로 대조합니다.'],
        }],
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
