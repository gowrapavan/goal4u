import { SEO } from '../components/SEO';
import { STATIC_SEO } from '../lib/seo-text';
import { PitchArt } from '../components/ComingSoon';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-12 sm:py-20 text-center">
      <SEO {...STATIC_SEO.notFound} noindex />
      <PitchArt tone="404" className="max-w-[26rem] mx-auto" />
      <p className="display text-[clamp(4rem,22vw,7rem)] text-brand leading-none mt-4">404</p>
      <h1 className="display-wide text-2xl mt-2">Offside — nothing here</h1>
      <p className="text-muted mt-2">That page doesn’t exist or the match has moved. Head back to the scores.</p>
      <div className="flex flex-wrap justify-center gap-2 mt-6"><Link to="/" className="chip on">Home</Link><Link to="/matches" className="chip">Scores</Link><Link to="/competition/premier-league" className="chip">Tables</Link></div>
    </div>
  );
}
