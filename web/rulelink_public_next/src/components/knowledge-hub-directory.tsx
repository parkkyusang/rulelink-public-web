import type {PublicKnowledgeHub} from '@/types/publication';

import styles from './knowledge-hub-directory.module.css';

type HubSummary = Pick<PublicKnowledgeHub, 'content_ids' | 'hub_id' | 'slug' | 'title_ko' | 'description_ko'>;

export function KnowledgeHubDirectory({hubs}: {hubs: HubSummary[]}) {
  if (!hubs.length) return null;

  return (
    <section aria-labelledby="knowledge-hub-heading" className={styles.directory}>
      <div className={styles.heading}>
        <h3 id="knowledge-hub-heading">주제별로 전체 보기</h3>
        <span>{hubs.length}개 주제</span>
      </div>
      <nav aria-label="주제별 생활법률 지식" className={styles.grid}>
        {hubs.map(hub => (
          <a className={styles.card} href={`/ko/hubs/${hub.slug}`} key={hub.hub_id}>
            <span className={styles.meta}>
              <b>주제 허브</b>
              <small>{hub.content_ids.length}개 안내</small>
            </span>
            <strong className={styles.title}>{hub.title_ko}</strong>
            <p className={styles.description}>{hub.description_ko}</p>
          </a>
        ))}
      </nav>
    </section>
  );
}
