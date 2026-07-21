import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {assertionsForChangeBrief, findChangeBrief, listChangeBriefs, relatedCardsForChangeBrief} from '@/lib/publication';
import {browserOfficialSourceUrl} from '@/lib/official-source-url';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';
import type {NormSlot} from '@/types/publication';

type Props = {params: Promise<{slug: string}>};

export async function generateStaticParams() {
  return (await listChangeBriefs()).map(brief => ({slug: brief.slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const brief = await findChangeBrief((await params).slug);
  if (!brief) return {};
  const path = `/ko/changes/${brief.slug}`;
  return {
    title: brief.title_ko,
    description: brief.summary_ko,
    alternates: {canonical: path},
    openGraph: {
      type: 'article',
      title: brief.title_ko,
      description: brief.summary_ko,
      url: path,
      modifiedTime: brief.reviewed_at,
    },
  };
}

export default async function ChangeBriefPage({params}: Props) {
  const brief = await findChangeBrief((await params).slug);
  if (!brief) notFound();
  const [assertions, relatedCards] = await Promise.all([
    assertionsForChangeBrief(brief),
    relatedCardsForChangeBrief(brief),
  ]);
  const oldFrameLabel = brief.lifecycle === 'future_effective' ? '현재 시행 문언' : '종전 시행 문언';
  const newFrameLabel = brief.lifecycle === 'future_effective' ? '시행 예정 문언' : '현재 시행 문언';
  const canonicalUrl = `${site.url}/ko/changes/${brief.slug}`;
  const officialSources = [...new Set(assertions.flatMap(assertion => assertion.source_coordinates
    .map(source => browserOfficialSourceUrl(source, brief.law_name_ko))
    .filter((url): url is string => Boolean(url))))];
  return (
    <main className="changePage">
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: brief.title_ko,
          description: brief.summary_ko,
          dateModified: brief.reviewed_at,
          mainEntityOfPage: canonicalUrl,
          inLanguage: 'ko-KR',
          about: `${brief.law_name_ko} ${brief.article_no}`,
          isBasedOn: officialSources,
        })}}
        type="application/ld+json"
      />
      <nav aria-label="현재 위치" className="breadcrumb"><a href="/">홈</a><span aria-hidden="true">/</span><a href="/ko/changes">법령 변화</a><span aria-hidden="true">/</span><span aria-current="page">현재 변화</span></nav>
      <header className="changeHero">
        <div className="changeHeroMeta">
          <span className={`lifecycle ${brief.lifecycle}`}>{brief.lifecycle === 'future_effective' ? '시행 예정' : '최근 시행'}</span>
          <span>{brief.law_name_ko} {brief.article_no}</span>
        </div>
        <h1>{brief.title_ko}</h1>
        <p>{brief.summary_ko}</p>
        <dl className="effectivePanel">
          <div><dt>시행일</dt><dd>{formatDate(brief.effective_date)}</dd></div>
          <div><dt>검토 기준일</dt><dd>{formatDate(brief.reviewed_at)}</dd></div>
          <div><dt>상태</dt><dd>{brief.lifecycle === 'future_effective' ? '아직 시행 전' : '현재 시행 중'}</dd></div>
        </dl>
      </header>

      {brief.transition_status === 'verification_needed' ? (
        <aside className="transitionWarning">
          <strong>경과조치를 추가 확인해야 합니다.</strong>
          <p>{brief.transition_note_ko}</p>
        </aside>
      ) : null}

      <div className="changeBody">
        <section>
          <p className="eyebrow">누구에게 관련되나요</p>
          <h2>영향을 받을 수 있는 사람</h2>
          <ul>{brief.affected_audiences.map(item => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <p className="eyebrow">개정 전후</p>
          <h2>달라지는 핵심 내용</h2>
          <ol>{brief.changed_points.map(item => <li key={item}>{item}</li>)}</ol>
        </section>
        <section>
          <p className="eyebrow">확인할 일</p>
          <h2>시행 전후 점검사항</h2>
          <ol>{brief.action_checklist.map(item => <li key={item}>{item}</li>)}</ol>
        </section>
      </div>

      <section className="normDelta">
        <p className="eyebrow">RuleLink 연역 법리 비교</p>
        <h2>문구가 아니라 법이 작동하는 구조를 비교했습니다.</h2>
        <p className="normDeltaLead">{brief.norm_delta.legal_effect_delta_ko}</p>
        <div className="normDeltaRows">
          {brief.norm_delta.changed_slots.map(slot => (
            <article className="normDeltaRow" key={slot}>
              <h3>{normSlotLabels[slot]}</h3>
              <div className="normVersion oldVersion">
                <strong>{oldFrameLabel}</strong>
                <ul>{renderNormValues(brief.norm_delta.old_frame[slot])}</ul>
              </div>
              <div className="normVersion newVersion">
                <strong>{newFrameLabel}</strong>
                <ul>{renderNormValues(brief.norm_delta.new_frame[slot])}</ul>
              </div>
            </article>
          ))}
        </div>
        <div className="lifeImpact">
          <div>
            <p className="eyebrow">생활상황 영향</p>
            <h3>실제로 달라지는 확인사항</h3>
            <ul>{brief.norm_delta.life_situation_impacts.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
          {brief.norm_delta.unresolved_questions.length ? (
            <div className="unresolvedQuestions">
              <p className="eyebrow">아직 단정하지 않는 부분</p>
              <h3>추가로 확인할 질문</h3>
              <ul>{brief.norm_delta.unresolved_questions.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}
        </div>
      </section>

      <section className="changeSources">
        <p className="eyebrow">공식 근거와 버전</p>
        <h2>구법과 신법을 같은 좌표로 덮어쓰지 않습니다.</h2>
        <p className="sourceIntro">각 설명은 검토 당시의 불변 법령 스냅샷에 연결됩니다.</p>
        <div className="changeAssertionGrid">
          {assertions.map(assertion => (
            <article className="assertion" key={assertion.assertion_id}>
              <p>{assertion.user_facing_text_ko}</p>
              {assertion.source_coordinates.map(coordinate => (
                <div className="source" key={`${coordinate.source_snapshot_id}-${coordinate.source_hash}`}>
                  <span>{coordinate.version_scope === 'future_effective' ? '시행 예정 신문언' : '검토일 현재 시행 문언'}</span>
                  <span>{coordinate.article_no}</span>
                  {coordinate.effective_from ? <span>{formatDate(coordinate.effective_from)} 기준</span> : null}
                  {browserOfficialSourceUrl(coordinate, brief.law_name_ko) ? (
                    <a href={browserOfficialSourceUrl(coordinate, brief.law_name_ko)} rel="noreferrer" target="_blank">공식 원문 ↗</a>
                  ) : null}
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>

      {relatedCards.length ? (
        <section className="relatedSection">
          <p className="eyebrow">이 변화가 영향을 주는 상황</p>
          <h2>내 문제에서 무엇을 확인해야 하는지 이어서 보세요.</h2>
          <div className="relatedGrid">
            {relatedCards.map(card => (
              <a href={`/ko/issues/${card.slug}`} key={card.issue_card_id}>
                <strong>{card.title_ko}</strong>
                <span>상황별 안내 보기 →</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

const normSlotLabels: Record<NormSlot, string> = {
  actor: '누가 권리·의무의 주체인가',
  object: '무엇을 대상으로 하는가',
  trigger: '어떤 사실에서 작동하는가',
  conditions: '어떤 요건이 필요한가',
  exception: '어떤 예외가 있는가',
  operation: '어떤 신청·행위를 하는가',
  legal_effect: '어떤 법률효과가 생기는가',
  temporal_rule: '언제부터 적용되는가',
  transition_rule: '구법과 신법을 어떻게 잇는가',
};

function renderNormValues(values: string[]) {
  return values.length
    ? values.map(value => <li key={value}>{value}</li>)
    : <li>해당 조문 문언에 별도 규정 없음</li>;
}

function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00+09:00` : value);
  return new Intl.DateTimeFormat('ko-KR', {dateStyle: 'long'}).format(date);
}
