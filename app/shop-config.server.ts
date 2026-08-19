import prisma from "./db.server";

/**
 * Per-shop cache of the two values the storefront embed needs on every contact
 * page view: whether protection is on, and the keyword blocklist.
 *
 * Without this, every view of a contact page cost two queries plus a heartbeat
 * upsert, for data that changes maybe monthly. The dashboard invalidates on
 * write so a merchant's toggle takes effect immediately on this instance; the
 * TTL is the backstop that bounds staleness if the app is ever scaled past one
 * machine, where an invalidation on one instance won't reach the others.
 */
const TTL_MS = 60_000;

// Readonly because getShopConfig hands out the cached object itself rather than
// a copy: a caller that sorted or pushed to `keywords` would corrupt every later
// read for that shop until the TTL expired.
export type ShopConfig = {
  readonly enabled: boolean;
  readonly keywords: readonly string[];
};

const cache = new Map<string, { at: number; value: ShopConfig }>();

// Sweep at most once per TTL so the map can't grow unbounded as the number of
// shops that have ever been served accumulates.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < TTL_MS) return;
  lastSweep = now;
  for (const [shop, entry] of cache) {
    if (now - entry.at >= TTL_MS) cache.delete(shop);
  }
}

export async function getShopConfig(shop: string): Promise<ShopConfig> {
  const now = Date.now();
  const hit = cache.get(shop);
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const [enabledSetting, keywords] = await Promise.all([
    prisma.setting.findUnique({
      where: { shop_key: { shop, key: "enabled" } },
    }),
    prisma.keyword.findMany({ where: { shop }, select: { word: true } }),
  ]);

  const value: ShopConfig = {
    enabled: !enabledSetting || enabledSetting.value !== "false",
    keywords: keywords.map((k) => k.word),
  };

  cache.set(shop, { at: now, value });
  sweep(now);
  return value;
}

export function invalidateShopConfig(shop: string) {
  cache.delete(shop);
}
