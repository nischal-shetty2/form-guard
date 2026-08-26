import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import db from "./db.server";

// Shop details barely change, and this runs off the dashboard load, so re-read
// them monthly rather than on every app open.
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const SHOP_CONTACT_QUERY = `#graphql
  query ShopContact {
    shop {
      name
      myshopifyDomain
      email
      contactEmail
      shopOwnerName
      createdAt
      plan {
        publicDisplayName
        partnerDevelopment
      }
      shopAddress {
        countryCodeV2
      }
    }
  }`;

interface ShopContactResponse {
  data?: {
    shop?: {
      name?: string | null;
      myshopifyDomain?: string | null;
      email?: string | null;
      contactEmail?: string | null;
      shopOwnerName?: string | null;
      createdAt?: string | null;
      plan?: {
        publicDisplayName?: string | null;
        partnerDevelopment?: boolean | null;
      } | null;
      shopAddress?: { countryCodeV2?: string | null } | null;
    } | null;
  };
}

/**
 * Records who to contact at `shop`, so the install base is reachable without a
 * live access token. Offline tokens expire after an hour and their refresh
 * tokens after 90 days, which leaves a shop that never reopens the app
 * unreachable through the Admin API for good.
 *
 * Best effort by design: a failure here must not break the dashboard, so it
 * logs and returns instead of throwing.
 */
export async function captureShopContact(
  shop: string,
  graphql: AdminGraphqlClient,
): Promise<void> {
  try {
    const existing = await db.shopContact.findUnique({
      where: { shop },
      select: { updatedAt: true },
    });

    if (
      existing &&
      Date.now() - existing.updatedAt.getTime() < REFRESH_AFTER_MS
    ) {
      return;
    }

    const response = await graphql(SHOP_CONTACT_QUERY);
    const body = (await response.json()) as ShopContactResponse;
    const shopData = body.data?.shop;

    if (!shopData) {
      console.log(`captureShopContact: no shop data for ${shop}`);
      return;
    }

    const data = {
      shopName: shopData.name ?? null,
      ownerName: shopData.shopOwnerName ?? null,
      email: shopData.email ?? null,
      contactEmail: shopData.contactEmail ?? null,
      country: shopData.shopAddress?.countryCodeV2 ?? null,
      plan: shopData.plan?.publicDisplayName ?? null,
      devStore: shopData.plan?.partnerDevelopment ?? null,
      shopCreatedAt: shopData.createdAt ? new Date(shopData.createdAt) : null,
    };

    await db.shopContact.upsert({
      where: { shop },
      create: { shop, ...data },
      update: data,
    });
  } catch (error) {
    console.log(
      `captureShopContact failed for ${shop}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
