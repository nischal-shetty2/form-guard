import type { ActionFunctionArgs } from "react-router";
import { authenticateWebhook } from "../webhook-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Also reaches shops that have uninstalled, so it takes the same
  // session-free path as the other compliance webhooks.
  const { shop, topic } = await authenticateWebhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // FormGuard does not store any customer personal data.
  // No data to delete.
  return new Response();
};
