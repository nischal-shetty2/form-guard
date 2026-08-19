# FormGuard – Spam Blocker for Shopify Contact Forms

FormGuard is a Shopify app that protects your store's contact form from spam submissions using layered client-side detection — **honeypot fields**, **behaviour analysis**, and **keyword filtering** — all without CAPTCHAs or third-party services.

## How It Works

FormGuard installs as a theme app extension that automatically attaches to your store's contact form. When a visitor submits the form, three checks run client-side before the submission is allowed through:

1. **Honeypot** — An invisible field is injected into the form. Bots that auto-fill every field trigger the trap. The field is deliberately named so that browser autofill won't match it, since a filled trap silently discards a real customer's message.
2. **Behaviour analysis** — A submission is flagged if it arrives within 2 seconds of page load, within 800ms of the visitor's first interaction with the form, or with no keyboard, pointer, or focus event anywhere on the page.
3. **Keyword filtering** — Form content is checked against a merchant-defined blocklist. Plain words match on word boundaries, so "cialis" doesn't trip on "specialist"; phrases and email addresses match anywhere.

Blocked submissions are prevented from reaching the store and a non-specific message is shown to the visitor. All events, blocked and valid, are logged for the merchant to review in the dashboard.

### What this does and doesn't stop

Every check runs in the visitor's browser, because Shopify owns the `/contact` endpoint and there is no server-side hook to intercept a submission before it is delivered. FormGuard therefore stops **automated browser form-fills**, which is the overwhelming majority of contact form spam. It does not stop a script that POSTs directly to `/contact` without loading the page, and it is not a defence against someone deliberately targeting a specific store.

## Features

- **One-click enable/disable** toggle from the app dashboard
- **Custom keyword blocklist** — add and remove blocked words per store, up to 200
- **7-day analytics** — spam blocked vs. valid submissions, block rate, breakdown by reason, and a log of recent blocks with the keyword that matched
- **Zero-config setup** — install the app and enable the theme block, no code changes needed
- **No CAPTCHAs** — invisible protection that doesn't degrade the customer experience
- **Rate limiting** — event logging is rate-limited to 60 events per shop per minute
- **Data retention** — spam events are pruned after 90 days; all shop data is deleted on uninstall

## Tech Stack

| Layer            | Technology                                                   |
| ---------------- | ------------------------------------------------------------ |
| App framework    | [React Router v7](https://reactrouter.com/) + TypeScript     |
| Shopify SDK      | [@shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router) |
| UI               | [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components) |
| Database         | SQLite via [Prisma](https://www.prisma.io/)                  |
| Theme extension  | Liquid block + vanilla JavaScript                            |
| Hosting          | [Fly.io](https://fly.io/) (Docker)                          |

## Project Structure

```
form-guard/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx           # Main dashboard (toggle, keywords, analytics)
│   │   ├── api.formguard.keywords.ts # App proxy – serves keywords to storefront
│   │   ├── api.formguard.event.ts    # App proxy – logs spam/valid events
│   │   ├── app.tsx                   # App shell layout
│   │   └── webhooks.*.tsx            # Webhook handlers
│   ├── shopify.server.ts            # Shopify auth & API configuration
│   ├── shop-config.server.ts        # Per-shop cache of enabled flag + blocklist
│   └── db.server.ts                 # Prisma client
├── extensions/
│   └── formguard-block/
│       ├── blocks/formguard.liquid   # Theme block (injects into storefront)
│       └── assets/formguard.js       # Client-side spam detection script
├── prisma/
│   └── schema.prisma                # Database schema
├── Dockerfile                       # Production container
├── fly.toml                         # Fly.io deployment config
└── shopify.app.toml                 # Shopify app configuration
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20.19+ or v22.12+
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)

### Setup

```shell
npm install
```

### Local Development

```shell
npm run dev
```

This runs `shopify app dev`, which handles authentication, tunneling, and environment variables. Press **P** to open the app in your browser once it's running.

### Database

FormGuard uses SQLite by default. The schema is managed with Prisma:

```shell
npx prisma migrate dev    # Create/apply migrations during development
npx prisma generate       # Regenerate the Prisma client
```

## Deployment

The app is deployed to [Fly.io](https://fly.io/) using Docker. The SQLite database is persisted on a Fly volume mounted at `/data`.

### Deploy to Fly.io

```shell
fly deploy
```

### Deploy Shopify Config

```shell
npm run deploy
```

This syncs your `shopify.app.toml` configuration (webhooks, scopes, app proxy) with the Shopify Partner Dashboard.

## App Proxy

FormGuard uses a [Shopify App Proxy](https://shopify.dev/docs/apps/build/online-store/app-proxies) to let the storefront JavaScript communicate with the app backend:

| Endpoint     | Purpose                                       |
| ------------ | --------------------------------------------- |
| `/keywords`  | Returns the shop's keyword blocklist + enabled state |
| `/event`     | Logs spam/valid submission events              |

The proxy is configured under the path `apps/formguard` in `shopify.app.toml`.

## License

No license granted. The source is public to read, but all rights are reserved.
It is not offered for reuse or redistribution.
