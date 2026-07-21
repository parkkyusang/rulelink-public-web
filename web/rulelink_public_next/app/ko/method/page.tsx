import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: '콘텐츠 원칙',
  description: 'RuleLink가 공식 법령과 판례를 생활상황별 법률정보로 만드는 방법',
  alternates: {canonical: '/ko/method'},
  openGraph: {
    title: 'RuleLink 콘텐츠 원칙',
    description: '공식 근거에서 법리를 전개하고 생활상황으로 연결하는 RuleLink의 콘텐츠 제작 원칙',
    url: '/ko/method',
  },
};

export default function MethodPage() {
  return (
    <main className="methodPage">
      <div className="breadcrumb"><a href="/">홈</a><span aria-hidden="true">/</span><span>콘텐츠 원칙</span></div>
      <header className="methodHero">
        <p className="eyebrow">RuleLink Method</p>
        <h1>많은 글을 모으기보다,<br />공식 근거에서 법리를 전개합니다.</h1>
        <p>RuleLink는 법률문제를 생활상황에서 시작하되, 결론은 공식 법령·판례와 적용조건에 다시 연결합니다.</p>
      </header>

      <section className="methodGrid" aria-label="RuleLink 콘텐츠 제작 원칙">
        <article><span>01</span><h2>문언에서 시작</h2><p>조문의 주체, 요건, 예외, 법률효과와 기한을 나누어 읽습니다.</p></article>
        <article><span>02</span><h2>상황으로 연결</h2><p>법률용어를 그대로 나열하지 않고 누구의 어떤 사실에서 결과가 달라지는지 보여줍니다.</p></article>
        <article><span>03</span><h2>기준일을 구분</h2><p>최신 수집본과 오늘 시행 중인 법령을 구분하고, 시행 예정 법령은 시행 예정으로 표시합니다.</p></article>
        <article><span>04</span><h2>근거를 고정</h2><p>각 핵심 설명은 공식 원문의 식별자와 해시에 연결되어 원문이 바뀌면 갱신 대상으로 잡힙니다.</p></article>
      </section>

      <section className="methodSection">
        <div><p className="eyebrow">법이 바뀔 때</p><h2>구법을 지우지 않고 신법의 영향을 따로 계산합니다.</h2></div>
        <div className="methodFlow">
          <p><b>1</b><span>개정 전후 공식 원문이 실제로 달라졌는지 확인</span></p>
          <p><b>2</b><span>공포일·시행일·경과조치와 사건 발생일 구분</span></p>
          <p><b>3</b><span>요건·예외·효과 변화와 영향을 받는 생활상황 도출</span></p>
          <p><b>4</b><span>새 법 브리핑과 기존 문제카드 갱신을 각각 준비</span></p>
        </div>
      </section>

      <aside className="methodNotice">
        <strong>공개 정보사이트와 사건별 법률서비스를 기능으로 나눕니다</strong>
        <p>공개 RuleLink는 법령·판례·일반 법리·생활상황별 체크리스트를 제공합니다. 사용자의 사건 전체를 받거나, 구체적인 결론·승소 가능성·대응전략·증거수집·서면 작성 방향을 회사 명의로 제공하지 않습니다.</p>
        <p>사건별 분석 도구는 자격이 확인된 변호사와 운영 담당자만 사용할 수 있습니다. 일반인이 개별 상담을 받을 때에는 변호사 또는 법무법인과 직접 계약하고, 보수·명의·책임의 주체도 해당 변호사 측이어야 합니다.</p>
        <a className="methodCta" href="/ko/hubs/legal-service-boundaries">법률정보와 변호사 이용 기준 보기 →</a>
      </aside>
    </main>
  );
}
