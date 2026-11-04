import { useMemo, useState } from 'react';
import { Announce, ErrorState, NewsCardSkel, SkelGroup, SlowNetworkIndicator } from '../components/states';
import { Newspaper } from 'lucide-react';
import { SEO } from '../components/SEO';
import { STATIC_SEO } from '../lib/seo-text';
import { Skel, Empty, cx } from '../components/ui';
import { getNews, timeAgo, useAsync } from '../lib/api';
import { HOT_TOPICS, topicOf } from '../server/news-filter';
import { Article, NewsThumb as Thumb, NewsMeta as Meta, NewsTag, ext } from '../components/NewsParts';

// Visitors never see keys, config or raw errors: only whether it is worth trying again soon.
const friendly = (e?: string | null) =>
  !e ? 'No football stories were found right now. Meanwhile, catch up on video highlights.'
  : /429|rate|too many|limit/i.test(e) ? 'The news service is busy right now. Please try again in a few minutes.'
  : 'The news feed is temporarily unavailable. Please try again later.';

export function News() {
  const n = useAsync(getNews, []);
  const [topic, setTopic] = useState('');           // '' = all, '__match' = match news, else a topic label
  const all = useMemo(() => ((n.data?.articles || []) as Article[]).filter((a) => a.title && a.url && !a.title.includes('[Removed]')), [n.data]);
  const topics = useMemo(() => HOT_TOPICS.map((t) => t.label).filter((l) => all.some((a) => topicOf(a) === l)), [all]);
  const matchCount = useMemo(() => all.filter((a) => a.related).length, [all]);
  const list = topic === '__match' ? all.filter((a) => a.related) : topic ? all.filter((a) => topicOf(a) === topic) : all;
  const withImg = list.filter((a) => a.urlToImage);
  const lead = withImg[0] || list[0];
  const others = list.filter((a) => a !== lead);
  const trending = others.length >= 4 ? others.slice(0, 5) : [];   // only when there is enough to fill the column
  const rest = list.filter((a) => a !== lead && !trending.includes(a));

  return (
    <div className="max-w-[88rem] mx-auto px-4 pt-6">
      <SEO {...STATIC_SEO.news} />
      <div className="mb-5"><h1 className="display text-3xl sm:text-4xl">News</h1><p className="text-muted text-sm mt-1">Football stories — starting with the matches played and coming up</p></div>

      {topics.length > 0 && (
        <div className="scroll-x gap-2 -mx-4 px-4 lg:mx-0 lg:px-0 mb-6" role="group" aria-label="Filter by topic">
          <button className="chip" aria-pressed={!topic} onClick={() => setTopic('')}>All</button>
          {matchCount > 0 && <button className="chip" aria-pressed={topic === '__match'} onClick={() => setTopic('__match')}><span className="w-2 h-2 rounded-full bg-brand" />Match news <span className="text-muted font-medium">{matchCount}</span></button>}
          {topics.map((t) => <button key={t} className="chip" aria-pressed={topic === t} onClick={() => setTopic(t)}>{t}</button>)}
        </div>
      )}

      <Announce message={n.loading ? '' : `${list.length} stor${list.length === 1 ? 'y' : 'ies'} shown`} />
      {n.loading ? (
        <SkelGroup label="Loading news">
          <div className="grid lg:grid-cols-[1.7fr_1fr] gap-5"><Skel className="h-[250px] sm:h-[420px] rounded-2xl" /><Skel className="h-[420px] rounded-2xl max-lg:hidden" /></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">{Array.from({ length: 4 }).map((_, i) => <NewsCardSkel key={i} />)}</div>
          <SlowNetworkIndicator loading={n.loading} />
        </SkelGroup>
      ) : !lead ? (
        <div className="max-w-md mx-auto">
          {n.error && !n.data
            ? <ErrorState title="News couldn’t be loaded" hint="The news feed didn’t answer. Please try again in a moment." onRetry={n.retry} />
            : <Empty icon={Newspaper} title={topic === '__match' ? 'No match stories right now' : topic ? `No ${topic} stories right now` : n.data?.error ? 'News is temporarily unavailable' : 'No articles available right now'} hint={topic ? 'Try another topic or choose All.' : friendly(n.data?.error)}
              action={topic ? { label: 'Show all stories', onClick: () => setTopic('') } : n.data?.error ? { label: 'Try again', onClick: n.retry } : { label: 'Go to Watch', to: '/watch' }} />}
        </div>
      ) : (
        <>
          {/* Lead story + trending */}
          <div className={cx('grid gap-5 items-stretch', trending.length > 0 && 'lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]')}>
            <a href={lead.url} {...ext} className="group block overflow-hidden rounded-xl sm:rounded-2xl sm:relative sm:min-h-[420px] bg-surface-2 max-sm:card">
              <span className="relative block max-sm:aspect-[16/10] sm:absolute sm:inset-0"><span className="absolute inset-0"><Thumb a={lead} plain className="group-hover:scale-[1.03] transition-transform duration-700" /></span></span>
              <span className="max-sm:hidden absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent" />
              <span className="block max-sm:p-3 max-sm:bg-surface sm:absolute sm:inset-x-0 sm:bottom-0 sm:p-8 sm:text-white">
                <NewsTag a={lead} />
                <span className="block display text-[1.2rem] sm:text-[clamp(1.5rem,4.4vw,2.5rem)] mt-2 sm:mt-3 leading-[1.1] sm:leading-[1.04] sm:text-shadow line-clamp-4">{lead.title}</span>
                {lead.description && <span className="hidden sm:block mt-3 text-sm text-white/80 line-clamp-2 max-w-2xl">{lead.description}</span>}
                <span className="block mt-1.5 sm:mt-3 text-xs text-muted sm:text-white/75">{lead.source?.name}{lead.publishedAt ? ` · ${timeAgo(lead.publishedAt)}` : ''}</span>
              </span>
            </a>
            {trending.length > 0 && (
              <aside className="card p-4 sm:p-5 flex flex-col" aria-label="Trending">
                <p className="display-wide text-base mb-3">Trending</p>
                <ol className="divide-y divide-line/70 flex-1">
                  {trending.map((a, i) => (
                    <li key={a.url}>
                      <a href={a.url} {...ext} className="group flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                        <span className="display text-3xl text-brand/40 w-7 shrink-0 leading-none pt-0.5 num">{i + 1}</span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-snug line-clamp-3 group-hover:text-brand transition-colors">{a.title}</span><span className="block mt-1"><Meta a={a} /></span></span>
                        <span className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-surface-2 hidden sm:block"><Thumb a={a} className="text-xl" /></span>
                      </a>
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </div>

          {/* Latest grid */}
          {rest.length > 0 && (
            <section className="mt-10">
              <h2 className="display text-[1.6rem] sm:text-[1.9rem] mb-4">Latest stories</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
                {rest.map((a) => (
                  <a key={a.url} href={a.url} {...ext} className="group card overflow-hidden flex flex-col hover:border-ink/60 hover:shadow-md transition-[border-color,box-shadow] max-sm:rounded-xl">
                    <span className="relative block aspect-[16/10] max-sm:aspect-[2/1] bg-surface-2 overflow-hidden">
                      <Thumb a={a} className="group-hover:scale-[1.04] transition-transform duration-500" />
                    </span>
                    <span className="flex flex-col flex-1 p-4 max-sm:p-3">
                      <span className="font-semibold text-[15px] leading-snug line-clamp-3 group-hover:text-brand transition-colors">{a.title}</span>
                      <span className="mt-auto pt-3"><Meta a={a} /></span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
