import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Delete all data scoped to this specific shop
  await db.spamEvent.deleteMany({ where: { shop } });
  await db.keyword.deleteMany({ where: { shop } });
  await db.setting.deleteMany({ where: { shop } });

  return new Response();
};
