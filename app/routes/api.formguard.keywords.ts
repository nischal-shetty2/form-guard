import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  if (!shop) {
    return Response.json({ enabled: true, keywords: [] });
  }

  const enabledSetting = await prisma.setting.findUnique({
    where: { shop_key: { shop, key: "enabled" } },
  });

  if (enabledSetting && enabledSetting.value === "false") {
    return Response.json({ enabled: false, keywords: [] });
  }

  const keywords = await prisma.keyword.findMany({ where: { shop } });
  return Response.json({
    enabled: true,
    keywords: keywords.map((k) => k.word),
  });
};
