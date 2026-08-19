/**
 * The shop that an app proxy request belongs to, or null if the request names
 * more than one and therefore can't be attributed to any of them.
 *
 * A valid proxy signature proves the request came through Shopify, not that a
 * single shop is named. The signature is checked over
 * `Object.fromEntries(searchParams)`, which keeps the *last* value of a repeated
 * key, while route code reads `searchParams.get()`, which returns the *first*.
 * A request carrying two `shop` params would authenticate as one shop and be
 * read as another, so refuse anything but exactly one.
 */
export function proxyShop(url: URL): string | null {
  const shops = url.searchParams.getAll("shop");
  if (shops.length !== 1) return null;
  return shops[0] || null;
}
