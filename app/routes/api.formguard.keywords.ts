import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Record (at most once per hour per shop) that the storefront embed loaded and
// found a contact form, so the admin dashboard can show whether protection is
// actually live rather than merely toggled on. This endpoint is only called by
// the embed once a contact form is detected on the page.
const SEEN_INTERVAL_MS = 60 * 60 * 1000;
const lastSeenWrites = new Map<string, number>();
async function recordSeen(shop: string) {
  const now = Date.now();
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

  const [enabledSetting, keywords] = await Promise.all([
    prisma.setting.findUnique({
      where: { shop_key: { shop, key: "enabled" } },
    }),
    prisma.keyword.findMany({ where: { shop } }),
  ]);

  if (enabledSetting && enabledSetting.value === "false") {
    return Response.json({ enabled: false, keywords: [] });
  }

  return Response.json({
    enabled: true,
    keywords: keywords.map((k) => k.word),
  });
};
