# Engineering agent instructions

- Never claim an academic institution, employer, or collaborator was a paying client of Prather Software without explicit evidence.
- Never publish unverified products, prices, testimonials, screenshots, or company team members.
- Do not enable the contact form without server-side validation, Turnstile, rate limiting, and verified mail delivery.
- Keep the site static-first and avoid adding a database without a clear need.
- Run `npm run build` and accessibility checks before merging.

## Workstreams
1. Frontend: reusable navigation, responsive components, typography and keyboard UX.
2. Content: typed collections, verified case studies, product release catalog.
3. Infrastructure: Cloudflare Workers deployment, DNS staging, secure contact endpoint.
4. QA: build, accessibility, link checks, browser testing, performance.
