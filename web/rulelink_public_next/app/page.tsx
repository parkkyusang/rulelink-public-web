import {IssueExplorer} from '@/components/issue-explorer';
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
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">근거가 연결되는 생활법률</p>
        <h1>법률용어가 아니라<br />내가 겪은 일에서 시작합니다.</h1>
        <p className="heroCopy">{site.description}</p>
        <div className="trustRail" aria-label="RuleLink 정보 원칙">
          <span><b>01</b> 상황별 탐색</span>
          <span><b>02</b> 공식 근거 연결</span>
          <span><b>03</b> 검토기한 관리</span>
        </div>
      </section>

      <section className="entrySection" aria-labelledby="entry-heading">
        <div className="entryIntro">
          <p className="eyebrow">세 가지 시작점</p>
          <h2 id="entry-heading">법 이름을 몰라도, 궁금한 방식으로 들어오세요.</h2>
        </div>
        <div className="entryGrid">
          <a href={changeBriefs.length ? '/ko/changes' : '/ko/method'}>
            <span>01 · 시간</span>
            <h3>법이 바뀌었나요?</h3>
            <p>구법과 현행법을 나란히 놓고 시행일과 적용 경계를 확인합니다.</p>
            <strong>변경 전후에서 찾기 →</strong>
          </a>
          <a href={knowledgeEntries.length ? '#knowledge' : '#issues'}>
            <span>02 · 사실</span>
            <h3>어떤 사실이 결론을 가르나요?</h3>
            <p>같은 법이라도 결과를 바꾸는 질문과 사실분기를 먼저 보여줍니다.</p>
            <strong>내 상황에서 찾기 →</strong>
          </a>
          <a href={cards.length ? '#issues' : '/ko/method'}>
            <span>03 · 행동</span>
            <h3>무엇을 준비해야 하나요?</h3>
            <p>필요한 자료, 다음 행동, 개별 검토가 필요한 경계를 구분합니다.</p>
            <strong>절차와 자료에서 찾기 →</strong>
          </a>
        </div>
      </section>

      {changeBriefs.length ? (
        <section className="changeSection" id="changes" aria-labelledby="change-heading">
          <div className="changeIntro">
            <div>
              <p className="eyebrow">새로 바뀌는 법</p>
              <h2 id="change-heading">시행 전후 달라진 내용을 확인하세요.</h2>
            </div>
            <p>구법과 신법의 문언·적용요건·효과를 비교하고, 시행 전후에 확인할 사항을 정리합니다.<br /><a className="cardLink" href="/ko/changes">전체 법령 변화에서 찾기 →</a></p>
          </div>
          <div className="changeGrid">
            {changeBriefs.slice(0, 3).map(brief => (
              <a className="changeCard" href={`/ko/changes/${brief.slug}`} key={brief.change_brief_id}>
                <span className={`lifecycle ${brief.lifecycle}`}>{brief.lifecycle === 'future_effective' ? '시행 예정' : '최근 시행'}</span>
                <span className="changeDate">{formatLegalDate(brief.effective_date)}</span>
                <h3>{brief.title_ko}</h3>
                <p>{brief.summary_ko}</p>
                <strong>개정 전후와 확인사항 보기 <span aria-hidden="true">→</span></strong>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {knowledgeEntries.length ? (
        <section className="knowledgeHome" id="knowledge" aria-labelledby="knowledge-heading">
          <div className="changeIntro">
            <div>
              <p className="eyebrow">연결된 법률지식</p>
              <h2 id="knowledge-heading">법리에서 사실분기까지 이어서 봅니다.</h2>
            </div>
            <p>
              한 번 쓴 글이 아니라, 같은 법리와 판단 사실을 여러 상황에서 다시 쓸 수 있게 연결한 지식입니다.
              <br /><a className="cardLink" href="/ko/knowledge">전체 지식에서 검색하기 →</a>
            </p>
          </div>
          {knowledgeHubs.length ? (
            <div className="hubRail">
              {knowledgeHubs.map(hub => (
                <a href={`/ko/hubs/${hub.slug}`} key={hub.hub_id}>
                  <span>주제 허브</span><strong>{hub.title_ko}</strong><small>{hub.description_ko}</small>
                </a>
              ))}
            </div>
          ) : null}
          <div className="knowledgeGrid">
            {knowledgeEntries.slice(0, 6).map(entry => (
              <a className="knowledgeCard" href={`/ko/knowledge/${entry.slug}`} key={entry.content_id}>
                <span>{entry.audience_situation_ko}</span>
                <h3>{entry.title_ko}</h3>
                <p>{entry.one_line_answer_ko}</p>
                <strong>법리와 사실분기 보기 →</strong>
              </a>
            ))}
          </div>
        </section>
      ) : null}

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
        {cards.length ? (
          <IssueExplorer cards={cards} topics={topics} />
        ) : (
          <div className="emptyState">
            <h3>검토된 법률정보를 준비하고 있습니다.</h3>
            <p>승인된 출판본만 이 화면에 표시됩니다.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function formatLegalDate(value: string): string {
  return `${new Intl.DateTimeFormat('ko-KR', {dateStyle: 'long'}).format(new Date(`${value}T00:00:00+09:00`))} 시행`;
}
