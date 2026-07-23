import {createElement} from 'react';

import type {PublicRuleCard} from '@/types/publication';

type ScenarioRuleLinkClasses = {
  root: string;
  label: string;
  list: string;
  item: string;
  link: string;
};

type ScenarioRuleLinksProps = {
  classes: ScenarioRuleLinkClasses;
  rules: Array<Pick<PublicRuleCard, 'rule_id' | 'title_ko'>>;
  scenarioId: string;
};

export function ScenarioRuleLinks({classes, rules, scenarioId}: ScenarioRuleLinksProps) {
  if (!rules.length) return null;

  const labelId = `scenario-rule-links-${scenarioId.replaceAll(/[^a-zA-Z0-9_-]/gu, '-')}`;

  return createElement(
    'nav',
    {
      'aria-labelledby': labelId,
      className: classes.root,
    },
    createElement(
      'span',
      {
        className: classes.label,
        id: labelId,
      },
      '연결 법리',
    ),
    createElement(
      'ul',
      {className: classes.list},
      ...rules.map(rule => createElement(
        'li',
        {
          className: classes.item,
          key: rule.rule_id,
        },
        createElement(
          'a',
          {
            className: classes.link,
            href: `#${rule.rule_id}`,
          },
          rule.title_ko,
          ' ',
          createElement('span', {'aria-hidden': 'true'}, '↑'),
        ),
      )),
    ),
  );
}
