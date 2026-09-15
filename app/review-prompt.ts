/**
 * App Bridge's Reviews API, which opens Shopify's own review modal over the
 * app inside the admin.
 *
 * The API shipped after @shopify/app-bridge-types@0.7.0, the version this app
 * is pinned to, so `reviews` exists on the CDN-loaded `shopify` global at
 * runtime but not in the installed typings. Declared narrowly here rather than
 * bumping App Bridge for one method.
 */
export interface ReviewRequestResponse {
  success: boolean;
  code: string;
  message: string;
}

interface ReviewsApi {
  request: () => Promise<ReviewRequestResponse>;
}

// Shopify's own floor is a 60 day cooldown and three modals per year. Asking at
// most once a quarter stays inside that with room to spare.
const REVIEW_PROMPT_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

// Outcomes that mean this shop will never be worth asking again. Every other
// code is Shopify declining for now: cooldown-period, annual-limit-reached,
// mobile-app, recently-installed, already-open, open-in-progress, cancelled.
const TERMINAL_CODES = new Set(["already-reviewed", "merchant-ineligible"]);

/**
 * Whether to ask for a review, given the `reviewPrompt` setting written by the
 * last attempt. Stored as `<code>:<timestamp>`; an absent or unparseable
 * record counts as never asked.
 */
export function reviewPromptAllowed(
  record: string | null | undefined,
  now: number,
): boolean {
  if (!record) return true;
  const separator = record.lastIndexOf(":");
  if (separator === -1) return true;
  if (TERMINAL_CODES.has(record.slice(0, separator))) return false;
  const askedAt = Number(record.slice(separator + 1));
  if (!Number.isFinite(askedAt)) return true;
  return now - askedAt > REVIEW_PROMPT_COOLDOWN_MS;
}

/**
 * Asks Shopify to show the review modal. Resolves to null when the running App
 * Bridge has no Reviews API or the call throws, so a missing method degrades to
 * "no modal" rather than breaking the dashboard.
 */
export async function requestAppReview(
  bridge: unknown,
): Promise<ReviewRequestResponse | null> {
  const reviews = (bridge as { reviews?: ReviewsApi } | null)?.reviews;
  if (!reviews || typeof reviews.request !== "function") return null;
  try {
    return await reviews.request();
  } catch {
    return null;
  }
}
