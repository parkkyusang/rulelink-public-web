import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');

test('사실분기와 연결 법리를 지식 상세 화면에 함께 노출한다', async () => {
  const [publicationSource, pageSource] = await Promise.all([
    readFile(path.join(root, 'src/lib/publication.ts'), 'utf8'),
    readFile(path.join(root, 'app/ko/knowledge/[slug]/page.tsx'), 'utf8'),
  ]);

  assert.match(publicationSource, /scenarioRules: Record<string, PublicRuleCard\[\]>/);
  assert.match(publicationSource, /resolveKnowledgeEntryGraph\(knowledge, entry\)/);
  assert.match(publicationSource, /sources: graph\.sources/);
  assert.match(publicationSource, /scenario\.rule_ids[\s\S]*ruleById\.get/);
  assert.match(publicationSource, /rules: graph\.rules,/);
  assert.match(pageSource, /scenarioRules\[branch\.scenario_id\]/);
  assert.match(pageSource, /이 사실분기에 연결된 법리/);
  assert.match(pageSource, /href=\{`#\$\{rule\.rule_id\}`\}/);
  assert.doesNotMatch(pageSource, /directRuleIds\.has\(rule\.rule_id\)/);
  assert.doesNotMatch(pageSource, /branchRuleChip/);
});

test('공개 사실분기의 법리 식별자가 실제 법리카드를 가리킨다', async () => {
  const bundle = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'artifacts/publication/current/bundle.json'),
      'utf8',
    ),
  );
  const ruleIds = new Set(bundle.knowledge.rule_cards.map(rule => rule.rule_id));

  for (const scenario of bundle.knowledge.scenario_branches) {
    for (const ruleId of scenario.rule_ids) {
      assert.ok(
        ruleIds.has(ruleId),
        `${scenario.scenario_id}의 연결 법리 ${ruleId}가 공개 법리카드에 있어야 합니다.`,
      );
    }
  }
});

test('상세 화면의 공식 근거는 콘텐츠·사실분기·법리 참조의 합집합이다', async () => {
  const bundle = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'artifacts/publication/current/bundle.json'),
      'utf8',
    ),
  );
  const knowledge = bundle.knowledge;
  const entry = knowledge.content_entries.find(
    candidate => candidate.content_id === 'content.admin-appeal.application-preparation',
  );
  assert(entry, '행정심판 신청 준비 콘텐츠가 필요합니다.');
  const scenarios = knowledge.scenario_branches.filter(
    scenario => entry.scenario_ids.includes(scenario.scenario_id),
  );
  const ruleIds = new Set([
    ...entry.rule_ids,
    ...scenarios.flatMap(scenario => scenario.rule_ids),
  ]);
  const rules = knowledge.rule_cards.filter(rule => ruleIds.has(rule.rule_id));
  const resolvedSourceIds = new Set([
    ...entry.source_coordinate_ids,
    ...scenarios.flatMap(scenario => scenario.source_coordinate_ids),
    ...rules.flatMap(rule => rule.source_coordinate_ids),
  ]);

  assert(
    resolvedSourceIds.has('coord.administrative-appeals-16-2.historical-2025-10-01'),
    '사실분기에서 연결된 종전 법령 근거가 상세 화면 근거 해석에 포함되어야 합니다.',
  );
});
