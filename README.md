# Prather Software — Website Foundation

Astro static-first website prototype for prathersoftware.com. The site presents B2B software engineering and B2C software/game publishing as complementary business lines.

## Development

```bash
npm install
npm run dev
npm run build
```

## Status

Milestone 1 prototype. **Not production-ready yet.** Contact form is intentionally disabled until Cloudflare Turnstile, server-side validation, rate limiting, and transactional email delivery are configured. Portfolio entries are prior research/professional experience, not claimed commercial clients. Product catalog is in development. Privacy copy is provisional. Branding uses a placeholder lettermark, not a finalized logo.

## Next engineering tasks

1. Confirm brand assets and case-study publication permissions.
2. Convert project/product content to typed Astro Content Collections.
3. Add individual case study and product detail routes with verified content.
4. Implement secure contact endpoint with Turnstile and email delivery.
5. Add sitemap, social sharing images, structured data, accessibility and performance tests.
6. Add Cloudflare Workers adapter and Wrangler configuration; deploy to staging before production.

## Agent workstreams

- Frontend agent: componentize page sections, mobile navigation, accessibility tests.
- Content agent: verified project attribution, SEO, product schemas.
- Infrastructure agent: Cloudflare Workers, DNS, Turnstile, mail integration, staging.
- QA agent: browser/device testing, WCAG 2.2 AA audit, security and performance gates.


## Milestone 2 additions

- Astro content collections in `src/content.config.ts` for work, software and games.
- Case-study detail routes at `/work/[slug]/`.
- Software and game detail route templates; unpublished products are not shown.
- Sitemap and robots.txt routes.
- `AGENTS.md` for parallel coding-agent assignments and guardrails.

Run `npm install && npm run build` to validate before deployment. npm install was unavailable in the execution environment, so the build has not yet been verified.

## GitHub setup

Create a private repository named `prather-software-website` in your GitHub account, then run:

```bash
git init
git add .
git commit -m "feat: establish Prather Software website milestone 2"
git branch -M main
git remote add origin git@github.com:MasonPrather/prather-software-website.git
git push -u origin main
```

Do not run the remote commands until the repository exists and your GitHub authentication is configured.
