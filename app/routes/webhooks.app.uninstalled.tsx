import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { invalidateShopConfig } from "../shop-config.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await Promise.all([
    db.spamEvent.deleteMany({ where: { shop } }),
    db.keyword.deleteMany({ where: { shop } }),
    db.setting.deleteMany({ where: { shop } }),
  ]);

  // The storefront embed is served from a cached copy of this shop's settings,
  // so without this the blocklist of an uninstalled shop stays live until the
  // TTL expires.
  invalidateShopConfig(shop);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
