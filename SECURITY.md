# Security notes

## Static analysis

`npm run sast` runs OpenGrep with the same ruleset the challenge review uses (`--config=r/all`). The target is 0 ERROR and at most 3 WARNING findings.

Every suppression is a verified false positive, listed here with its reason:

| File | Rule | Why it is a false positive |
|---|---|---|
| `apps/web/src/api/client.ts` | `gitlab.nodejs_scan.javascript-ssrf-rule-node_ssrf` | Runs in the browser, not the server, and `apiUrl()` rejects anything that is not a same-origin `/api/` path before `fetch` is called. |

The one remaining scan error is a parse error inside the ruleset itself (`gitlab.security_code_scan.SCS0004-1`, a C# rule), not in this code.

## Controls in place

- Every request body, query and path parameter is validated with zod; failures return 400 with field details and never a stack trace.
- Helmet security headers and a strict Content Security Policy (`default-src 'self'`); no inline scripts, no `dangerouslySetInnerHTML`, creatives render from structured data.
- Rate limiting on all routes (1,200 per minute per IP) and tighter limits on claim and family-share endpoints (20 per minute).
- Offer links are HMAC-signed and expire with the linked flight's gate close, so claims cannot be forged for campaigns that never played. The signing secret is `CLAIM_SECRET` or a random value stored on first boot.
- AIDX XML is parsed with entity processing disabled (no XXE); the test suite proves an injected entity is not expanded.
- SQL uses prepared statements only; the reset list is a fixed set of statements.
- No secrets in the repository; `.env.example` documents every setting and all have safe defaults.
- Containers run as non-root with pinned base images, `no-new-privileges`, a read-only filesystem and localhost-only port binding in `docker-compose.yml`.
- Privacy: crowd profiles are aggregated shares per flight, zone and time window. No per-passenger data exists; the phone keeps its own promo code in local storage and the server stores nothing about the device.
