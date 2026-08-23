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
npm run test:storefront
```

The storefront script is plain ES5 in a `<script>` tag, not part of the bundle, so nothing type-checks it and `node --check` only proves it parses.

`npm run test:storefront` is the one that matters. It runs the real asset in a stubbed DOM and drives it the way a browser does: evaluate, find the form, dispatch gestures, submit, then assert on the reason it reports. Run it on every change to `formguard.js`, and pass a path to check a specific build (`node test/storefront.js /tmp/served.js` against what the CDN is actually serving).

It exists because `node --check`, eslint, and unit tests of functions extracted from the file all passed while detection was completely dead in production for two releases. Nothing that inspects the file rather than running it can catch a throw at script level.

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
- **`init()` has to be the last thing in `formguard.js`.** `var` hoists the name but not the value, and the asset is served deferred, so it executes at readyState `interactive` and runs `init()` synchronously. Called above a `var` it depends on, it throws on `undefined` before attaching the submit listener: protection silently off, dashboard reporting "haven't detected your contact form yet", and a console error as the only clue. This has now happened twice, with `HONEYPOT_NAME` and `GESTURE_EVENTS`.
