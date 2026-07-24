import type {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {
  resolvePublicPrivacyConfig,
  type PublicConditionalDisclosure,
  type PublicDataPractice,
} from '@/lib/public-data-practices';
import {site} from '@/lib/site';
import {serializeStructuredData} from '@/lib/structured-data';
import {parsePublicContactHref} from '@/lib/public-trust';

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
                <div><dt>제3자 제공</dt><dd>{item.transfer.thirdPartyProvision ? '있음' : '없음'}</dd></div>
                <div><dt>처리위탁</dt><dd>{item.transfer.processingOutsourcing ? '있음' : '없음'}</dd></div>
                <div><dt>국외이전</dt><dd>{item.transfer.internationalTransfer ? '있음' : '없음'}</dd></div>
                <div className={styles.wide}><dt>전송·이전 설명</dt><dd>{item.transfer.description}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="legal-sections-heading" className={styles.inventory}>
        <div className={styles.sectionHeading}>
          <p className="eyebrow">법정 공개 구획</p>
          <h2 id="legal-sections-heading">처리·파기·권리행사를 구분해 공개합니다.</h2>
          <p>해당 없음도 검증된 운영 사실로 명시합니다.</p>
        </div>
        <div className={styles.cards}>
          <LegalCard title="파기절차와 방법">
            <dl>
              <div><dt>파기절차</dt><dd>{config.destruction.procedure}</dd></div>
              <div><dt>파기방법</dt><dd>{config.destruction.method}</dd></div>
            </dl>
          </LegalCard>
          <LegalCard title="정보주체와 법정대리인의 권리">
            <dl>
              <div><dt>권리·의무</dt><dd>{config.rights.description}</dd></div>
              <div><dt>행사방법</dt><dd>{config.rights.exerciseMethod}</dd></div>
              <div><dt>법정대리인</dt><dd>{config.rights.legalRepresentativeRights}</dd></div>
            </dl>
          </LegalCard>
          <LegalCard title="개인정보 보호·고충처리 담당">
            <dl>
              <div><dt>담당 역할</dt><dd>{config.privacyResponsibleRole}</dd></div>
              <div><dt>연락처</dt><dd><a href={config.trust.contact.href}>{config.trust.contact.label}</a></dd></div>
            </dl>
          </LegalCard>
          <LegalCard title="안전성 확보조치">
            <p>{config.safeguards.join(' · ')}</p>
          </LegalCard>
          <DisclosureCard disclosure={config.thirdPartyProvision} practices={config.inventory} title="제3자 제공" />
          <DisclosureCard disclosure={config.processingOutsourcing} practices={config.inventory} title="처리위탁" />
          <DisclosureCard disclosure={config.internationalTransfer} practices={config.inventory} title="국외이전" />
          <DisclosureCard disclosure={config.automaticCollection} title="자동 수집 장치" />
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
  const contact = parsePublicContactHref(href);
  return contact.kind === 'email'
    ? {
        '@type': 'ContactPoint',
        contactType: 'privacy inquiries',
        email: contact.address,
        availableLanguage: 'ko',
      }
    : {
        '@type': 'ContactPoint',
        contactType: 'privacy inquiries',
        url: href,
        availableLanguage: 'ko',
      };
}

function LegalCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <article className={styles.card}>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function DisclosureCard<T extends object>({
  disclosure,
  practices = [],
  title,
}: {
  disclosure: PublicConditionalDisclosure<T>;
  practices?: PublicDataPractice[];
  title: string;
}) {
  return (
    <article className={styles.card}>
      <header>
        <h3>{title}</h3>
        <strong>{disclosure.enabled ? '해당' : '해당 없음'}</strong>
      </header>
      {disclosure.enabled ? (
        <dl>
          {referencedPractices(disclosure.details, practices).map(practice => (
            <div className={styles.wide} key={practice.id}>
              <dt>참조 처리 항목</dt>
              <dd>
                {practice.provider} · {practice.purpose} · {practice.dataTypes.join(' · ')}
                {' · '}{practice.retention}
              </dd>
            </div>
          ))}
          {Object.entries(
            disclosure.details as Record<string, string | string[]>,
          ).filter(([key]) => key !== 'practiceIds').map(([key, value]) => (
            <div key={key}>
              <dt>{disclosureFieldLabel(key)}</dt>
              <dd>{Array.isArray(value) ? value.join(' · ') : value}</dd>
            </div>
          ))}
        </dl>
      ) : <p>{disclosure.statement}</p>}
    </article>
  );
}

function referencedPractices(
  details: object,
  practices: PublicDataPractice[],
) {
  const practiceIds = (details as {practiceIds?: string[]}).practiceIds ?? [];
  return practiceIds.map(
    id => practices.find(practice => practice.id === id)!,
  );
}

function disclosureFieldLabel(key: string) {
  return {
    countries: '이전 국가',
    description: '설명',
    legalBasis: '법적 근거',
    processor: '수탁자',
    purpose: '목적',
    purposeAndRetention: '목적·보유기간',
    recipient: '제공·이전받는 자',
    refusalMethodAndEffect: '거부 방법·효과',
    retention: '보유기간',
    safeguards: '관리·감독 조치',
    timingAndMethod: '시기·방법',
  }[key] ?? key;
}
