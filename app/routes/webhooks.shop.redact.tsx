import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { invalidateShopConfig } from "../shop-config.server";
import { authenticateWebhook } from "../webhook-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Fires 48 hours after uninstall, by which point the offline token is always
  // dead, so this cannot go through authenticate.webhook. See
  // webhook-auth.server.ts.
  const { shop, topic } = await authenticateWebhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Delete all data scoped to this specific shop
  await Promise.all([
    db.spamEvent.deleteMany({ where: { shop } }),
    db.keyword.deleteMany({ where: { shop } }),
    db.setting.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
  invalidateShopConfig(shop);

  return new Response();
};
