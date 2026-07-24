import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {resolvePublicPrivacyConfig} from '@/lib/public-data-practices';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';

import styles from './privacy.module.css';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '개인정보 처리방침',
  description: `${site.name} 공개사이트의 데이터 처리 항목과 보존·전송 원칙`,
  alternates: {canonical: '/ko/privacy'},
  openGraph: {
    title: `${site.name} 개인정보 처리방침`,
    description: '공개사이트의 실제 데이터 처리 항목과 선택 저장을 설명합니다.',
    url: '/ko/privacy',
  },
};

export default function PublicPrivacyPage() {
  const config = resolvePublicPrivacyConfig();
  if (!config) notFound();
  const pageUrl = `${site.url}/ko/privacy`;
  const organizationId = `${site.url}/#organization`;
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
              name: `${site.name} 개인정보 처리방침`,
              datePublished: config.effectiveDate,
              inLanguage: 'ko-KR',
              about: {'@id': organizationId},
              breadcrumb: {'@id': `${pageUrl}#breadcrumb`},
            },
            {
              '@type': 'Organization',
              '@id': organizationId,
              name: config.trust.operatorLegalName,
              url: site.url,
              contactPoint: contactPointFor(config.trust.contact.href),
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
                  name: '개인정보 처리방침',
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
        <span aria-current="page">개인정보 처리방침</span>
      </nav>

      <header className={styles.hero}>
        <p className="eyebrow">{site.englishName} Privacy</p>
        <h1>실제로 처리하는 데이터만 공개합니다.</h1>
        <p>
          이 방침은 현재 공개사이트의 데이터 처리 목록을 단일 정본에서
          그대로 보여줍니다. 분석·광고 처리는 비활성 상태입니다.
        </p>
        <dl>
          <div><dt>정책 버전</dt><dd>{config.version}</dd></div>
          <div><dt>시행일</dt><dd><time dateTime={config.effectiveDate}>{config.effectiveDate}</time></dd></div>
          <div><dt>운영 주체</dt><dd>{config.trust.operatorLegalName}</dd></div>
        </dl>
      </header>

      <section aria-labelledby="inventory-heading" className={styles.inventory}>
        <div className={styles.sectionHeading}>
          <p className="eyebrow">처리 목록</p>
          <h2 id="inventory-heading">데이터 처리 인벤토리</h2>
          <p>활성·비활성 항목을 숨기지 않고 모두 표시합니다.</p>
        </div>
        <div className={styles.cards}>
          {config.inventory.map(item => (
            <article
              className={styles.card}
              data-data-practice={item.id}
              data-practice-status={item.status}
              key={item.id}
            >
              <header>
                <span>{categoryLabel(item.category)}</span>
                <strong>{item.status === 'active' ? '활성' : '비활성'}</strong>
              </header>
              <h3>{item.purpose}</h3>
              <dl>
                <div><dt>처리 주체</dt><dd>{item.provider}</dd></div>
                <div><dt>데이터</dt><dd>{listOrNone(item.dataTypes)}</dd></div>
                <div><dt>저장 키</dt><dd>{listOrNone(item.storageKeys)}</dd></div>
                <div><dt>보존기간</dt><dd>{item.retention}</dd></div>
                <div><dt>활성 조건</dt><dd>{activationLabel(item.activationMode)}</dd></div>
                <div><dt>처리지역</dt><dd>{listOrNone(item.transfer.processingRegions)}</dd></div>
                <div><dt>서버 전송</dt><dd>{item.transfer.serverTransmission ? '있음' : '없음'}</dd></div>
                <div><dt>제3자 전송</dt><dd>{item.transfer.thirdPartyTransmission ? '있음' : '없음'}</dd></div>
                <div className={styles.wide}><dt>수탁·이전 설명</dt><dd>{item.transfer.description}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="rights-heading" className={styles.rights}>
        <div>
          <p className="eyebrow">선택과 철회</p>
          <h2 id="rights-heading">저장 상태는 사용자가 직접 초기화할 수 있습니다.</h2>
        </div>
        <p>{config.withdrawal}</p>
        <p>
          문의·정정 요청: <a href={config.trust.contact.href}>{config.trust.contact.label}</a>
        </p>
      </section>
    </main>
  );
}

function categoryLabel(category: string) {
  return {
    essential: '필수 운영',
    functional: '선택 기능',
    analytics: '분석',
    advertising: '광고',
  }[category] ?? category;
}

function activationLabel(mode: string) {
  return {
    'page-request': '페이지 요청 시',
    'after-user-action': '사용자 동작 뒤',
    denied: '활성화 금지',
  }[mode] ?? mode;
}

function listOrNone(items: string[]) {
  return items.length ? items.join(' · ') : '없음';
}

function contactPointFor(href: string) {
  return href.startsWith('mailto:')
    ? {
        '@type': 'ContactPoint',
        contactType: 'privacy inquiries',
        email: href.slice('mailto:'.length),
        availableLanguage: 'ko',
      }
    : {
        '@type': 'ContactPoint',
        contactType: 'privacy inquiries',
        url: href,
        availableLanguage: 'ko',
      };
}
