export const KNOWLEDGE_SCENARIO_CHANGE_EVENT = 'rulelink:knowledge-scenario-change';

export type KnowledgeScenarioAnswer = 'yes' | 'no' | 'unknown';

export type KnowledgeScenarioChangeDetail = {
  answer: KnowledgeScenarioAnswer | null;
  contentId: string;
  revisionKey: string;
  scenarioId: string;
};
