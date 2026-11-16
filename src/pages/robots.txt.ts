import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) => {
  if (!site)
    throw new Error('Astro site must be configured to generate robots.txt.');
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${new URL('/sitemap.xml', site).href}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
};
