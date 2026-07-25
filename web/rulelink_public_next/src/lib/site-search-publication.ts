import {changeLifecycleLabel} from './change-lifecycle';
import {knowledgeContentTypeLabel} from './content-labels';
import {
  listChangeBriefs,
  listKnowledgeDecisionQuestions,
  listKnowledgeSearchDocuments,
  listPublishedCards,
  listPublishedTopics,
} from './publication';
import {buildSiteSearchDocuments} from './site-search-discovery';

export async function loadSiteSearchDocuments() {
  const [cards, changeBriefs, knowledgeDocuments, topics, decisionQuestions] = await Promise.all([
    listPublishedCards(),
    listChangeBriefs(),
    listKnowledgeSearchDocuments(),
    listPublishedTopics(),
    listKnowledgeDecisionQuestions(),
  ]);
  return buildSiteSearchDocuments(
    cards,
    changeBriefs,
    knowledgeDocuments,
    topics,
    {
      changeLifecycle: changeLifecycleLabel,
      knowledgeContentType: knowledgeContentTypeLabel,
    },
    decisionQuestions,
  );
}
