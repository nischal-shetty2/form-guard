import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { invalidateShopConfig } from "../shop-config.server";
import { authenticateWebhook } from "../webhook-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Deliberately not authenticate.webhook: that refreshes the shop's offline
  // token first, which cannot succeed once the app is uninstalled, and the
  // resulting 500 means none of the cleanup below ever runs. See
  // webhook-auth.server.ts.
  const { shop, topic } = await authenticateWebhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already
  // been uninstalled, so every delete here has to tolerate having already run.
  await Promise.all([
    db.spamEvent.deleteMany({ where: { shop } }),
    db.keyword.deleteMany({ where: { shop } }),
    db.setting.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  // The storefront embed is served from a cached copy of this shop's settings,
  // so without this the blocklist of an uninstalled shop stays live until the
  // TTL expires.
  invalidateShopConfig(shop);

  return new Response();
};
