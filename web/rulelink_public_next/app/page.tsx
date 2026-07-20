import {IssueExplorer} from '@/components/issue-explorer';
import {listChangeBriefs, listPublishedCards, listPublishedTopics, loadPublishedBundle} from '@/lib/publication';
import {site} from '@/lib/site';

export const dynamic = 'force-static';

export default async function HomePage() {
  const [cards, topics, bundle, changeBriefs] = await Promise.all([
    listPublishedCards(), listPublishedTopics(), loadPublishedBundle(), listChangeBriefs(),
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

      {changeBriefs.length ? (
        <section className="changeSection" aria-labelledby="change-heading">
          <div className="changeIntro">
            <div>
              <p className="eyebrow">새로 바뀌는 법</p>
              <h2 id="change-heading">시행 전후 달라진 내용을 확인하세요.</h2>
            </div>
            <p>구법과 신법의 문언·적용요건·효과를 비교하고, 시행 전후에 확인할 사항을 정리합니다.</p>
          </div>
          <div className="changeGrid">
            {changeBriefs.map(brief => (
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
