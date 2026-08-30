/**
 * Runs the real webhook verifier against signed and tampered requests.
 *
 * This is the one piece of the app that decides whether a POST from the open
 * internet is allowed to delete a shop's data, and it replaces a library call
 * that used to do it. Type checking and linting say nothing about whether the
 * HMAC actually has to match.
 *
 * Run with `npm run test:webhooks` (needs a Node with TypeScript type
 * stripping: 22.18+ or 23.6+, or the --experimental-strip-types flag).
 */
import { createHmac } from "node:crypto";
import { authenticateWebhook } from "../app/webhook-auth.server.ts";

const SECRET = "test-api-secret";
process.env.SHOPIFY_API_SECRET = SECRET;

const SHOP = "example-shop.myshopify.com";
const TOPIC = "app/uninstalled";

function sign(body, secret = SECRET) {
  return createHmac("sha256", secret).update(body).digest("base64");
}

function webhookRequest({
  body = JSON.stringify({ shop_domain: SHOP }),
  signature,
  shop = SHOP,
  topic = TOPIC,
  method = "POST",
  omit = [],
} = {}) {
  const headers = new Headers();
  const set = (name, value) => {
    if (!omit.includes(name) && value !== undefined) headers.set(name, value);
  };
  set("X-Shopify-Hmac-Sha256", signature ?? sign(body));
  set("X-Shopify-Shop-Domain", shop);
  set("X-Shopify-Topic", topic);
  return new Request("https://example.com/webhooks/app/uninstalled", {
    method,
    headers,
    ...(method === "POST" ? { body } : {}),
  });
}

let failures = 0;

async function expectStatus(name, request, status) {
  try {
    await authenticateWebhook(request);
    failures += 1;
    console.error(`FAIL ${name}: accepted a request that should be ${status}`);
  } catch (error) {
    if (error instanceof Response && error.status === status) {
      console.log(`ok   ${name}`);
      return;
    }
    failures += 1;
    console.error(
      `FAIL ${name}: expected ${status}, got ${
        error instanceof Response ? error.status : error
      }`,
    );
  }
}

async function expectAccepted(name, request, expected) {
  try {
    const context = await authenticateWebhook(request);
    for (const [key, value] of Object.entries(expected)) {
      const actual = JSON.stringify(context[key]);
      if (actual !== JSON.stringify(value)) {
        failures += 1;
        console.error(`FAIL ${name}: ${key} was ${actual}, expected ${JSON.stringify(value)}`);
        return;
      }
    }
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(
      `FAIL ${name}: rejected a valid webhook with ${
        error instanceof Response ? error.status : error
      }`,
    );
  }
}

const body = JSON.stringify({ shop_domain: SHOP, foo: "bar" });

await expectAccepted(
  "a correctly signed webhook is accepted",
  webhookRequest({ body }),
  { shop: SHOP, topic: TOPIC, payload: { shop_domain: SHOP, foo: "bar" } },
);

await expectStatus(
  "a body edited after signing is rejected",
  webhookRequest({ body: body.replace("bar", "baz"), signature: sign(body) }),
  401,
);

await expectStatus(
  "a signature from a different secret is rejected",
  webhookRequest({ body, signature: sign(body, "not-the-secret") }),
  401,
);

// Buffer.from(_, "base64") drops invalid characters rather than throwing, so a
// junk signature must fail the length check before timingSafeEqual sees it.
await expectStatus(
  "a signature that is not valid base64 is rejected",
  webhookRequest({ body, signature: "!!!not base64!!!" }),
  401,
);

await expectStatus(
  "an unsigned request is rejected",
  webhookRequest({ body, omit: ["X-Shopify-Hmac-Sha256"] }),
  400,
);

await expectStatus(
  "a request with no shop domain is rejected",
  webhookRequest({ body, omit: ["X-Shopify-Shop-Domain"] }),
  400,
);

await expectStatus(
  "a request with no topic is rejected",
  webhookRequest({ body, omit: ["X-Shopify-Topic"] }),
  400,
);

// A valid signature proves Shopify sent the request, not that the domain is
// shaped like a shop, and the domain is what the delete queries filter on.
await expectStatus(
  "a shop domain outside myshopify.com is rejected",
  webhookRequest({ body, shop: "evil.example.com" }),
  400,
);

await expectStatus(
  "a GET is rejected",
  webhookRequest({ method: "GET" }),
  405,
);

await expectStatus(
  "a body that is not JSON is rejected",
  webhookRequest({ body: "not json" }),
  400,
);

if (failures > 0) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall webhook verification checks passed");
