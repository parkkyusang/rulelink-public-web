import {changeLifecycleLabel} from './change-lifecycle';
import {knowledgeContentTypeLabel} from './content-labels';
import {
  listChangeBriefs,
  listKnowledgeDecisionQuestions,
  listKnowledgeSearchDocuments,
  listKnowledgeSearchSemanticSupport,
  listPublishedCards,
  listPublishedTopics,
} from './publication';
import {buildSiteSearchDocuments} from './site-search-discovery';

export async function loadSiteSearchDocuments() {
  const [
    cards,
    changeBriefs,
    knowledgeDocuments,
    topics,
    decisionQuestions,
    semanticSupport,
  ] = await Promise.all([
    listPublishedCards(),
    listChangeBriefs(),
    listKnowledgeSearchDocuments(),
    listPublishedTopics(),
    listKnowledgeDecisionQuestions(),
    listKnowledgeSearchSemanticSupport(),
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
    semanticSupport,
  );
}
