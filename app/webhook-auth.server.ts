import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a Shopify webhook signature without touching the session store.
 *
 * `authenticate.webhook()` looks the shop's offline session up and, with
 * `expiringOfflineAccessTokens` on, refreshes an expired access token before it
 * returns. On `app/uninstalled` and `shop/redact` the app is already gone, so
 * Shopify answers that refresh with `401 invalid_request` and the library maps
 * it to a thrown 500. The handler body never runs: Shopify records the delivery
 * as failed, every retry fails identically, and the shop's rows are never
 * deleted. It only bites shops whose token had already expired, which is why
 * some uninstalls clean up and others error forever.
 *
 * The handlers that hit this only need the shop and the topic, so the session is
 * dead weight on a path that runs precisely when the session cannot be renewed.
 * A route that needs an `admin` client still wants `authenticate.webhook`.
 */

export type WebhookContext = {
  shop: string;
  topic: string;
  payload: unknown;
};

// Shopify's own format for a shop domain. The value reaches Prisma as the
// filter of a `deleteMany`, so it is worth pinning even though a valid HMAC
// already proves Shopify sent it.
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function reject(status: number, statusText: string): never {
  throw new Response(undefined, { status, statusText });
}

export async function authenticateWebhook(
  request: Request,
): Promise<WebhookContext> {
  if (request.method !== "POST") {
    reject(405, "Method Not Allowed");
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    // Not a 401: without the secret every delivery would fail signature
    // verification, which reads like Shopify sending bad signatures rather than
    // like a missing environment variable.
    throw new Error("SHOPIFY_API_SECRET is not set, cannot verify webhooks");
  }

  const signature = request.headers.get("X-Shopify-Hmac-Sha256");
  const shop = request.headers.get("X-Shopify-Shop-Domain");
  const topic = request.headers.get("X-Shopify-Topic");
  if (!signature || !shop || !topic) {
    reject(400, "Bad Request");
  }

  // The signature covers the bytes on the wire, so hash those rather than
  // re-encoding a decoded string.
  const body = Buffer.from(await request.arrayBuffer());
  const expected = createHmac("sha256", secret).update(body).digest();

  // Buffer.from drops invalid base64 characters instead of throwing, so a
  // malformed header decodes to something short rather than failing here.
  // timingSafeEqual throws on a length mismatch, hence the length check first.
  const received = Buffer.from(signature, "base64");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    reject(401, "Unauthorized");
  }

  if (!SHOP_DOMAIN.test(shop)) {
    reject(400, "Bad Request");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    reject(400, "Bad Request");
  }

  return { shop, topic, payload };
}
