/**
 * Goal4U v4 — routes. URL structure is unchanged from v3 so existing links,
 * sitemap entries and the search index keep working.
 */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AppLayout } from './components/layout/AppLayout';
import { ScrollToTop } from './components/ScrollToTop';
import { Home } from './pages/Home';
import { Matches } from './pages/Matches';
import NotFound from './pages/NotFound';

const MatchDetail = lazy(() => import('./pages/MatchDetail').then((m) => ({ default: m.MatchDetail })));
const Competition = lazy(() => import('./pages/Competition').then((m) => ({ default: m.Competition })));
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })));
const Player = lazy(() => import('./pages/Player').then((m) => ({ default: m.Player })));
const Watch = lazy(() => import('./pages/Watch').then((m) => ({ default: m.Watch })));
const News = lazy(() => import('./pages/News').then((m) => ({ default: m.News })));
const About = lazy(() => import('./pages/Info').then((m) => ({ default: m.About })));
const Contact = lazy(() => import('./pages/Info').then((m) => ({ default: m.Contact })));
const Privacy = lazy(() => import('./pages/Info').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Info').then((m) => ({ default: m.Terms })));

// Optional secret stream page (src/streams): the route and its code exist in the build only when STREAMS_PAGE is on. It sits OUTSIDE AppLayout: no header, footer or tabs.
declare const __STREAMS_PAGE__: boolean | undefined;
declare const __STREAMS_PATH__: string | undefined;
const StreamsPage = typeof __STREAMS_PAGE__ !== 'undefined' && __STREAMS_PAGE__ ? lazy(() => import('./streams/StreamsPage')) : null;

const ToStats = () => { const { slug, season } = useParams(); return <Navigate replace to={`/competition/${slug}${season ? '/' + season : ''}?tab=stats`} />; };
const ToComp = () => { const { competition, season } = useParams(); return <Navigate replace to={`/competition/${competition}${season ? '/' + season : ''}`} />; };

export default function App() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<div className="min-h-[60vh]" />}>
          <Routes>
            {StreamsPage && <Route path={typeof __STREAMS_PATH__ !== 'undefined' ? __STREAMS_PATH__ : 'streams'} element={<StreamsPage />} />}
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="matches" element={<Matches />} />
              <Route path="live" element={<Navigate replace to="/matches?filter=live" />} />
              <Route path="match/:id" element={<MatchDetail />} />
              <Route path=":season/match/:id" element={<MatchDetail />} />
              <Route path="competition/:slug" element={<Competition />} />
              <Route path="competition/:slug/:season" element={<Competition />} />
              {['standings', 'results', 'fixtures', 'stats', 'analytics', 'predictions'].map((p) => (
                <Route key={p} path={`${p}/:slug`} element={<Competition />} />
              ))}
              {['standings', 'results', 'fixtures', 'stats', 'analytics', 'predictions'].map((p) => (
                <Route key={p + 's'} path={`${p}/:slug/:season`} element={<Competition />} />
              ))}
              <Route path="top-scorers/:slug" element={<ToStats />} />
              <Route path=":season/top-scorers/:slug" element={<ToStats />} />
              <Route path="archive/:competition" element={<ToComp />} />
              <Route path="archive/:competition/:season" element={<ToComp />} />
              <Route path="team/:slug" element={<TeamPage />} />
              <Route path="team/:slug/:season" element={<TeamPage />} />
              <Route path="player/:name" element={<Player />} />
              <Route path="watch" element={<Watch />} />
              <Route path="media" element={<Navigate replace to="/watch" />} />
              <Route path="news" element={<News />} />
              <Route path="about" element={<About />} />
              <Route path="contact" element={<Contact />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="h2h/:teams" element={<Navigate replace to="/matches" />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </HelmetProvider>
  );
}
