import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { captureShopContact } from "../shop-contact.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // Deliberately not awaited. This is the only place a live admin client exists
  // for an arbitrary shop, so it is where the contact details get recorded, but
  // the dashboard should not wait on a once-a-month bookkeeping read.
  // captureShopContact swallows its own errors, so nothing here can reject.
  void captureShopContact(session.shop, admin.graphql);

  return null;
};

export default function App() {
  const navigate = useNavigate();

  // AppProvider's own embedded mode injects app-bridge.js from the body, which
  // root.tsx already loads in <head> where Shopify wants it. Mounting with
  // embedded={false} keeps polaris.js without loading App Bridge twice, so this
  // reproduces the one behaviour that came with it: routing s-link and
  // s-app-nav clicks through the client-side router.
  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const href = (event.target as HTMLElement | null)?.getAttribute("href");
      if (href) navigate(href);
    };
    document.addEventListener("shopify:navigate", handleNavigate);
    return () => document.removeEventListener("shopify:navigate", handleNavigate);
  }, [navigate]);

  return (
    <AppProvider embedded={false}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
