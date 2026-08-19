import { ApiVersion } from "@shopify/shopify-app-react-router/server";

/**
 * The one place the Admin API version is written in TypeScript. It has to stay
 * in step with `api_version` in shopify.app.toml and in
 * extensions/formguard-block/shopify.extension.toml, which are TOML and cannot
 * import this. A bump means editing three files -- it used to be five, and the
 * codegen config was the one that got missed.
 */
export const API_VERSION = ApiVersion.April26;
