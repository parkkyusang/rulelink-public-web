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
  assert.match(publicationSource, /scenario\.rule_ids[\s\S]*ruleById\.get/);
  assert.match(pageSource, /scenarioRules\[branch\.scenario_id\]/);
  assert.match(pageSource, /이 사실분기에 연결된 법리/);
  assert.match(pageSource, /href=\{`#\$\{rule\.rule_id\}`\}/);
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
