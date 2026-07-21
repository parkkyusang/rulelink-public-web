import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: '변호사 전용 작업공간',
  description: 'RuleLink 공개 법률정보와 자격 확인이 필요한 사건별 검토 도구의 경계',
  alternates: {canonical: '/ko/lawyer-workspace'},
  openGraph: {
    title: 'RuleLink 변호사 전용 작업공간',
    description: '왜 사건별 결론과 전략을 다루는 도구가 변호사 자격 확인 뒤 제공되는지 설명합니다.',
    url: '/ko/lawyer-workspace',
  },
};

export default function LawyerWorkspaceGatePage() {
  return (
    <main className="methodPage">
      <div className="breadcrumb"><a href="/">홈</a><span aria-hidden="true">/</span><span>변호사 전용 작업공간</span></div>
      <header className="methodHero">
        <p className="eyebrow">Verified Attorney Workspace</p>
        <h1>일반 법률정보는 누구나,<br />사건별 판단 도구는 변호사에게.</h1>
        <p>이 페이지는 단순한 자기선언 화면이 아닙니다. 사건별 결론·전략·증거·서면 방향을 다루는 별도 작업공간의 이용 주체와 책임을 분명히 나누는 진입점입니다.</p>
      </header>
      <section className="methodGrid" aria-label="변호사 전용으로 운영하는 이유">
        <article><span>01</span><h2>기능의 차이</h2><p>법령·판례와 일반적인 판단기준을 보여주는 정보 제공과, 이용자의 구체적인 사실을 법률요건에 대입해 결론을 내리는 법률상담은 기능이 다릅니다.</p></article>
        <article><span>02</span><h2>책임의 주체</h2><p>사건별 판단에는 원자료 확인, 이해충돌 점검, 비밀유지, 독립적 수정·거절권과 최종 책임을 질 변호사가 필요합니다.</p></article>
        <article><span>03</span><h2>거래구조의 분리</h2><p>리알레는 변호사에게 고정형 기술도구를 제공하고, 일반인의 상담료·수임료·성공보수나 사건 소개 대가를 배분받지 않는 구조를 지향합니다.</p></article>
        <article><span>04</span><h2>실질적인 자격 확인</h2><p>‘변호사입니다’라는 체크만으로 통과시키지 않습니다. 승인 계정은 변호사 자격과 소속 확인을 거치며, 운영 계정은 사건 판단 계정과 역할을 분리합니다.</p></article>
      </section>
      <section className="methodSection">
        <div><p className="eyebrow">진입 조건</p><h2>작업공간은 다음 조건을 모두 확인합니다.</h2></div>
        <ul className="gateChecklist">
          <li><b>본인 확인</b><br />Cloudflare Access 계정과 승인된 이메일이 일치해야 합니다.</li>
          <li><b>자격·소속 확인</b><br />변호사 자격과 소속 법률사무소 또는 법무법인 정보를 운영자가 확인합니다.</li>
          <li><b>역할 분리</b><br />변호사 계정과 기술 운영자 계정을 구분하고 사건별 접근 기록을 남깁니다.</li>
          <li><b>직접 책임</b><br />도구의 초안은 변호사의 독립적인 검토·수정·승인을 대신하지 않습니다.</li>
        </ul>
      </section>
      <section className="gateBoundary">
        <h2>일반 이용자라면</h2>
        <p>이 작업공간에 사건을 입력하지 마세요. 공개 RuleLink의 일반 정보를 참고한 뒤 개별 판단이 필요하면 변호사 또는 법무법인과 직접 상담계약을 체결해야 합니다.</p>
        <a className="methodCta" href="/ko/hubs/legal-service-boundaries">왜 이런 구조인지 자세히 보기 →</a>
      </section>
      <aside className="methodNotice">
        <strong>승인된 계정만 외부 작업공간으로 이동합니다</strong>
        <p>접속 뒤에도 서버가 변호사 또는 운영 담당자 역할을 다시 확인합니다. 공개 페이지의 체크 상태나 사건정보는 작업공간으로 자동 전달되지 않습니다.</p>
        <a className="methodCta" href="https://liale-review.lolphysical.xyz" rel="noreferrer" target="_blank">승인된 계정으로 작업공간 열기 ↗</a>
      </aside>
    </main>
  );
}
