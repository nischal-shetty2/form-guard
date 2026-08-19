import type { LoaderFunctionArgs } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
  useRouteLoaderData,
} from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const isAdminRoute = new URL(request.url).pathname.startsWith("/app");
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    isAdminRoute,
  };
};

// Layout wraps both the app and the error boundary, so a thrown error still
// renders inside a complete document instead of React Router's bare fallback.
// It reads the loader data defensively because that loader may not have run.
export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const apiKey = data?.apiKey ?? "";
  const isAdminRoute = data?.isAdminRoute ?? false;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {isAdminRoute && (
          <>
            {/* App Bridge has to load from the CDN in <head> for embedded
                routes. AppProvider in app.tsx is therefore mounted with
                embedded={false} so it only injects polaris.js and doesn't
                load this same script a second time from the body. */}
            <meta name="shopify-api-key" content={apiKey} />
            <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
            <link rel="preconnect" href="https://cdn.shopify.com/" />
            <link
              rel="stylesheet"
              href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
            />
          </>
        )}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();

  // Only route error responses carry a message that's safe to render. Anything
  // else could be an exception with internal detail in it.
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const title = isRouteErrorResponse(error)
    ? error.statusText || "Something went wrong"
    : "Something went wrong";
  const detail = isRouteErrorResponse(error)
    ? typeof error.data === "string"
      ? error.data
      : ""
    : "";

  return (
    <main
      style={{
        maxWidth: "480px",
        margin: "0 auto",
        padding: "4rem 1.5rem",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.6,
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>
        {status} — {title}
      </h1>
      {detail && <p style={{ color: "#555" }}>{detail}</p>}
      <p style={{ color: "#555" }}>
        Try reloading the page. If it keeps happening, email{" "}
        <a href="mailto:shettynick2@gmail.com">shettynick2@gmail.com</a>.
      </p>
      <p>
        <a href="/">Back to home</a>
      </p>
    </main>
  );
}
