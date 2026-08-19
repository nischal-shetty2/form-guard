# Changelog

Nothing here is tagged. The app deploys from `main` to Fly, so entries stay under
Unreleased and the section gets dated when it ships.

## Unreleased

Storefront detection:

- Honeypot renamed off `fgphone`. Browser autofill matches field names on substring and ignores `autocomplete="off"` for contact fields, so real customers had the trap filled for them and their message was silently dropped.
- Submit listener moved to the capture phase, so a theme that AJAX-submits the contact form can no longer beat the check.
- Keywords hydrate synchronously from a `sessionStorage` cache, closing the window where a submit arrived before the fetch resolved and skipped keyword filtering entirely.
- `findContactForm` no longer returns the footer form it had just rejected, and now falls back to a footer form only when it has a message field.
- App proxy URL is root-relative. `{{ shop.url }}` always resolves to the primary domain, so on a market-specific domain the fetch was cross-origin and CORS-blocked, disabling filtering and event logging.
- Added a `nointeraction` reason for submits with no trusted focus, keyboard, or pointer event on the page, plus an 800ms floor between first field interaction and submit.
- Blocked message gets `role="alert"` and scrolls into view.

Backend:

- Event reasons are validated against the shop's blocklist, so a storefront visitor can no longer inflate the counters or push arbitrary text into Top Blocked Keywords.
- App proxy requests naming more than one shop are refused.
- Per-shop cache of the enabled flag and blocklist, invalidated on write and on uninstall/redact.
- Restored the `createdAt` index that the shop-scoping migration dropped, so the retention prune stops full-scanning `SpamEvent`.
- Failed event writes and prunes are logged instead of swallowed.

Admin:

- Dark mode fixed: reason and keyword chips use `s-badge` and `s-clickable-chip` rather than Polaris React tokens that web components never resolved.
- Actions report real outcomes instead of always claiming success, and every control has a pending state.
- Added a Recent Blocks log, a block rate, and merchant-facing reason labels.
- Keyword blocklist capped at 200, enforced inside the insert transaction.
- Recent Blocks timestamps no longer freeze at their server-rendered value. One page timer drives every row, anchored to the server's clock rather than the browser's, and the loader revalidates on the same beat so the rows behind the labels move too.

Public pages and infra:

- Added a root error boundary, page titles, and OG tags.
- App Bridge no longer loads twice on `/app`.
- `.dockerignore` stops baking `.env` and `prisma/dev.sqlite` into the production image.
- Added `/healthz` and a Fly health check.
- Privacy policy retention text corrected to match the 90-day prune.
- `favicon.ico` is a real 16/32/48/64 icon again, built from the logo. It had been overwritten with a 300KB PNG behind an `.ico` extension, which browsers served as the wrong content type and pulled on every page view.
- Admin API version lives in `app/api-version.server.ts` and is shared with the codegen config, which had been left on `2025-10` while everything else moved to `2026-04`.
- Added `LICENSE`: all rights reserved for FormGuard's own code, with the upstream Shopify template's MIT notice retained as that license requires.

## Earlier

This app started from the [Shopify React Router app template](https://github.com/Shopify/shopify-app-template-react-router). Template history is not tracked here; the two settings that history explained now carry their own comments, at `future.expiringOfflineAccessTokens` in `app/shopify.server.ts` and the `openssl` install in the `Dockerfile`.
