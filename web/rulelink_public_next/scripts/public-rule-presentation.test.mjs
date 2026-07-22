import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  normalizePublicRuleCopy,
  samePublicRuleCopy,
  shouldShowPublicRuleProposition,
} from '../src/lib/public-rule-presentation.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const bundle = JSON.parse(await readFile(path.join(repoRoot, 'artifacts/publication/current/bundle.json'), 'utf8'));

test('문장부호와 종결어미만 다른 법리 문장을 같은 공개 문장으로 판정한다', () => {
  assert.equal(samePublicRuleCopy('이 경우 권리가 발생된다.', '이 경우 권리가 발생됩니다'), true);
  assert.equal(samePublicRuleCopy('적용 요건', '법률효과'), false);
});

test('현재 공개 지식 전체에서 법리 제목·명제·결과를 중복 표시하지 않는다', () => {
  const rulesById = new Map(bundle.knowledge.rule_cards.map(rule => [rule.rule_id, rule]));
  assert.ok(bundle.knowledge.content_entries.length >= 173, '현재 공개 지식 173건 이상을 전수 검사해야 합니다.');

  let checkedRuleReferences = 0;
  let suppressedPropositions = 0;
  for (const entry of bundle.knowledge.content_entries) {
    for (const ruleId of entry.rule_ids) {
      const rule = rulesById.get(ruleId);
      assert.ok(rule, `${entry.content_id}의 법리 ${ruleId}가 존재해야 합니다.`);
      const showProposition = shouldShowPublicRuleProposition(rule.proposition_ko, rule.norm.legal_effect_ko);
      if (!showProposition) suppressedPropositions += 1;
      const visiblePrimaryCopy = [
        rule.title_ko,
        ...(showProposition ? [rule.proposition_ko] : []),
        rule.norm.legal_effect_ko,
      ].map(normalizePublicRuleCopy);
      assert.equal(
        new Set(visiblePrimaryCopy).size,
        visiblePrimaryCopy.length,
        `${entry.content_id}의 ${ruleId}에서 같은 핵심 문장을 두 번 표시합니다.`,
      );
      checkedRuleReferences += 1;
    }
  }

  assert.ok(checkedRuleReferences > 0);
  assert.ok(suppressedPropositions > 0, '동일한 법리명제와 결과를 공개 투영에서 한 번만 보여야 합니다.');
});
