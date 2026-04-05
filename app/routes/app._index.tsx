import { useState, useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const enabledSetting = await prisma.setting.findUnique({
    where: { shop_key: { shop, key: "enabled" } },
  });
  const enabled = !enabledSetting || enabledSetting.value !== "false";

  const keywords = await prisma.keyword.findMany({
    where: { shop },
    orderBy: { id: "desc" },
  });

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [counts, spamReasons] = await Promise.all([
    prisma.spamEvent.groupBy({
      by: ["isSpam"],
      _count: true,
      where: { shop, createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.spamEvent.groupBy({
      by: ["reason"],
      _count: true,
      where: { shop, isSpam: true, createdAt: { gte: sevenDaysAgo } },
    }),
  ]);

  const spamCount = counts.find((c) => c.isSpam)?._count ?? 0;
  const validCount = counts.find((c) => !c.isSpam)?._count ?? 0;

  const reasonCounts: Record<string, number> = {};
  for (const row of spamReasons) {
    const label = row.reason.startsWith("keyword:") ? "keyword" : row.reason;
    reasonCounts[label] = (reasonCounts[label] || 0) + row._count;
  }

  return { enabled, keywords, spamCount, validCount, reasonCounts };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "toggle": {
      const currentEnabled = formData.get("enabled") === "true";
      await prisma.setting.upsert({
        where: { shop_key: { shop, key: "enabled" } },
        update: { value: currentEnabled ? "false" : "true" },
        create: {
          shop,
          key: "enabled",
          value: currentEnabled ? "false" : "true",
        },
      });
      break;
    }
    case "addKeyword": {
      const word = String(formData.get("word") || "")
        .trim()
        .toLowerCase()
        .slice(0, 100);
      if (word && word.length >= 2) {
        await prisma.keyword.upsert({
          where: { shop_word: { shop, word } },
          update: {},
          create: { shop, word },
        });
      }
      break;
    }
    case "removeKeyword": {
      const id = Number(formData.get("id"));
      if (id) {
        await prisma.keyword.deleteMany({ where: { id, shop } });
      }
      break;
    }
  }

  return { success: true };
};

export default function Index() {
  const { enabled, keywords, spamCount, validCount, reasonCounts } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [newKeyword, setNewKeyword] = useState("");
  const [keywordError, setKeywordError] = useState("");

  useEffect(() => {
    if (fetcher.data?.success) {
      const intent = fetcher.formData?.get("intent");
      if (intent === "toggle") {
        const wasEnabled = fetcher.formData?.get("enabled") === "true";
        shopify.toast.show(
          wasEnabled ? "Protection disabled" : "Protection enabled",
        );
      } else if (intent === "addKeyword") {
        setNewKeyword("");
        setKeywordError("");
        shopify.toast.show("Keyword added");
      } else if (intent === "removeKeyword") {
        shopify.toast.show("Keyword removed");
      }
    }
  }, [fetcher.data, fetcher.formData, shopify]);

  const handleToggle = () => {
    fetcher.submit(
      { intent: "toggle", enabled: String(enabled) },
      { method: "POST" },
    );
  };

  const handleAddKeyword = () => {
    const word = newKeyword.trim().toLowerCase();
    if (!word) return;
    if (word.length < 2) {
      setKeywordError("Keyword must be at least 2 characters.");
      return;
    }
    if (keywords.some((k) => k.word === word)) {
      setKeywordError(`"${word}" is already in your blocked list.`);
      return;
    }
    setKeywordError("");
    fetcher.submit({ intent: "addKeyword", word }, { method: "POST" });
  };

  const handleRemoveKeyword = (id: number) => {
    fetcher.submit(
      { intent: "removeKeyword", id: String(id) },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="FormGuard">
      <s-button
        slot="primary-action"
        onClick={handleToggle}
        variant={enabled ? "tertiary" : "primary"}
      >
        {enabled ? "Disable Protection" : "Enable Protection"}
      </s-button>

      <s-section heading="Spam Protection">
        <s-paragraph>
          FormGuard protects your contact form with 3 layers: honeypot field,
          time-based detection, and keyword filtering.
        </s-paragraph>
        <s-paragraph>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: enabled ? "#22c55e" : "#ef4444",
              }}
            />
            <s-text>
              <strong>{enabled ? "Active" : "Disabled"}</strong>
            </s-text>
          </span>
        </s-paragraph>
      </s-section>

      <s-section>
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 650,
              fontSize: "14px",
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                display: "inline-block",
                transition: "transform 0.2s ease",
              }}
              className="setup-arrow"
            >
              &#9654;
            </span>{" "}
            Setup Guide
            <style>{`
              details[open] .setup-arrow { transform: rotate(90deg); }
            `}</style>
          </summary>
          <div style={{ marginTop: "12px" }}>
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <strong>Step 1:</strong> Click the{" "}
                <strong>
                  {enabled ? "Disable" : "Enable"} Protection
                </strong>{" "}
                button in the top-right corner to toggle spam protection.
              </s-paragraph>
              <s-paragraph>
                <strong>Step 2:</strong> Add the FormGuard app embed to your
                theme. Open the theme editor below and ensure the FormGuard
                toggle is turned on.
              </s-paragraph>
              <div style={{ marginTop: "4px", marginBottom: "4px" }}>
                <s-button
                  onClick={() =>
                    open(
                      "shopify:admin/themes/current/editor?context=apps",
                      "_top",
                    )
                  }
                >
                  Open Theme Editor
                </s-button>
              </div>
              <s-paragraph>
                <strong>Step 3:</strong> (Optional) Add blocked keywords below
                to filter specific words, phrases, or email addresses.
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">
                  FormGuard works automatically once enabled. It adds invisible
                  protection to your contact form — no changes to your theme
                  are needed. To remove it, toggle the app embed off in the
                  theme editor.
                </s-text>
              </s-paragraph>
            </s-stack>
          </div>
        </details>
      </s-section>

      <s-section heading="Last 7 Days" slot="aside">
        <s-stack direction="block" gap="base">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-text>Spam Blocked</s-text>
              <s-heading>
                <span style={{ fontSize: "28px" }}>{spamCount}</span>
              </s-heading>
              {Object.keys(reasonCounts).length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "4px",
                  }}
                >
                  {Object.entries(reasonCounts).map(([reason, count]) => (
                    <span
                      key={reason}
                      style={{
                        fontSize: "12px",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        background:
                          "var(--p-color-bg-surface-secondary, #e4e5e7)",
                      }}
                    >
                      {reason.charAt(0).toUpperCase() + reason.slice(1)}:{" "}
                      {count}
                    </span>
                  ))}
                </div>
              )}
            </s-stack>
          </s-box>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-text>Valid Submissions</s-text>
              <s-heading>
                <span style={{ fontSize: "28px" }}>{validCount}</span>
              </s-heading>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Blocked Keywords">
        <s-paragraph>
          Messages containing these words, phrases, or email addresses will be
          blocked as spam.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="e.g. buy now, free offer, spam@example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddKeyword();
              }
            }}
            style={{
              padding: "6px 12px",
              border: "1px solid var(--p-color-border, #ccc)",
              borderRadius: "8px",
              fontSize: "14px",
              lineHeight: "20px",
              minWidth: "240px",
              outline: "none",
            }}
            onFocus={(e) =>
              (e.target.style.borderColor =
                "var(--p-color-border-interactive, #005bd3)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor =
                "var(--p-color-border, #ccc)")
            }
          />
          <s-button onClick={handleAddKeyword}>Add</s-button>
        </s-stack>
        {keywordError && (
          <div style={{ marginTop: "8px" }}>
            <s-text>
              <span style={{ color: "#d72c0d", fontSize: "13px" }}>
                {keywordError}
              </span>
            </s-text>
          </div>
        )}
        {keywords.length === 0 ? (
          <div style={{ marginTop: "12px" }}>
            <s-paragraph>
              <s-text>
                No blocked keywords yet. Add words, phrases, or email addresses
                above to start filtering spam.
              </s-text>
            </s-paragraph>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginTop: "12px",
            }}
          >
            {keywords.map((keyword) => (
              <span
                key={keyword.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 8px 4px 12px",
                  background: "var(--p-color-bg-surface-secondary, #f1f1f1)",
                  borderRadius: "16px",
                  fontSize: "13px",
                }}
              >
                {keyword.word}
                <button
                  onClick={() => handleRemoveKeyword(keyword.id)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "var(--p-color-bg-surface-tertiary, #ddd)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "none")
                  }
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 6px",
                    fontSize: "13px",
                    color: "var(--p-color-text-secondary, #666)",
                    lineHeight: 1,
                    borderRadius: "50%",
                    transition: "background 0.15s ease",
                  }}
                  aria-label={`Remove ${keyword.word}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
