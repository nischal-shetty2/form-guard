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

// The classic delivery headers, and the unprefixed set the events delivery
// format uses. Both have to be accepted, and both sign the body the same way.
const CLASSIC = {
  hmac: "X-Shopify-Hmac-Sha256",
  shop: "X-Shopify-Shop-Domain",
  topic: "X-Shopify-Topic",
};
const EVENTS = {
  hmac: "shopify-hmac-sha256",
  shop: "shopify-shop-domain",
  topic: "shopify-topic",
};

function sign(body, secret = SECRET) {
  return createHmac("sha256", secret).update(body).digest("base64");
}

function webhookRequest({
  body = JSON.stringify({ shop_domain: SHOP }),
  signature,
  shop = SHOP,
  topic = TOPIC,
  method = "POST",
  names = CLASSIC,
  omit = [],
} = {}) {
  const headers = new Headers();
  const set = (key, value) => {
    if (!omit.includes(key) && value !== undefined) headers.set(names[key], value);
  };
  set("hmac", signature ?? sign(body));
  set("shop", shop);
  set("topic", topic);
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

// Shopify requires 401, not 400, when a compliance webhook arrives without a
// usable HMAC header. App review posts exactly this request.
await expectStatus(
  "an unsigned request is rejected with 401",
  webhookRequest({ body, omit: ["hmac"] }),
  401,
);

await expectStatus(
  "a request with no shop domain is rejected",
  webhookRequest({ body, omit: ["shop"] }),
  400,
);

await expectStatus(
  "a request with no topic is rejected",
  webhookRequest({ body, omit: ["topic"] }),
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

// shopify-api accepts either header family, so this module has to as well.
await expectAccepted(
  "a webhook using the events header names is accepted",
  webhookRequest({ body, names: EVENTS }),
  { shop: SHOP, topic: TOPIC, payload: { shop_domain: SHOP, foo: "bar" } },
);

await expectStatus(
  "a tampered events-format webhook is rejected",
  webhookRequest({
    body: body.replace("bar", "baz"),
    signature: sign(body),
    names: EVENTS,
  }),
  401,
);

if (failures > 0) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall webhook verification checks passed");
