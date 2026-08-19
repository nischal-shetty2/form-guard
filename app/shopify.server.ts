import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  type Session,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const prismaSessionStorage = new PrismaSessionStorage(prisma);

// The Prisma storage package currently resolves against a different Shopify API
// major, so wrap it in a structural adapter to keep the app package typed.
const sessionStorageAdapter = {
  storeSession: async (session: Session) =>
    prismaSessionStorage.storeSession(session as never),
  loadSession: async (id: string) =>
    (await prismaSessionStorage.loadSession(id)) as Session | undefined,
  deleteSession: async (id: string) => prismaSessionStorage.deleteSession(id),
  deleteSessions: async (ids: string[]) =>
    prismaSessionStorage.deleteSessions(ids),
  findSessionsByShop: async (shop: string) =>
    (await prismaSessionStorage.findSessionsByShop(shop)) as Session[],
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  // "".split(",") is [""], not [], which reads as a single empty scope.
  scopes: process.env.SCOPES?.split(",").filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: sessionStorageAdapter,
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
// Kept in step with the api_version in shopify.app.toml and the theme
// extension, so webhook payloads and the client target the same version.
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
