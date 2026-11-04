import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { canonicalPath, breadcrumbTrail } from '../lib/routes';
import { DEFAULT_OG_IMAGE, SITE_NAME } from '../lib/seo-text';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  /** Extra JSON-LD (object or array). A BreadcrumbList is added automatically for indexable pages. */
  schema?: any;
  ogImage?: string;
  type?: string;
  /** Mark a page that must not be indexed (not-found states). */
  noindex?: boolean;
  /** Name of the page itself for the breadcrumb's last item (defaults to the title without the site suffix). */
  breadcrumbLeaf?: string;
}

/**
 * Page <head>. The canonical comes from the SAME route rules the server and the sitemap use (src/lib/routes.ts), so
 * it keeps the identifying query (?teamId=, ?c=) and drops presentation-only params (?tab=, ?md=, ?filter=).
 * It replaces — never duplicates — the tags the server already put in the first HTML response (data-rh).
 */
export const SEO: React.FC<SEOProps> = ({ title, description, canonical, schema, ogImage = DEFAULT_OG_IMAGE, type = 'website', noindex, breadcrumbLeaf }) => {
  const siteUrl = ((import.meta as any).env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  const img = ogImage.startsWith('/') ? siteUrl + ogImage : ogImage;
  const { pathname, search } = useLocation();
  const path = noindex ? null : canonicalPath(pathname, search);
  const finalCanonical = canonical || (path ? siteUrl + path : undefined);
  const leaf = breadcrumbLeaf || title.replace(new RegExp(`\\s*\\|\\s*${SITE_NAME}$`), '');
  const trail = path ? breadcrumbTrail(pathname, search, leaf) : [];
  const crumbs = trail.length > 1 ? [{
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: siteUrl + c.path })),
  }] : [];
  const blocks = [...(schema ? (Array.isArray(schema) ? schema : [schema]) : []), ...crumbs];
  const ld = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={noindex ? 'noindex,follow' : 'index,follow'} />
      {finalCanonical && <link rel="canonical" href={finalCanonical} />}

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      {finalCanonical && <meta property="og:url" content={finalCanonical} />}
      <meta property="og:image" content={img} />
      <meta property="og:site_name" content={SITE_NAME} />

      <meta name="twitter:card" content={ogImage === DEFAULT_OG_IMAGE ? 'summary' : 'summary_large_image'} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={img} />

      {blocks.map((b, i) => <script key={i} type="application/ld+json">{ld(b)}</script>)}
    </Helmet>
  );
};
