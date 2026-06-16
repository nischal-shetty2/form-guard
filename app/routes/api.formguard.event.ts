import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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
  lastPrune = now;
  try {
    await prisma.spamEvent.deleteMany({
      where: { createdAt: { lt: new Date(now - RETENTION_MS) } },
    });
  } catch {
    // Best-effort cleanup; never block an event on a failed prune.
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  if (!shop) {
    return Response.json({ success: false });
  }

  if (isRateLimited(shop)) {
    return Response.json({ success: false }, { status: 429 });
  }

  const isSpam = url.searchParams.get("isSpam") === "1";
  const rawReason = url.searchParams.get("reason") || "unknown";
  const reason = rawReason.slice(0, 200);

  const validReasons = ["honeypot", "time", "valid", "unknown"];
  if (!validReasons.includes(reason) && !reason.startsWith("keyword:")) {
    return Response.json({ success: false });
  }

  await prisma.spamEvent.create({
    data: { shop, isSpam, reason },
  });

  void pruneOldEvents(Date.now());

  return Response.json({ success: true });
};
