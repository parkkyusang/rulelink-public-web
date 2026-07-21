import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {editorialPreviewEnabled, loadEditorialOperationsQueue} from '@/lib/publication';
import {changeLifecycleLabel} from '@/lib/change-lifecycle';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '편집 운영 대기열',
  robots: {index: false, follow: false},
};

const stageLabels: Record<string, string> = {
  candidate: '미착수',
  source_delta_ready: '법령차이 고정',
  draft_ready: '초안 작성',
  source_verified: '내용 검토대기',
  legal_reviewed: '승인 대기',
  approved: '출판 대기',
  published: '공개 완료',
};

export default async function EditorialOperationsPage() {
  if (!editorialPreviewEnabled()) notFound();
  const queue = await loadEditorialOperationsQueue();
  if (!queue) notFound();
  return (
    <main className="editorialPage">
      <section className="editorialHero">
        <p className="eyebrow">내부 전용 · 자동 공개 금지</p>
        <h1>법령변화 편집 운영 대기열</h1>
        <p>후보 발견부터 법리 분석, 내용 검토, 승인, 공개까지 현재 위치와 다음 한 가지 작업을 연결합니다.</p>
        <dl className="editorialSummary">
          <div><dt>전체 후보</dt><dd>{queue.summary.candidate_count}</dd></div>
          <div><dt>공개 완료</dt><dd>{queue.summary.published_count}</dd></div>
          <div><dt>제작·검토 중</dt><dd>{queue.summary.draft_or_review_count}</dd></div>
          <div><dt>미착수</dt><dd>{queue.summary.not_started_count}</dd></div>
        </dl>
      </section>
      <section className="clusterSection" aria-labelledby="cluster-heading">
        <div className="editorialSectionHeading">
          <p className="eyebrow">잠정 개정묶음</p>
          <h2 id="cluster-heading">같이 바뀐 조문을 먼저 한 묶음으로 읽습니다.</h2>
          <p>같은 법령·시간축 사건을 기준으로 한 잠정 묶음입니다. 조문별 공포번호와 실제 시행일, 개정이유를 확인하기 전에는 자동으로 한 콘텐츠에 합치지 않습니다.</p>
        </div>
        <div className="clusterGrid">
          {queue.clusters.map(cluster => (
            <article className="clusterCard" key={cluster.cluster_id}>
              <div className="editorialMeta">
                <span className="stage">{cluster.cluster_stage === 'partially_published' ? '일부 공개' : cluster.cluster_stage === 'in_progress' ? '제작 중' : cluster.cluster_stage === 'fully_published' ? '전체 공개' : '미착수'}</span>
                <span>{cluster.effective_date}</span>
                <span>묶음 우선순위 {cluster.priority_score}</span>
                {cluster.promulgation_no ? <span>공포 제{cluster.promulgation_no}호</span> : <span>공포·시행일 확인 필요</span>}
              </div>
              <h3>{cluster.law_name_ko}</h3>
              <p className="clusterArticles">{cluster.article_nos.join(' · ')}</p>
              <p>진행 {cluster.covered_event_count}/{cluster.article_count} · 공개 {cluster.published_event_count}/{cluster.article_count}</p>
              <p><b>{cluster.requires_timeline_snapshot_rebuild ? '원장 재구축' : cluster.boundary_status === 'verified' ? '주제 설계' : '연혁 복구'}</b> {cluster.next_action}</p>
            </article>
          ))}
        </div>
      </section>
      <div className="editorialSectionHeading itemHeading">
        <p className="eyebrow">조문별 작업</p>
        <h2>다음 한 가지 작업</h2>
      </div>
      <section className="editorialQueue" aria-label="법령변화 후보 목록">
        {queue.items.map((item, index) => (
          <article className="editorialRow" key={item.candidate_id}>
            <div className="editorialRank">{String(index + 1).padStart(2, '0')}</div>
            <div className="editorialMain">
              <div className="editorialMeta">
                <span className={`stage stage-${item.editorial_stage}`}>{stageLabels[item.editorial_stage] ?? item.editorial_stage}</span>
                <span>{changeLifecycleLabel(item.lifecycle)}</span>
                <span>{item.effective_date}</span>
                <span>우선순위 {item.priority_score}</span>
              </div>
              <h2>{item.law_name_ko} {item.article_no}</h2>
              <p><b>다음 작업</b> {item.next_action}</p>
              {item.transition_status === 'verification_needed' ? <p className="editorialWarning">경과조치 확인 필요</p> : null}
            </div>
            {item.published_snapshot_id ? <code>{item.published_snapshot_id}</code> : null}
          </article>
        ))}
      </section>
    </main>
  );
}
