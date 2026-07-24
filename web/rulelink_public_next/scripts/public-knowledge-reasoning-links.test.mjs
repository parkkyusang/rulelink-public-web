import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

import {ScenarioRuleLinks} from '../src/components/scenario-rule-links.ts';

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
  assert.match(pageSource, /<ScenarioRuleLinks/);
  assert.doesNotMatch(pageSource, /directRuleIds\.has\(rule\.rule_id\)/);
  assert.doesNotMatch(pageSource, /branchRuleChip/);
});

test('연결 법리 라벨은 비조작 텍스트이고 실제 법리만 순서대로 초점 가능한 앵커다', async () => {
  const styles = {
    item: 'branchRulesItem',
    label: 'branchRulesLabel',
    link: 'branchRulesLink',
    list: 'branchRulesList',
    root: 'branchRules',
  };
  const rules = [
    {rule_id: 'rule.legal-service-boundaries.information-vs-consultation', title_ko: '일반 법률정보와 개별 법률상담의 경계'},
    {rule_id: 'rule.legal-service-boundaries.economic-benefit', title_ko: '이용료 명칭보다 경제적 이익의 실질'},
  ];
  const markup = renderToStaticMarkup(createElement(
    'main',
    null,
    ...rules.map(rule => createElement('article', {id: rule.rule_id, key: rule.rule_id}, rule.title_ko)),
    createElement(ScenarioRuleLinks, {
      classes: styles,
      rules,
      scenarioNumber: 1,
      scenarioTitle: '플랫폼 수익이 상담 성사·수임료·성공 여부에 연동되나요?',
    }),
  ));

  const label = markup.match(/<span([^>]*)>연결 법리<\/span>/u);
  assert(label, '연결 법리 라벨이 렌더링되어야 합니다.');
  assert.match(label[1], /class="branchRulesLabel"/u);
  assert.doesNotMatch(label[1], /\b(?:href|role|tabindex)=/iu);
  assert.doesNotMatch(markup, /<(?:a|button)[^>]*>\s*연결 법리\s*<\/(?:a|button)>/iu);

  assert.match(
    markup,
    /<nav[^>]*aria-label="사실분기 1의 연결 법리: 플랫폼 수익이 상담 성사·수임료·성공 여부에 연동되나요\?"[^>]*>/u,
  );

  const interactiveTags = [...markup.matchAll(/<(a|button)\b([^>]*)>/giu)];
  assert.deepEqual(interactiveTags.map(match => match[1].toLowerCase()), ['a', 'a']);
  const linkTargets = interactiveTags.map(match => match[2].match(/href="([^"]+)"/u)?.[1]);
  assert.deepEqual(linkTargets, rules.map(rule => `#${rule.rule_id}`));
  const renderedIds = new Set([...markup.matchAll(/\bid="([^"]+)"/gu)].map(match => match[1]));
  assert.ok(linkTargets.every(href => href?.startsWith('#') && renderedIds.has(href.slice(1))));
  assert.doesNotMatch(markup, /\btabindex=/iu);
  for (const rule of rules) {
    assert.match(markup, new RegExp(`>${rule.title_ko} <span aria-hidden="true">↑</span></a>`, 'u'));
  }

  const css = await readFile(path.join(root, 'app/ko/knowledge/[slug]/knowledge-trust.module.css'), 'utf8');
  const labelRule = css.match(/\.branchRulesLabel\s*\{([^}]*)\}/su);
  assert(labelRule, '연결 법리 라벨 스타일 계약이 필요합니다.');
  assert.doesNotMatch(labelRule[1], /\b(?:background|border(?:-radius)?|box-shadow|cursor|padding)\s*:/iu);
  assert.match(css, /\.branchRulesLink:focus-visible\s*\{[^}]*outline:/su);
});

test('다중 사실분기의 연결 법리 내비게이션은 화면 문구를 늘리지 않고 고유한 이름과 탭 순서를 가진다', () => {
  const styles = {
    item: 'branchRulesItem',
    label: 'branchRulesLabel',
    link: 'branchRulesLink',
    list: 'branchRulesList',
    root: 'branchRules',
  };
  const fixtures = [
    {
      rule: {rule_id: 'rule.boundary.information', title_ko: '일반 법률정보와 개별 법률상담의 경계'},
      scenarioNumber: 1,
      scenarioTitle: '면책문구보다 실제 기능과 거래구조가 중요한가요?',
    },
    {
      rule: {rule_id: 'rule.boundary.economic-benefit', title_ko: '이용료 명칭보다 경제적 이익의 실질'},
      scenarioNumber: 2,
      scenarioTitle: '플랫폼 수익이 사건 성과에 연동되나요?',
    },
  ];
  const markup = renderToStaticMarkup(createElement(
    'main',
    null,
    ...fixtures.map(({rule}) => createElement('article', {id: rule.rule_id, key: rule.rule_id}, rule.title_ko)),
    ...fixtures.map(fixture => createElement(ScenarioRuleLinks, {
      classes: styles,
      key: fixture.scenarioNumber,
      rules: [fixture.rule],
      scenarioNumber: fixture.scenarioNumber,
      scenarioTitle: fixture.scenarioTitle,
    })),
  ));

  const navNames = [...markup.matchAll(/<nav[^>]*aria-label="([^"]+)"[^>]*>/gu)].map(match => match[1]);
  assert.deepEqual(navNames, fixtures.map(
    fixture => `사실분기 ${fixture.scenarioNumber}의 연결 법리: ${fixture.scenarioTitle}`,
  ));
  assert.equal(new Set(navNames).size, fixtures.length);
  assert.equal((markup.match(/>연결 법리<\/span>/gu) ?? []).length, fixtures.length);

  const labelTags = [...markup.matchAll(/<span([^>]*)>연결 법리<\/span>/gu)];
  assert.ok(labelTags.every(match => !/\b(?:href|role|tabindex)=/iu.test(match[1])));
  const interactiveTags = [...markup.matchAll(/<(a|button)\b([^>]*)>/giu)];
  assert.deepEqual(interactiveTags.map(match => match[1].toLowerCase()), ['a', 'a']);
  const hrefs = interactiveTags.map(match => match[2].match(/href="([^"]+)"/u)?.[1]);
  assert.deepEqual(hrefs, fixtures.map(({rule}) => `#${rule.rule_id}`));
  const renderedIds = new Set([...markup.matchAll(/\bid="([^"]+)"/gu)].map(match => match[1]));
  assert.ok(hrefs.every(href => href?.startsWith('#') && renderedIds.has(href.slice(1))));
  assert.doesNotMatch(markup, /\btabindex=/iu);
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
