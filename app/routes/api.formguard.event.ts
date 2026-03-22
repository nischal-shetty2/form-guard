import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Per-shop rate limiter: max 60 events per shop per minute
const EVENT_WINDOW_MS = 60_000;
const EVENT_MAX = 60;
const shopTimestamps = new Map<string, number[]>();

function isRateLimited(shop: string): boolean {
  const now = Date.now();
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

  return Response.json({ success: true });
};
