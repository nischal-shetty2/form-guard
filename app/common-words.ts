/**
 * Keywords that match ordinary customer messages rather than spam.
 *
 * The storefront matcher is word-bounded, so a one-word keyword blocks every
 * message containing that word on its own. When the word is something a real
 * customer writes, the merchant loses enquiries and sees a healthy block count,
 * which is the same silent failure the honeypot field name causes.
 *
 * One store in production blocks 95% of its contact form traffic, 53 of 56
 * submissions, on "hello" and "hi". Two more have words like "order" and "free"
 * loaded but not yet triggered.
 *
 * Only exact matches warn. "hello there" is specific enough to mean what it
 * says, so it is left alone.
 */
const COMMON_WORDS = new Set([
  // Greetings and sign-offs. Almost every real enquiry carries one.
  "hello",
  "hi",
  "hey",
  "hiya",
  "dear",
  "greetings",
  "good morning",
  "good afternoon",
  "good evening",
  "thanks",
  "thank you",
  "please",
  "regards",

  // Shopping vocabulary. Someone asking about their order writes most of these.
  "order",
  "orders",
  "buy",
  "purchase",
  "sale",
  "sales",
  "shop",
  "store",
  "price",
  "pricing",
  "cost",
  "product",
  "products",
  "item",
  "items",
  "size",
  "sizes",
  "color",
  "colour",
  "stock",
  "available",
  "availability",
  "shipping",
  "delivery",
  "postage",
  "return",
  "returns",
  "refund",
  "exchange",
  "discount",
  "gift",
  "payment",
  "invoice",
  "receipt",

  // How people phrase the question itself.
  "question",
  "help",
  "info",
  "information",
  "enquiry",
  "inquiry",
  "query",
  "quote",
  "request",
  "contact",
  "interested",
  "wondering",
  "checking",

  // Reads as a spam tell, just as common in real mail. "commission" matters for
  // the art and craft stores in the install base, where "do you take
  // commissions" is the enquiry they most want to receive.
  "commission",
  "commissions",
  "owner",
  "customer",
  "team",
  "business",
  "company",
  "service",
  "services",
  "free",
  "offer",
]);

export function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word.trim().toLowerCase());
}

/** The common words in `words`, in the order given, deduplicated. */
export function commonWordsIn(words: string[]): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const word of words) {
    const normalized = word.trim().toLowerCase();
    if (COMMON_WORDS.has(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      found.push(normalized);
    }
  }
  return found;
}
