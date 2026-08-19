import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopConfig } from "../shop-config.server";

// Record (at most once per hour per shop) that the storefront embed loaded and
// found a contact form, so the admin dashboard can show whether protection is
// actually live rather than merely toggled on. This endpoint is only called by
// the embed once a contact form is detected on the page.
const SEEN_INTERVAL_MS = 60 * 60 * 1000;
const lastSeenWrites = new Map<string, number>();

// Sweep at most once per interval so the map can't grow unbounded as the number
// of shops that have ever served a contact page accumulates.
let lastSweep = 0;
function sweepSeenWrites(now: number) {
  if (now - lastSweep < SEEN_INTERVAL_MS) return;
  lastSweep = now;
  for (const [shop, at] of lastSeenWrites) {
    if (now - at >= SEEN_INTERVAL_MS) lastSeenWrites.delete(shop);
  }
}

async function recordSeen(shop: string) {
  const now = Date.now();
  sweepSeenWrites(now);
  if (now - (lastSeenWrites.get(shop) || 0) < SEEN_INTERVAL_MS) return;
  lastSeenWrites.set(shop, now);
  try {
    await prisma.setting.upsert({
      where: { shop_key: { shop, key: "lastSeen" } },
      update: { value: String(now) },
      create: { shop, key: "lastSeen", value: String(now) },
    });
  } catch {
    // Best-effort heartbeat; never block the storefront on a failed write.
    // Clear the throttle so the next request retries instead of waiting an hour.
    lastSeenWrites.delete(shop);
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  if (!shop) {
    return Response.json({ enabled: true, keywords: [] });
  }

  void recordSeen(shop);

  const config = await getShopConfig(shop);

  if (!config.enabled) {
    return Response.json({ enabled: false, keywords: [] });
  }

  return Response.json({
    enabled: true,
    keywords: config.keywords,
  });
};
