# Public-site SEO

Implemented 2026-09-08. Scope: homepage, About, Contact; private application remains excluded.

- Unique titles, descriptions and self-canonical URLs on public pages.
- Open Graph and Twitter large-image metadata with a 1200 × 630 AIRS CRM PNG.
- Brand favicon, SVG logo and Apple touch icon.
- Organization, WebSite and WebPage JSON-LD matching the homepage; no invented reviews, prices or social profiles.
- Public-only XML sitemap; robots rules allow public marketing pages and their assets, exclude application URLs.
- Root metadata defaults to noindex; production public pages opt into indexing. Login, registration, APIs and authenticated app responses also receive noindex headers.
- Preview/local public pages remain noindex. Production indexing requires Vercel production environment or explicit SITE_URL on a standalone production host.
- About explains the actual competitor discovery, coverage, briefs, missions and benchmarking workflow.
- FAQ remains readable HTML. No promise of special FAQ search results or AI inclusion.

## Domain configuration

Canonical origin: SITE_URL, then NEXT_PUBLIC_SITE_URL, then VERCEL_PROJECT_PRODUCTION_URL. Local fallback is http://localhost:3000. Vercel supplies its production hostname automatically. When adopting a custom primary domain, set SITE_URL to its HTTPS origin and redeploy. Never use a per-deployment preview hostname as the canonical origin.

## Owner steps after deployment

Verify the chosen domain in Google Search Console and Bing Webmaster Tools, then submit /sitemap.xml. These require the owner's accounts; no verification tokens were invented. Review impressions, clicks and enquiries to guide future content. Existing sharing previews may be cached by their platform; use its refresh/debug tool if an old preview persists.

## References

- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- Bundled Next.js metadata and Open Graph documentation.
