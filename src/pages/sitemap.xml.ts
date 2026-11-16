import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );
export const GET: APIRoute = async ({ site }) => {
  if (!site)
    throw new Error('Astro site must be configured to generate the sitemap.');
  const paths = [
    '/',
    '/services/',
    '/products/',
    '/products/software/',
    '/products/games/',
    '/about/',
    '/about/team/',
    '/contact/',
    '/privacy/',
  ];
  for (const category of ['software', 'games'] as const) {
    for (const entry of await getCollection(
      category,
      ({ data }) => data.published,
    ))
      paths.push(`/products/${category}/${entry.id}/`);
  }
  const urls = [...new Set(paths)]
    .sort()
    .map(
      (path) => `<url><loc>${escapeXml(new URL(path, site).href)}</loc></url>`,
    )
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
