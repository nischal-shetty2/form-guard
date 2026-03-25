# FormGuard – Spam Blocker for Shopify Contact Forms

FormGuard is a Shopify app that protects your store's contact form from spam submissions using three layers of detection — **honeypot fields**, **time-based analysis**, and **keyword filtering** — all without CAPTCHAs or third-party services.

## How It Works

FormGuard installs as a theme app extension that automatically attaches to your store's contact form. When a visitor submits the form, three checks run client-side before the submission is allowed through:

1. **Honeypot** — An invisible field is injected into the form. Bots that auto-fill every field will trigger this trap.
2. **Time-based detection** — Submissions that happen within 2 seconds of page load are flagged as bot behavior.
3. **Keyword filtering** — Form content is checked against a merchant-defined blocklist of keywords (matched as whole words).

Blocked submissions are silently prevented from reaching the store, and a non-specific message is shown to the user. All events (blocked and valid) are logged for the merchant to review in the app dashboard.

## Features

- **One-click enable/disable** toggle from the app dashboard
- **Custom keyword blocklist** — add and remove blocked words per store
- **7-day analytics** — view spam blocked vs. valid submissions with breakdowns by reason (honeypot, time, keyword)
- **Zero-config setup** — install the app and enable the theme block, no code changes needed
- **No CAPTCHAs** — invisible protection that doesn't degrade the customer experience
- **Rate limiting** — event logging is rate-limited to 60 events per shop per minute

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

Private — not published.
