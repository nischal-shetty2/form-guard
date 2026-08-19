import { useState, useEffect, useRef } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { invalidateShopConfig } from "../shop-config.server";

// Every keyword is shipped to the storefront on every contact page view, so the
// list needs a ceiling. 200 is far above any real blocklist and keeps the
// payload small.
const KEYWORD_LIMIT = 200;
const KEYWORD_MIN_LENGTH = 2;
const KEYWORD_MAX_LENGTH = 100;
const RECENT_BLOCKS_LIMIT = 8;

const KEYWORD_PREFIX = "keyword:";

// Merchant-facing names for the internal reason codes. "Honeypot" and "time"
// mean nothing to someone who hasn't read the source.
const REASON_LABELS: Record<string, string> = {
  honeypot: "Bot trap",
  time: "Submitted too fast",
  nointeraction: "No human interaction",
  keyword: "Blocked keyword",
  unknown: "Other",
};

function reasonLabel(reason: string) {
  return REASON_LABELS[reason] ?? "Other";
}

function relativeTime(from: Date, now: number) {
  const elapsed = now - from.getTime();
  // An unparseable date gives NaN, and Math.max(0, NaN) is NaN rather than 0,
  // so without this guard every comparison below is false and the merchant
  // reads "NaNd ago".
  if (!Number.isFinite(elapsed)) return "";
  const minutes = Math.floor(Math.max(0, elapsed) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    enabledSetting,
    lastSeenSetting,
    keywords,
    counts,
    spamReasons,
    recentBlocks,
  ] = await Promise.all([
    prisma.setting.findUnique({
      where: { shop_key: { shop, key: "enabled" } },
    }),
    prisma.setting.findUnique({
      where: { shop_key: { shop, key: "lastSeen" } },
    }),
    prisma.keyword.findMany({
      where: { shop },
      orderBy: { id: "desc" },
    }),
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
    prisma.spamEvent.findMany({
      where: { shop, isSpam: true, createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: RECENT_BLOCKS_LIMIT,
      select: { id: true, reason: true, createdAt: true },
    }),
  ]);

  const enabled = !enabledSetting || enabledSetting.value !== "false";
  const spamCount = counts.find((c) => c.isSpam)?._count ?? 0;
  const validCount = counts.find((c) => !c.isSpam)?._count ?? 0;
  const totalCount = spamCount + validCount;
  const blockRate =
    totalCount > 0 ? Math.round((spamCount / totalCount) * 100) : 0;

  // The embed pings the keywords endpoint whenever it finds a contact form, so
  // a recent heartbeat means protection is genuinely live on the storefront —
  // not just that the toggle is on. Recent form events are an equally strong
  // signal (they only exist if the embed ran), so either confirms detection.
  const SEEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const lastSeenMs = lastSeenSetting ? Number(lastSeenSetting.value) : 0;
  const heartbeatRecent =
    Number.isFinite(lastSeenMs) &&
    lastSeenMs > 0 &&
    Date.now() - lastSeenMs < SEEN_WINDOW_MS;
  const detected = heartbeatRecent || totalCount > 0;

  const reasonCounts: Record<string, number> = {};
  const keywordCounts: Record<string, number> = {};
  for (const row of spamReasons) {
    if (row.reason.startsWith(KEYWORD_PREFIX)) {
      reasonCounts.keyword = (reasonCounts.keyword || 0) + row._count;
      const word = row.reason.slice(KEYWORD_PREFIX.length);
      if (word) keywordCounts[word] = (keywordCounts[word] || 0) + row._count;
    } else {
      reasonCounts[row.reason] = (reasonCounts[row.reason] || 0) + row._count;
    }
  }

  const topKeywords = Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  // The "when" labels are rendered from serverNow rather than from each
  // client's own clock, so a merchant whose machine is hours off still reads
  // the same thing the server would have written, and SSR and hydration agree.
  const serverNow = Date.now();
  const recentEvents = recentBlocks.map((event) => {
    const isKeyword = event.reason.startsWith(KEYWORD_PREFIX);
    return {
      id: event.id,
      label: isKeyword ? REASON_LABELS.keyword : reasonLabel(event.reason),
      detail: isKeyword ? event.reason.slice(KEYWORD_PREFIX.length) : "",
      at: event.createdAt.toISOString(),
    };
  });

  return {
    enabled,
    detected,
    keywords,
    keywordLimit: KEYWORD_LIMIT,
    spamCount,
    validCount,
    blockRate,
    reasonCounts,
    topKeywords,
    recentEvents,
    serverNow,
  };
};

// Thrown inside the addKeyword transaction to roll it back when the shop is at
// the cap. A sentinel class keeps that case distinguishable from a real database
// error in the catch below.
class KeywordLimitReached extends Error {}

type ActionResult = {
  ok: boolean;
  intent: string;
  message?: string;
  error?: string;
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  switch (intent) {
    case "toggle": {
      const currentEnabled = formData.get("enabled") === "true";
      const next = currentEnabled ? "false" : "true";
      await prisma.setting.upsert({
        where: { shop_key: { shop, key: "enabled" } },
        update: { value: next },
        create: { shop, key: "enabled", value: next },
      });
      invalidateShopConfig(shop);
      return {
        ok: true,
        intent,
        message: next === "true" ? "Protection enabled" : "Protection disabled",
      };
    }
    case "addKeyword": {
      const word = String(formData.get("word") || "")
        .trim()
        .toLowerCase()
        .slice(0, KEYWORD_MAX_LENGTH);

      if (word.length < KEYWORD_MIN_LENGTH) {
        return {
          ok: false,
          intent,
          error: `Keyword must be at least ${KEYWORD_MIN_LENGTH} characters.`,
        };
      }

      const duplicateError = `"${word}" is already in your blocked list.`;
      const limitError = `You've reached the limit of ${KEYWORD_LIMIT} keywords. Remove one to add another.`;

      // Duplicates are checked up front only so the common case gets this
      // message without relying on the unique index to raise.
      const existing = await prisma.keyword.findUnique({
        where: { shop_word: { shop, word } },
        select: { id: true },
      });
      if (existing) {
        return { ok: false, intent, error: duplicateError };
      }

      try {
        await prisma.$transaction(async (tx) => {
          // Counted inside the transaction: two tabs adding at once could both
          // read 199 outside one and push the list past the cap.
          const count = await tx.keyword.count({ where: { shop } });
          if (count >= KEYWORD_LIMIT) throw new KeywordLimitReached();
          await tx.keyword.create({ data: { shop, word } });
        });
      } catch (error) {
        if (error instanceof KeywordLimitReached) {
          return { ok: false, intent, error: limitError };
        }
        // The same word can land from another tab between the check above and
        // this write. That is the unique index doing its job, not a failure
        // worth a 500.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return { ok: false, intent, error: duplicateError };
        }
        throw error;
      }

      invalidateShopConfig(shop);
      return { ok: true, intent, message: `"${word}" blocked` };
    }
    case "removeKeyword": {
      const id = Number(formData.get("id"));
      if (!Number.isInteger(id) || id <= 0) {
        return { ok: false, intent, error: "That keyword no longer exists." };
      }
      const { count } = await prisma.keyword.deleteMany({
        where: { id, shop },
      });
      if (count === 0) {
        return { ok: false, intent, error: "That keyword no longer exists." };
      }
      invalidateShopConfig(shop);
      return { ok: true, intent, message: "Keyword removed" };
    }
    default:
      return { ok: false, intent, error: "Unknown action." };
  }
};

