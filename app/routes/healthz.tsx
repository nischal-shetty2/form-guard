/**
 * Unauthenticated liveness probe for the Fly health check. Deliberately does not
 * touch the database: this answers "is the process serving HTTP", and a check
 * that fails on a transient SQLite lock would take the machine down with it.
 */
export const loader = () =>
  new Response("ok", {
    status: 200,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
