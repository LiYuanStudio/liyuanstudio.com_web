import { useEffect, useState } from 'react';
import { useStaticSite } from '../site/context.js';
import { getErrorMessage } from '../api/errors.js';
import {
  CollageCard,
  CollageGrid,
  ContentHubLayout,
  type HubTone,
} from '../components/ContentHub.js';
import { matchReleaseContentPath } from '../lib/news-path.js';
import type { NewsUpdate } from '../types.js';
import { NewsDetailPage } from './NewsDetailPage.js';

const TONES: HubTone[] = ['blue', 'green', 'pink', 'orange', 'ink', 'sand'];

function ReleaseIndex() {
  const site = useStaticSite();
  const [items, setItems] = useState<NewsUpdate[]>(site?.content.news ?? []);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(site ? 'ready' : 'loading');
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = '动态 | LiYuan Studio';
    if (site) return;
    let cancelled = false;
    import('../api/news.js').then(({ fetchNews }) => fetchNews())
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(getErrorMessage(cause, '最新动态暂时无法加载，请稍后刷新。'));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [site]);

  return (
    <ContentHubLayout
      current="release"
      title="动态"
      description="产品更新、品牌动向与团队成长的一线消息。"
    >
      {status === 'loading' && <p className="hub-status" role="status">动态加载中…</p>}
      {status === 'error' && <p className="hub-status hub-status-error" role="alert">{error}</p>}
      {status === 'ready' && items.length === 0 && <p className="hub-status">敬请期待</p>}
      <CollageGrid busy={status === 'loading'}>
        {items.map((item, index) => (
          <CollageCard
            key={item._id || item.slug}
            href={`/release/${encodeURIComponent(item.slug)}/`}
            title={item.title}
            eyebrow={item.tag || 'News'}
            description={item.description}
            meta={item.date}
            image={item.image}
            tone={TONES[index % TONES.length]}
            ariaLabel={`阅读动态：${item.title}`}
          />
        ))}
      </CollageGrid>
    </ContentHubLayout>
  );
}

export function ReleasePage() {
  const site = useStaticSite();
  const slug = matchReleaseContentPath(site?.pathname ?? window.location.pathname);
  return slug ? <NewsDetailPage slug={slug} /> : <ReleaseIndex />;
}
