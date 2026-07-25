import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {
  parsePublicContactHref,
  resolvePublicTrustConfig,
} from '@/lib/public-trust';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';
import {PublicExternalDestinationLink} from '@/components/public-external-destination-link';

import styles from './trust.module.css';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '운영·신뢰 원칙',
  description:
    `${site.name}의 콘텐츠 제작, 자동화 사용, 출처·최신성, 수정 절차와 광고 독립성 원칙`,
  alternates: {canonical: '/ko/trust'},
  openGraph: {
    title: `${site.name} 운영·신뢰 원칙`,
    description:
      '공개 법률정보를 어떻게 만들고 검증하며 광고와 분리하는지 설명합니다.',
    url: '/ko/trust',
  },
};

export default function PublicTrustPage() {
  const config = resolvePublicTrustConfig();
  if (!config) notFound();
  const pageUrl = `${site.url}/ko/trust`;
  const organizationId = `${site.url.replace(/\/$/, '')}/#organization`;
  const contactPoint = contactPointFor(config.contact.href);
  return (
    <main className={styles.page}>
      <script
        dangerouslySetInnerHTML={{__html: serializeStructuredData({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebPage',
              '@id': `${pageUrl}#webpage`,
              url: pageUrl,
              name: `${site.name} 운영·신뢰 원칙`,
              inLanguage: 'ko-KR',
              about: {'@id': organizationId},
              breadcrumb: {'@id': `${pageUrl}#breadcrumb`},
            },
            {
              '@type': 'Organization',
              '@id': organizationId,
              name: config.operatorLegalName,
              url: site.url,
              contactPoint,
            },
            {
              '@type': 'BreadcrumbList',
              '@id': `${pageUrl}#breadcrumb`,
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: '홈',
                  item: site.url,
                },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: '운영·신뢰 원칙',
                  item: pageUrl,
                },
              ],
            },
          ],
        })}}
        type="application/ld+json"
      />
      <nav aria-label="현재 위치" className="breadcrumb">
        <a href="/">홈</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">운영·신뢰 원칙</span>
      </nav>

      <header className={styles.hero}>
        <p className="eyebrow">{site.englishName} Trust</p>
        <h1>무엇을 근거로 만들고,<br />누가 책임지는지 공개합니다.</h1>
        <p>
          공개 법률정보의 출처와 검토시점을 숨기지 않고, 자동화 도구와 광고가
          콘텐츠 판단에 섞이지 않도록 운영 경계를 먼저 정합니다.
        </p>
      </header>

      <section
        aria-labelledby="identity-heading"
        className={styles.identity}
      >
        <div>
          <p className="eyebrow">운영 주체</p>
          <h2 id="identity-heading">공개 운영 정보</h2>
        </div>
        <dl>
          <div>
            <dt>법적 운영 주체</dt>
            <dd>{config.operatorLegalName}</dd>
          </div>
          <div>
            <dt>수정·이의제기 연락</dt>
            <dd>
              <PublicExternalDestinationLink
                destination={config.contact.destination}
              />
            </dd>
          </div>
          <div>
            <dt>법률 검토 자격 공개</dt>
            <dd>{config.reviewQualificationDisclosure}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-label={`${site.name} 신뢰 원칙`}
        className={styles.principles}
      >
        <article>
          <span>01</span>
          <h2>운영·콘텐츠 제작</h2>
          <p>
            생활질문을 법리카드, 결론을 가르는 사실, 확인자료와 다음 행동으로
            나누고 각 설명을 공개 근거 좌표에 연결합니다. 작성·법률 검토 정보는
            실제 표지 데이터가 있는 글에만 표시합니다.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>자동화·AI 사용 범위</h2>
          <p>
            자동화 도구와 생성형 AI는 자료 정리, 초안 구조화, 누락·형식 검사를
            보조할 수 있습니다. 도구가 만든 문장만으로 공식 근거나 전문가 검토
            표지를 만들지 않으며, 공개 정본의 승인·검증 절차를 대신하지 않습니다.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>출처·최신성</h2>
          <p>
            상세 글은 공식 원문 주소, 마지막 확인일, 콘텐츠 기준일과 다음
            점검일을 함께 표시합니다. 검토기한을 넘긴 항목은 공개 목록에서
            자동으로 제외하고 갱신 대상으로 돌립니다.
          </p>
        </article>
        <article>
          <span>04</span>
          <h2>수정·이의제기</h2>
          <p>
            오류 제보를 받으면 해당 설명의 공식 근거와 적용시점을 다시 확인하고,
            정정이 필요하면 정본을 고친 뒤 검증·출판 절차를 다시 거칩니다.
            제보만으로 법률 결론을 자동 변경하지 않습니다.
          </p>
        </article>
      </section>

      <section
        aria-labelledby="advertising-independence-heading"
        className={styles.advertising}
      >
        <div>
          <p className="eyebrow">광고 독립성</p>
          <h2 id="advertising-independence-heading">
            광고는 법률정보·공식근거·행동 안내가 아닙니다.
          </h2>
        </div>
        <ul>
          <li>광고 영역에는 사용자가 식별할 수 있는 ‘광고’ 라벨을 붙입니다.</li>
          <li>모바일 첫 화면, 긴급한 행동 안내 앞, 공식원문 카드 내부에는 두지 않습니다.</li>
          <li>광고주는 법률 설명의 결론, 노출 순서, 출처 선택에 관여할 수 없습니다.</li>
          <li>현재 준비 영역에는 실제 광고 네트워크 코드나 추적 스크립트가 없습니다.</li>
        </ul>
      </section>

      <aside className={styles.boundary}>
        <strong>이 사이트가 제공하는 범위</strong>
        <p>
          {site.name}는 일반적인 법률정보와 확인 경로를 제공합니다. 구체적인 사건의
          결론·전략·증거·서면 방향은 사실관계에 따라 달라질 수 있으며, 공개
          정보만으로 대신하지 않습니다.
        </p>
        <a href="/ko/method">콘텐츠 제작 원칙 이어서 보기 <span aria-hidden="true">→</span></a>
      </aside>
    </main>
  );
}

function contactPointFor(href: string) {
  const contact = parsePublicContactHref(href);
  return contact.kind === 'email'
    ? {
        '@type': 'ContactPoint',
        contactType: 'content corrections',
        email: contact.address,
        availableLanguage: 'ko',
      }
    : {
        '@type': 'ContactPoint',
        contactType: 'content corrections',
        url: href,
        availableLanguage: 'ko',
      };
}
