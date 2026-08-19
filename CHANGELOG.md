# Changelog

## Unreleased

- Dashboard timestamps in Recent Blocks refresh on the client instead of freezing at their server-rendered value.
- `apiVersion` aligned with the `2026-04` declared in `shopify.app.toml` and the theme extension.
- Explicit favicon link; corrected the License section.

## 2026-08-20

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

Public pages and infra:

- Added a root error boundary, page titles, and OG tags.
- App Bridge no longer loads twice on `/app`.
- `.dockerignore` stops baking `.env` and `prisma/dev.sqlite` into the production image.
- Added `/healthz` and a Fly health check.
- Privacy policy retention text corrected to match the 90-day prune.

## Earlier

This app started from the [Shopify React Router app template](https://github.com/Shopify/shopify-app-template-react-router). Template history is not tracked here.
