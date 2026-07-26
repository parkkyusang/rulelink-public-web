import {IssueExplorer} from '@/components/issue-explorer';
import {KnowledgeHubDirectory} from '@/components/knowledge-hub-directory';
import {changeLifecycleLabel} from '@/lib/change-lifecycle';
import {formatKoreanLegalDate} from '@/lib/legal-date';
import {
  listChangeBriefs,
  listKnowledgeEntries,
  listKnowledgeHubs,
  listPublishedCards,
  listPublishedTopics,
  loadPublishedBundle,
} from '@/lib/publication';
import {site} from '@/lib/site';
import {SITE_SEARCH_EXAMPLES} from '@/lib/site-search-discovery';

export const dynamic = 'force-static';

export default async function HomePage() {
  const [cards, topics, bundle, changeBriefs, knowledgeEntries, knowledgeHubs] = await Promise.all([
    listPublishedCards(),
    listPublishedTopics(),
    loadPublishedBundle(),
    listChangeBriefs(),
    listKnowledgeEntries(),
    listKnowledgeHubs(),
  ]);
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">근거가 연결되는 생활법률</p>
        <h1>법률용어가 아니라<br />내가 겪은 일에서 시작합니다.</h1>
        <p className="heroCopy">{site.description}</p>
        <form action="/ko/search" className="homeSituationSearch heroSearch" method="get" role="search">
          <label htmlFor="home-situation-search">무슨 일이 있었는지 평소 말로 적어보세요.</label>
          <div>
            <input
              id="home-situation-search"
              name="q"
              placeholder={`예: ${SITE_SEARCH_EXAMPLES[0].label_ko}`}
              type="search"
            />
            <button type="submit">관련 질문 찾기</button>
          </div>
          <nav aria-label="검색 예시" className="homeSearchExamples">
            {SITE_SEARCH_EXAMPLES.map(example => (
              <a href={`/ko/search?q=${encodeURIComponent(example.query)}`} key={example.kind}>
                {example.label_ko}
              </a>
            ))}
          </nav>
          <p>
            실제로 맞은 이유와 결론을 바꾸는 사실, 공식 근거, 다음 행동을 이어서 보여드립니다.
            <a href="#knowledge"> 생활영역에서 고르기</a>
          </p>
        </form>
        <div className="trustRail" aria-label={`${site.name} 정보 원칙`}>
          <span><b>01</b> 상황별 탐색</span>
          <span><b>02</b> 결론을 가르는 사실</span>
          <span><b>03</b> 근거와 다음 행동</span>
        </div>
      </section>

      {knowledgeEntries.length ? (
        <section className="knowledgeHome" id="knowledge" aria-labelledby="knowledge-heading">
          <div className="changeIntro">
            <div>
              <p className="eyebrow">다른 방법으로 찾기</p>
              <h2 id="knowledge-heading">검색어가 떠오르지 않으면 생활영역에서 고르세요.</h2>
            </div>
            <p>
              7개 생활영역의 모든 주제를 빠짐없이 표시합니다.
              <br /><a className="cardLink" href="/ko/knowledge">{knowledgeEntries.length}개 전체 지식에서 검색하기 →</a>
            </p>
          </div>
          <KnowledgeHubDirectory hubs={knowledgeHubs} />
        </section>
      ) : null}

      {changeBriefs.length ? (
        <section className="changeSection" id="changes" aria-labelledby="change-heading">
          <div className="changeIntro">
            <div>
              <p className="eyebrow">관련 법령 변화</p>
              <h2 id="change-heading">시행 전후 달라진 내용도 따로 확인할 수 있습니다.</h2>
            </div>
            <p>법령변화는 각 생활질문에 연결해 보여주며, 여기서는 전체 변경 이력을 모아봅니다.<br /><a className="cardLink" href="/ko/changes">전체 법령 변화에서 찾기 →</a></p>
          </div>
          <div className="changeGrid">
            {changeBriefs.slice(0, 3).map(brief => (
              <a className="changeCard" href={`/ko/changes/${brief.slug}`} key={brief.change_brief_id}>
                <span className={`lifecycle ${brief.lifecycle}`}>{changeLifecycleLabel(brief.lifecycle)}</span>
                <span className="changeDate" data-effective-date={brief.effective_date}>{formatKoreanLegalDate(brief.effective_date)}</span>
                <h3>{brief.title_ko}</h3>
                <p>{brief.summary_ko}</p>
                <strong>개정 전후와 확인사항 보기 <span aria-hidden="true">→</span></strong>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {cards.length ? (
        <section className="contentSection" id="issues">
          <div className="sectionHeading">
            <div>
              <p className="eyebrow">검토된 문제카드</p>
              <h2>어떤 일로 찾아오셨나요?</h2>
            </div>
            {bundle ? (
              <span className="snapshot">
                {bundle.schema === 'rulelink_published_bundle_v1' ? `출판본 ${bundle.snapshot_id}` : '내부 편집 미리보기'}
              </span>
            ) : null}
          </div>
          <IssueExplorer cards={cards} topics={topics} />
        </section>
      ) : !knowledgeEntries.length ? (
        <section className="contentSection" id="issues">
          <div className="emptyState">
            <h3>검토된 법률정보를 준비하고 있습니다.</h3>
            <p>승인된 출판본만 이 화면에 표시됩니다.</p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
