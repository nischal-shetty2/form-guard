import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { proxyShop } from "../app-proxy.server";
import { getShopConfig } from "../shop-config.server";

// Per-shop rate limiter: max 60 events per shop per minute
const EVENT_WINDOW_MS = 60_000;
const EVENT_MAX = 60;
const shopTimestamps = new Map<string, number[]>();

// Sweep the rate-limit map at most once per window so it can't grow unbounded
// as the number of shops that have ever sent an event accumulates over time.
let lastSweep = 0;
function sweepRateLimiter(now: number) {
  if (now - lastSweep < EVENT_WINDOW_MS) return;
  lastSweep = now;
  for (const [shop, timestamps] of shopTimestamps) {
    const fresh = timestamps.filter((t) => now - t < EVENT_WINDOW_MS);
    if (fresh.length === 0) shopTimestamps.delete(shop);
    else shopTimestamps.set(shop, fresh);
  }
}

function isRateLimited(shop: string): boolean {
  const now = Date.now();
  sweepRateLimiter(now);

  let timestamps = shopTimestamps.get(shop) || [];
  timestamps = timestamps.filter((t) => now - t < EVENT_WINDOW_MS);

  if (timestamps.length >= EVENT_MAX) {
    shopTimestamps.set(shop, timestamps);
    return true;
  }

  timestamps.push(now);
  shopTimestamps.set(shop, timestamps);
  return false;
}

// Retention: drop spam events older than 90 days so the SQLite file stays small
// (the dashboard only ever reports the last 7 days). Time-gated so it runs at
// most once per hour per instance instead of on every event.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPrune = 0;
async function pruneOldEvents(now: number) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  // Claim the window before awaiting so concurrent events don't all start a
  // prune, then hand it back on failure so the next event retries instead of
  // waiting out the full hour.
  const previous = lastPrune;
  lastPrune = now;
  try {
    await prisma.spamEvent.deleteMany({
      where: { createdAt: { lt: new Date(now - RETENTION_MS) } },
    });
  } catch (error) {
    lastPrune = previous;
    // Best-effort cleanup; never block an event on a failed prune.
    console.error("formguard: retention prune failed", error);
  }
}

const FIXED_REASONS = ["honeypot", "time", "nointeraction", "valid", "unknown"];
const KEYWORD_PREFIX = "keyword:";

/**
 * Shopify signs whatever query params the browser sends, so a valid app proxy
 * signature proves the request came through the proxy, not that its values are
 * honest. Any storefront visitor can call this endpoint directly and, up to the
 * rate limit, inflate the counters or push arbitrary strings into the
 * dashboard's "Top Blocked Keywords" list. Keyword reasons are therefore checked
 * against the shop's actual blocklist, which is already cached for the keywords
 * endpoint so this costs no extra query in the common case.
 *
 * Returns the reason to store, or null to reject the request. A keyword that is
 * no longer on the blocklist is still recorded, but as the bare "keyword"
 * reason: the merchant may have removed the word after the storefront cached it
 * (10 minutes in sessionStorage on top of this cache's 60s), and dropping those
 * events would undercount real blocks. Either way the stored string is one of
 * ours, so nothing a visitor types reaches the dashboard.
 */
async function resolveReason(shop: string, reason: string) {
  if (FIXED_REASONS.includes(reason)) return reason;
  if (!reason.startsWith(KEYWORD_PREFIX)) return null;

  const word = reason.slice(KEYWORD_PREFIX.length);
  if (!word) return null;

  const config = await getShopConfig(shop);
  return config.keywords.includes(word) ? reason : "keyword";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = proxyShop(url);
  if (!shop) {
    return Response.json({ success: false }, { status: 400 });
  }

  if (isRateLimited(shop)) {
    return Response.json({ success: false }, { status: 429 });
  }

  const isSpam = url.searchParams.get("isSpam") === "1";
  const rawReason = url.searchParams.get("reason") || "unknown";

  const reason = await resolveReason(shop, rawReason.slice(0, 200));
  if (reason === null) {
    return Response.json({ success: false }, { status: 400 });
  }

  try {
    await prisma.spamEvent.create({
      data: { shop, isSpam, reason },
    });
  } catch (error) {
    // The storefront treats this as fire-and-forget, so a failed write should
    // not surface as a 500 in the merchant's logs for every submission. It does
    // need to be logged though: silently swallowed writes make a broken
    // database look exactly like a shop that gets no spam.
    console.error("formguard: failed to record spam event", error);
    return Response.json({ success: false }, { status: 200 });
  }

  void pruneOldEvents(Date.now());

  return Response.json({ success: true });
};
