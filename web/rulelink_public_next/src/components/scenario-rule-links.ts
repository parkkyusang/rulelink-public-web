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
  scenarioNumber: number;
  scenarioTitle: string;
};

export function ScenarioRuleLinks({classes, rules, scenarioNumber, scenarioTitle}: ScenarioRuleLinksProps) {
  if (!rules.length) return null;

  return createElement(
    'nav',
    {
      'aria-label': `사실분기 ${scenarioNumber}의 연결 법리: ${scenarioTitle}`,
      className: classes.root,
    },
    createElement(
      'span',
      {
        className: classes.label,
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
