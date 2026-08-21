# FormGuard

Shopify app that blocks contact form spam. React Router v7 + Prisma/SQLite, deployed to Fly.io, with a theme app extension for the storefront.

## GitHub identity

This is a **personal** repo (`nischal-shetty2/form-guard`). Never commit or push it as `nischal.shetty@aktsk.ai`.

Git is already configured for it in `.git/config`: local `user.email` is the personal address, and a local credential helper resolves the personal token per push, so `git push` works no matter which account `gh` happens to have active. `gh auth switch` is not needed and should not be run, since it mutates global state and would break work repos in other sessions.

`gh` subcommands are the gap: they use whichever account is active, so **writes** (`gh pr create`, `gh pr merge`, `gh api -X POST`) fail with a 403 when it has flipped to `nischal-aktsk`. Reads succeed because the repo is public, which makes the flip easy to miss until a write fails. Prefix writes with an explicit token rather than switching:

```shell
GH_TOKEN="$(gh auth token --user nischal-shetty2)" gh pr create ...
```

`.git/config` is not cloned. After a fresh clone, re-apply:

```shell
git config --local user.name "Nischal Shetty"
git config --local user.email "nischal.shetty02@gmail.com"
git config --local --replace-all 'credential.https://github.com.helper' ''
git config --local --add 'credential.https://github.com.helper' \
  '!f() { test "$1" = get && printf "username=nischal-shetty2\npassword=%s\n" "$(gh auth token --user nischal-shetty2)"; }; f'
```

The empty first value matters: it resets the helper chain inherited from the global config, which would otherwise answer first with whichever account is active.

## Verify

```shell
npm run typecheck
npx eslint --ignore-path .gitignore app extensions
npm run build
node --check extensions/formguard-block/assets/formguard.js
```

The storefront script is plain ES5 in a `<script>` tag, not part of the bundle, so `node --check` is the only thing that catches a syntax error in it. Nothing else type-checks it.

## Deploy

Two separate deploys, and the order matters. The server has to accept a new event reason before the extension starts sending it:

```shell
fly deploy                                    # server
npx shopify app deploy --allow-updates        # app config + theme extension
```

`--allow-updates` is required in a non-interactive shell. It pushes everything in `shopify.app.toml` (URLs, webhooks, app proxy) alongside the extension, and releases to all installed shops.

Confirm after: `curl https://formguard-spam-blocker.fly.dev/healthz` returns `ok`, and `fly status -a formguard-spam-blocker` shows the check passing.

## Checking production

```shell
fly logs -a formguard-spam-blocker --no-tail        # only ~45 min retained
fly machine status <id> -a formguard-spam-blocker   # restarts, OOM, check history
```

Webhook delivery failures are not in Fly's logs. They live in the Shopify dev dashboard under Monitoring → Webhooks, where clicking a topic shows per-delivery response codes.

To confirm a released extension actually propagated, find the asset URL in a live storefront's HTML and diff it against the repo:

```shell
curl -sL https://<shop>.myshopify.com/ | grep -oE '[^"]*formguard[^"]*\.js[^"]*'
```

## Things that bite

- **Detection runs entirely in the browser.** Shopify owns `/contact` and there is no server-side hook, so FormGuard stops automated browser form-fills, not a script POSTing directly. Don't let the copy drift back into implying otherwise.
- **The honeypot field name is load-bearing.** Anything containing `phone`, `name`, or `email` gets filled by browser autofill, which ignores `autocomplete="off"` for contact fields. That silently discards real customers' messages and looks like a successful block.
- **React 18 drops unrecognised function props on custom elements.** `onRemove` on a Polaris web component typechecks and never fires. Assign the element's own `onremove` through a ref. Revisit when this moves to React 19, where setting both would double-fire.
- **SQLite on a single Fly volume.** Scaling past one machine breaks the shop-config cache invalidation and splits the database. The 60s TTL is the only backstop.
- **`prisma generate` must stay after `npm prune` in the Dockerfile.** The prune can take the generated client with it, which is why it used to run on every boot.
