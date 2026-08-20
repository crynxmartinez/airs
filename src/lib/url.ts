/**
 * One definition of "same host".
 *
 * There were six: `safeHost` in `calibration.ts` and the analysis route, `hostOf` in
 * `export.ts`, the discover route, the export route, and `audit.ts`. They disagreed in ways
 * that matter for grouping:
 *
 *   - `safeHost` did not add a scheme, so `new URL("example.com/pricing")` threw and it
 *     returned the *whole string* as the host. `hostOf` prepended `https://` and returned
 *     `example.com`. Two rows that are the same business, grouped apart.
 *   - Failure fell back to the raw url in four copies and to `""` in one, so a malformed
 *     entry either became its own phantom business or vanished, depending on which copy ran.
 *
 * Grouping citations by business is the job that cannot afford two answers — it is what a
 * prospecting grid counts and what calibration matches predictions against. Hence one
 * function, and callers that need a display fallback write `hostOf(u) || u` at the call site
 * rather than each burying a different default.
 */

/**
 * Canonical host for grouping: lowercase, `www.` stripped, scheme optional.
 *
 * Returns `""` when the input cannot be parsed as a URL. That is deliberate — an
 * unparseable string is not a business, and returning it verbatim (as most of the old copies
 * did) invented one.
 */
export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    // A dot is required. `new URL("https://garbage")` parses happily and yields the hostname
    // "garbage", so without this a stray word in a citation field becomes a business that
    // shows up in the grid with a retrieval count. Every site AIRS looks at is a public one,
    // and public hosts have a registrable suffix.
    return host.includes(".") ? host : "";
  } catch {
    return "";
  }
}

/** Same host? Convenience for the comparison this module exists to make consistent. */
export function sameHost(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = hostOf(a);
  return left !== "" && left === hostOf(b);
}

/** A URL with a scheme, for fetching. Distinct from `hostOf`, which is for identity. */
export function normaliseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}
