import {IssueExplorer} from '@/components/issue-explorer';
import {KnowledgeHubDirectory} from '@/components/knowledge-hub-directory';
import {changeLifecycleLabel} from '@/lib/change-lifecycle';
import {knowledgeContentTypeLabel} from '@/lib/content-labels';
import {selectHomepageKnowledge} from '@/lib/homepage-knowledge-selection';
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
  const homepageKnowledgeEntries = selectHomepageKnowledge(knowledgeEntries, 6);
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">근거가 연결되는 생활법률</p>
        <h1>법률용어가 아니라<br />내가 겪은 일에서 시작합니다.</h1>
        <p className="heroCopy">{site.description}</p>
        <div className="trustRail" aria-label={`${site.name} 정보 원칙`}>
          <span><b>01</b> 상황별 탐색</span>
          <span><b>02</b> 결론을 가르는 사실</span>
          <span><b>03</b> 근거와 다음 행동</span>
        </div>
      </section>

      <section className="entrySection" aria-labelledby="entry-heading">
        <div className="entryIntro">
          <p className="eyebrow">내 상황에서 시작</p>
          <h2 id="entry-heading">무슨 일이 있었는지 평소 말로 적어보세요.</h2>
          <p>관련 질문과 현재 답, 결론을 바꾸는 사실, 공식 근거와 다음 행동까지 이어서 보여드립니다.</p>
        </div>
        <form action="/ko/search" className="homeSituationSearch" method="get" role="search">
          <label htmlFor="home-situation-search">상황으로 법률정보 찾기</label>
          <div>
            <input
              id="home-situation-search"
              name="q"
              placeholder="예: 집주인이 보증금을 돌려주지 않아요"
              type="search"
            />
            <button type="submit">관련 질문 찾기</button>
          </div>
          <p>
            검색 결과에는 실제로 맞은 이유를 표시합니다.
            <a href="#knowledge"> 또는 생활영역에서 고르기</a>
          </p>
        </form>
      </section>

      {knowledgeEntries.length ? (
        <section className="knowledgeHome" id="knowledge" aria-labelledby="knowledge-heading">
          <div className="changeIntro">
            <div>
              <p className="eyebrow">상황별 법률 주제</p>
              <h2 id="knowledge-heading">생활영역을 고르고, 내 질문과 가까운 글을 찾으세요.</h2>
            </div>
            <p>
              각 글에서 현재 답, 결론을 가르는 사실, 준비자료와 행동, 공식 원문을 함께 확인할 수 있습니다.
              <br /><a className="cardLink" href="/ko/knowledge">{knowledgeEntries.length}개 전체 지식에서 검색하기 →</a>
            </p>
          </div>
          <KnowledgeHubDirectory hubs={knowledgeHubs} />
          <div className="knowledgeGrid">
            {homepageKnowledgeEntries.map(entry => (
              <a className="knowledgeCard" href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>
                <span className="knowledgeMeta">
                  <b>{knowledgeContentTypeLabel(entry.content_type)}</b>
                  <time dateTime={entry.reviewed_at}>기준 확인 {formatReviewDate(entry.reviewed_at)}</time>
                  <span>{entry.audience_situation_ko}</span>
                </span>
                <h3>{entry.title_ko}</h3>
                <p>{entry.one_line_answer_ko}</p>
                <strong>법리와 사실분기 보기 →</strong>
              </a>
            ))}
          </div>
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

function formatReviewDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium'}).format(new Date(value));
}
