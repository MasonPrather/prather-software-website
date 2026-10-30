# Engineering instructions

## Commands and architecture

- Use Node 24 LTS and npm with the committed `package-lock.json`; install with `npm ci`.
- `npm run dev` runs Astro; `npm run build` outputs static assets in `dist/`.
- `npm run worker:dev` runs the standalone Worker and static assets locally after a build. Astro dev/preview alone does not provide `/api/contact`.
- `npm run check` validates Astro/TypeScript and the separate Worker TypeScript project.
- Before completing a change, run the relevant checks. Before a PR, run `npm run verify` and `npm audit --audit-level=high`. Install the test browser with `npx playwright install chromium firefox webkit` first.
- Keep Astro static-first. The Worker serves `ASSETS` and a contact endpoint; avoid adding a server adapter, UI framework, database, R2 storage, or client-side library without a demonstrated need.
- Generate Worker environment declarations using `npm run worker:types` after changing bindings. Do not hand-edit generated declarations.

## Truthful content

- Never describe an academic institution, employer, or collaborator as a paying Prather Software client without explicit evidence.
- Never publish unverified products, prices, testimonials, screenshots, partnerships, or team members.
- Keep work attribution explicit: academic research, prior professional experience, independent project, or verified Prather Software client engagement.
- Release windows are plans and must never automatically change a product to Released. Keep planned support separate from current platforms, and preserve conditional roadmap language. Individual publishing-label credits require evidence.
- Product collection drafts default to unpublished. Only verified entries may set `published: true`; published releases require a verified store URL.
- Keep test fixtures out of source content and production output. The content regression script uses a disposable directory.

## Contact, secrets, and operations

- Do not enable contact collection until server validation, Turnstile hostname/action verification, rate limiting, privacy review, and real mail acceptance have been verified in staging.
- Preserve both server-side enable/verification gates and the frontend build gate. Never imply mail delivery from a validation-only or failed provider response.
- Do not log message bodies, tokens, email addresses, or secrets. Keep secrets in ignored local files and Cloudflare environment secrets. Never commit `.env`, `.dev.vars`, API tokens, or credentials.
- Keep the outbound provider endpoint fixed. Validate all visitor fields; treat provider failures and missing bindings as unavailable.
- Do not deploy, change production DNS, attach `prathersoftware.com`, or merge a PR without explicit user authorization. A local dry run is safe and expected. Follow `docs/cloudflare-staging.md`.

## Accessibility and design

- Preserve semantic HTML, accessible names, keyboard navigation, visible focus, no-JavaScript navigation, and reduced-motion behavior.
- Maintain mobile/tablet/desktop layouts and crimson/black/white identity. Avoid unneeded effects and external font requests.
- Metadata must include descriptions, canonical URLs, social sharing metadata, and truthful structured data. Keep sitemap entries restricted to published content.

## Parallel ownership

Assign non-overlapping files before starting concurrent edits:

1. Frontend: Base layout, Header/Footer, homepage, global styles, identity assets.
2. Content: collection schemas and Markdown, services/work/products/about/privacy pages, reusable content templates, sitemap/robots.
3. Infrastructure: Worker, Wrangler configuration/types, contact page/client/shared validation, staging guide and environment examples.
4. QA/lead: package/configuration, CI, automated tests, README/AGENTS, integration fixes, commits and PR.

Use `feature/milestone-2-website` for the milestone and meaningful incremental commits. Preserve preexisting changes. Do not merge automatically.