const TICK_MS = 60_000;

/**
 * One timer for the whole page, and a "now" every consumer shares.
 *
 * Two things it deliberately does not do. It never reads the browser clock as
 * an absolute: that clock can be minutes or days off, and recomputing a
 * correct "10m ago" against a laptop running three hours behind turns it into
 * "just now". Only the delta between two Date.now() readings is trusted, added
 * to the server's clock. And it does not tick labels in isolation: the rows
 * behind them are fetched once, so a label counting up to "9h ago" over frozen
 * data reads as "nothing was blocked in 9 hours" when it means "nothing has
 * been fetched in 9 hours". Revalidating on the same beat moves both.
 */
function usePageClock(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  const { revalidate } = useRevalidator();

  // revalidate is a new function each time the revalidator changes state, so
  // read it through a ref rather than letting an in-flight load restart the
  // interval it was started by.
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;

  useEffect(() => {
    // Re-anchored to each batch of loader data. The gap includes the request's
    // own latency, which only ever makes a label round down.
    const skew = serverNow - Date.now();
    const id = setInterval(() => {
      setNow(Date.now() + skew);
      // A hidden tab has nobody reading it, and its timers are throttled
      // anyway; the visibility listener below catches it up on return.
      if (document.visibilityState === "visible") revalidateRef.current();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [serverNow]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidateRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A revalidation lands a newer reading of the server's clock than the last
  // tick has, so it wins until the next one.
  return Math.max(now, serverNow);
}

/**
 * No state and no timer of its own: the label is a pure function of the row's
 * timestamp and the page clock. The clock starts at the loader's `serverNow`,
 * so the first client render reproduces the server's markup exactly and
 * hydration stays clean.
 */
function RelativeTime({ iso, now }: { iso: string; now: number }) {
  return <time dateTime={iso}>{relativeTime(new Date(iso), now)}</time>;
}

export default function Index() {
  const {
    enabled,
    detected,
    keywords,
    keywordLimit,
    spamCount,
    validCount,
    blockRate,
    reasonCounts,
    topKeywords,
    recentEvents,
    serverNow,
  } = useLoaderData<typeof loader>();
  const now = usePageClock(serverNow);
  const fetcher = useFetcher<ActionResult>();
  const shopify = useAppBridge();
  const keywordInputRef = useRef<HTMLInputElement | null>(null);
  const [keywordError, setKeywordError] = useState("");

  const pendingIntent = fetcher.formData?.get("intent");
  const pendingRemoveId =
    pendingIntent === "removeKeyword" ? fetcher.formData?.get("id") : null;
  const busy = fetcher.state !== "idle";

  // A removable chip hides itself the moment its remove button is pressed. If
  // the server then rejects the removal the keyword is still on the list, so
  // bumping this remounts the chips rather than leaving an invisible one behind.
  const [chipGeneration, setChipGeneration] = useState(0);

  // The toggle is the slowest-feeling control because the label only changes
  // once the loader revalidates, so show the target state while it's in flight.
  const shownEnabled = pendingIntent === "toggle" ? !enabled : enabled;

  useEffect(() => {
    const result = fetcher.data;
    if (!result) return;

    if (result.ok) {
      if (result.intent === "addKeyword" && keywordInputRef.current) {
        keywordInputRef.current.value = "";
      }
      setKeywordError("");
      if (result.message) shopify.toast.show(result.message);
      return;
    }

    // Server-side rejections (duplicate, limit reached, stale id) surface where
    // the merchant can act on them rather than reporting a phantom success.
    if (result.intent === "addKeyword") {
      setKeywordError(result.error || "Could not add that keyword.");
      return;
    }
    if (result.intent === "removeKeyword") {
      setChipGeneration((n) => n + 1);
    }
    if (result.error) {
      shopify.toast.show(result.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleToggle = () => {
    fetcher.submit(
      { intent: "toggle", enabled: String(enabled) },
      { method: "POST" },
    );
  };

  const handleAddKeyword = () => {
    const word = (keywordInputRef.current?.value ?? "").trim().toLowerCase();
    if (!word) return;
    if (word.length < KEYWORD_MIN_LENGTH) {
      setKeywordError(
        `Keyword must be at least ${KEYWORD_MIN_LENGTH} characters.`,
      );
      return;
    }
    if (keywords.some((k) => k.word === word)) {
      setKeywordError(`"${word}" is already in your blocked list.`);
      return;
    }
    if (keywords.length >= keywordLimit) {
      setKeywordError(
        `You've reached the limit of ${keywordLimit} keywords. Remove one to add another.`,
      );
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

  // s-text-field doesn't accept an onKeyDown prop, so wire up Enter-to-submit
  // with a native listener. keydown events bubble out of the component's shadow
  // DOM to the host element, where we can catch them.
  const submitRef = useRef(handleAddKeyword);
  submitRef.current = handleAddKeyword;
  useEffect(() => {
    const el = keywordInputRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, []);

  const statusTone = !shownEnabled
    ? "critical"
    : detected
      ? "success"
      : "caution";
  const statusText = !shownEnabled
    ? "Disabled"
    : detected
      ? "Active"
      : "Enabled";

  return (
    <s-page heading="FormGuard">
      <s-button
        slot="primary-action"
        onClick={handleToggle}
        variant="primary"
        tone={shownEnabled ? "critical" : undefined}
        loading={pendingIntent === "toggle" || undefined}
      >
        {shownEnabled ? "Disable Protection" : "Enable Protection"}
      </s-button>

      <s-section heading="Spam Protection">
        <s-paragraph>
          FormGuard protects your contact form with 3 layers: honeypot field,
          time-based detection, and keyword filtering.
        </s-paragraph>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-badge tone={statusTone}>{statusText}</s-badge>
          {shownEnabled && detected && (
            <s-text color="subdued">
              FormGuard is live and protecting your contact form.
            </s-text>
          )}
        </s-stack>
        {shownEnabled && !detected && (
          <s-banner
            tone="warning"
            heading="We haven't detected your contact form yet"
          >
            <s-paragraph>
              If you just installed FormGuard or your contact page gets little
              traffic, this is normal. Otherwise, open the theme editor and make
              sure the FormGuard app embed is turned on.
            </s-paragraph>
          </s-banner>
        )}
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
              /* Safari ignores list-style:none on summary and draws its own
                 marker next to the custom arrow. */
              summary::-webkit-details-marker { display: none; }
            `}</style>
          </summary>
          <div style={{ marginTop: "12px" }}>
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <strong>Step 1:</strong> Click the{" "}
                <strong>
                  {shownEnabled ? "Disable" : "Enable"} Protection
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
                <s-text color="subdued">
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
            <s-stack direction="block" gap="small-300">
              <s-text>Spam Blocked</s-text>
              <s-heading>
                <span style={{ fontSize: "28px" }}>{spamCount}</span>
              </s-heading>
              {spamCount + validCount > 0 && (
                <s-text color="subdued">
                  {blockRate}% of all submissions
                </s-text>
              )}
              {Object.keys(reasonCounts).length > 0 && (
                <s-stack direction="inline" gap="small-300">
                  {Object.entries(reasonCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => (
                      <s-badge key={reason} tone="neutral">
                        {reasonLabel(reason)}: {count}
                      </s-badge>
                    ))}
                </s-stack>
              )}
            </s-stack>
          </s-box>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small-300">
              <s-text>Valid Submissions</s-text>
              <s-heading>
                <span style={{ fontSize: "28px" }}>{validCount}</span>
              </s-heading>
            </s-stack>
          </s-box>
          {topKeywords.length > 0 && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="block" gap="small-300">
                <s-text>Top Blocked Keywords</s-text>
                {topKeywords.map((k) => (
                  <s-stack
                    key={k.word}
                    direction="inline"
                    gap="base"
                    justifyContent="space-between"
                  >
                    <s-text>{k.word}</s-text>
                    <s-text>
                      <strong>{k.count}</strong>
                    </s-text>
                  </s-stack>
                ))}
              </s-stack>
            </s-box>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Blocked Keywords">
        <s-paragraph>
          Messages containing these words, phrases, or email addresses will be
          blocked as spam.
        </s-paragraph>
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-text-field
            ref={keywordInputRef as never}
            label="Add a blocked keyword"
            placeholder="e.g. buy now, free offer, spam@example.com"
            maxLength={KEYWORD_MAX_LENGTH}
            details={`${keywords.length} of ${keywordLimit} used`}
            error={keywordError || undefined}
            onInput={() => {
              if (keywordError) setKeywordError("");
            }}
          />
          <s-button
            onClick={handleAddKeyword}
            loading={pendingIntent === "addKeyword" || undefined}
          >
            Add
          </s-button>
        </s-stack>
        {keywords.length === 0 ? (
          <div style={{ marginTop: "12px" }}>
            <s-paragraph>
              <s-text color="subdued">
                No blocked keywords yet. Add words, phrases, or email addresses
                above to start filtering spam.
              </s-text>
            </s-paragraph>
          </div>
        ) : (
          <div style={{ marginTop: "12px" }}>
            <s-stack direction="inline" gap="small-300">
              {keywords.map((keyword) => (
                <s-clickable-chip
                  key={`${keyword.id}-${chipGeneration}`}
                  removable
                  disabled={
                    busy && pendingRemoveId === String(keyword.id)
                      ? true
                      : undefined
                  }
                  // React 18 drops function props it doesn't recognise as one
                  // of its own synthetic events, and "remove" isn't one, so an
                  // onRemove prop here would silently never fire and the
                  // keyword would be undeletable. Assign the element's own
                  // handler property instead. Setting both would double-fire
                  // under React 19.
                  ref={(el) => {
                    if (el) el.onremove = () => handleRemoveKeyword(keyword.id);
                  }}
                >
                  {keyword.word}
                </s-clickable-chip>
              ))}
            </s-stack>
          </div>
        )}
      </s-section>

      <s-section heading="Recent Blocks">
        {recentEvents.length === 0 ? (
          <s-paragraph>
            <s-text color="subdued">
              Nothing blocked in the last 7 days. Blocked submissions will show
              up here with the reason they were caught.
            </s-text>
          </s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Reason</s-table-header>
              <s-table-header listSlot="secondary">Match</s-table-header>
              <s-table-header listSlot="kicker">When</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recentEvents.map((event) => (
                <s-table-row key={event.id}>
                  <s-table-cell>{event.label}</s-table-cell>
                  <s-table-cell>
                    {event.detail ? (
                      event.detail
                    ) : (
                      <s-text color="subdued">—</s-text>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">
                      <RelativeTime iso={event.at} now={now} />
                    </s-text>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
