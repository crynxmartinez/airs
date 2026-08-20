import * as cheerio from "cheerio";

export interface SearchResult {
  url: string;
  title: string;
  description: string;
}


/**
 * DuckDuckGo region codes for the `kl` parameter.
 *
 * Sending no region does not mean "everywhere" — DuckDuckGo geolocates by the
 * requesting IP. That is how an Australian evaluation returned Philippine insurance
 * brokers: the location never reached this layer, so results were localised to the
 * server. `ALL_REGIONS` is the explicit neutral value, so the region is always a
 * deliberate choice rather than an accident of where the app is hosted.
 */
export const ALL_REGIONS = "wt-wt";

const REGION_BY_NAME: Record<string, string> = {
  australia: "au-en", au: "au-en", aus: "au-en", sydney: "au-en", melbourne: "au-en",
  brisbane: "au-en", perth: "au-en", adelaide: "au-en", canberra: "au-en",
  philippines: "ph-en", ph: "ph-en", manila: "ph-en", cebu: "ph-en", davao: "ph-en",
  "united states": "us-en", usa: "us-en", us: "us-en", america: "us-en",
  "united kingdom": "uk-en", uk: "uk-en", england: "uk-en", london: "uk-en", scotland: "uk-en",
  canada: "ca-en", ca: "ca-en", toronto: "ca-en", vancouver: "ca-en",
  india: "in-en", singapore: "sg-en", malaysia: "my-en",
  "new zealand": "nz-en", nz: "nz-en", auckland: "nz-en",
  ireland: "ie-en", "south africa": "za-en",
  germany: "de-de", france: "fr-fr", spain: "es-es", italy: "it-it",
  netherlands: "nl-nl", japan: "jp-jp", korea: "kr-kr", "south korea": "kr-kr",
  china: "cn-zh", "hong kong": "hk-en", uae: "ae-en", dubai: "ae-en",
  "saudi arabia": "sa-en", brazil: "br-pt", mexico: "mx-es", argentina: "ar-es",
};

/**
 * Country-coded top-level domains. A `.com.au` asset is an unambiguous statement of
 * which market a business serves, and ignoring it was the single cheapest miss here:
 * the correct region was sitting in the URL the whole time.
 */
/**
 * Sub-national places, for the qualifiers autocomplete actually produces.
 *
 * REGION_BY_NAME above holds countries and capitals, which is right for resolving a user's
 * typed target market. It is not enough to *detect* a market mismatch: the real queries that
 * reached an Australian broker's brief set were "…in california" and "…in ontario", and
 * neither is a country or a capital.
 *
 * These also improve region resolution generally — a target location of "Texas" now resolves
 * rather than falling through to all-regions.
 */
const REGION_BY_SUBDIVISION: Record<string, string> = {
  // US states — the dominant source of geo-qualified autocomplete in English.
  alabama: "us-en", alaska: "us-en", arizona: "us-en", arkansas: "us-en",
  california: "us-en", colorado: "us-en", connecticut: "us-en", delaware: "us-en",
  florida: "us-en", georgia: "us-en", hawaii: "us-en", idaho: "us-en",
  illinois: "us-en", indiana: "us-en", iowa: "us-en", kansas: "us-en",
  kentucky: "us-en", louisiana: "us-en", maine: "us-en", maryland: "us-en",
  massachusetts: "us-en", michigan: "us-en", minnesota: "us-en", mississippi: "us-en",
  missouri: "us-en", montana: "us-en", nebraska: "us-en", nevada: "us-en",
  "new hampshire": "us-en", "new jersey": "us-en", "new mexico": "us-en",
  "new york": "us-en", "north carolina": "us-en", "north dakota": "us-en",
  ohio: "us-en", oklahoma: "us-en", oregon: "us-en", pennsylvania: "us-en",
  "rhode island": "us-en", "south carolina": "us-en", "south dakota": "us-en",
  tennessee: "us-en", texas: "us-en", utah: "us-en", vermont: "us-en",
  virginia: "us-en", washington: "us-en", wisconsin: "us-en", wyoming: "us-en",
  chicago: "us-en", houston: "us-en", "los angeles": "us-en", miami: "us-en",
  // Canadian provinces.
  ontario: "ca-en", quebec: "ca-en", alberta: "ca-en", manitoba: "ca-en",
  saskatchewan: "ca-en", "nova scotia": "ca-en", "new brunswick": "ca-en",
  "british columbia": "ca-en", calgary: "ca-en", montreal: "ca-en", ottawa: "ca-en",
  // UK nations and major cities beyond London.
  wales: "uk-en", "northern ireland": "uk-en", manchester: "uk-en",
  birmingham: "uk-en", glasgow: "uk-en", edinburgh: "uk-en", leeds: "uk-en",
  // Australian states, so a same-market qualifier is never read as a conflict.
  nsw: "au-en", "new south wales": "au-en", victoria: "au-en", queensland: "au-en",
  "western australia": "au-en", "south australia": "au-en", tasmania: "au-en",
  "gold coast": "au-en", newcastle: "au-en", wollongong: "au-en", geelong: "au-en",
  // NZ and PH regional centres.
  wellington: "nz-en", christchurch: "nz-en",
  "quezon city": "ph-en", makati: "ph-en", pasig: "ph-en", taguig: "ph-en",
};

const REGION_BY_TLD: Record<string, string> = {
  au: "au-en", ph: "ph-en", uk: "uk-en", nz: "nz-en", ca: "ca-en", ie: "ie-en",
  sg: "sg-en", my: "my-en", in: "in-en", za: "za-en", ae: "ae-en", hk: "hk-en",
  jp: "jp-jp", kr: "kr-kr", de: "de-de", fr: "fr-fr", es: "es-es", it: "it-it",
  nl: "nl-nl", br: "br-pt", mx: "mx-es", ar: "ar-es", us: "us-en",
};

/** Maps a free-text location ("Australia", "Sydney NSW") to a DuckDuckGo region. */
/** Every place name we recognise: countries and capitals, plus sub-national qualifiers. */
const PLACES: Record<string, string> = { ...REGION_BY_NAME, ...REGION_BY_SUBDIVISION };

export function regionFromLocation(location: string | undefined | null): string | undefined {
  if (!location) return undefined;
  const lower = location.toLowerCase().trim();
  if (PLACES[lower]) return PLACES[lower];
  // Longest key first, so "new zealand" is not matched by a stray "nz" substring.
  for (const key of Object.keys(PLACES).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${key}\\b`).test(lower)) return PLACES[key];
  }
  return undefined;
}

/** Infers a region from a country-coded TLD, e.g. claytoninsurancebrokers.com.au. */
export function regionFromUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
    const tld = host.split(".").pop() ?? "";
    return REGION_BY_TLD[tld];
  } catch {
    return undefined;
  }
}

/**
 * Resolves the region to search in, most to least authoritative: an explicit location,
 * then the asset's country TLD, then all regions. Never falls through to the server's
 * IP location.
 */
/** Shortest place mention worth trusting — guards against short tokens matching a country. */
const MIN_PLACE_LENGTH = 4;

/**
 * A place named in the text that belongs to a different market than the one being targeted.
 *
 * Demand discovery is locale-aware but not locale-*filtered*: seeding an Australian
 * insurance broker returned "how much do commercial insurance agents make in california"
 * and "...in ontario". Those are real queries from real people — just not from this client's
 * market, and briefing an Australian broker to publish Californian figures is worse than
 * briefing nothing.
 *
 * Bigrams are checked before unigrams so "new york" resolves as a place rather than "new"
 * doing something unhelpful, and matches shorter than MIN_PLACE_LENGTH are ignored.
 *
 * Returns null when there is no target market — with nothing to conflict with, every
 * question is in scope.
 */
/** Place names long enough to trust, longest first — the scan order for `geoConflict`. */
const PLACE_NAMES_BY_LENGTH: string[] = Object.keys(PLACES)
  .filter((name) => name.length >= MIN_PLACE_LENGTH)
  .sort((a, b) => b.length - a.length);

export function geoConflict(text: string, targetLocation?: string | null): string | null {
  const target = regionFromLocation(targetLocation);
  if (!target) return null;

  // Pad so a whole-word match needs surrounding spaces: "manila" must not match "manilas".
  const haystack = ` ${text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()} `;

  // Longest first, so "new south wales" is recognised before "wales", and "new york" before
  // any single word inside it.
  for (const name of PLACE_NAMES_BY_LENGTH) {
    if (PLACES[name] === target) continue;
    if (haystack.includes(` ${name} `)) return name;
  }

  return null;
}

export function resolveRegion(location?: string | null, assetUrl?: string | null): string {
  return regionFromLocation(location) ?? regionFromUrl(assetUrl) ?? ALL_REGIONS;
}

export async function searchDuckDuckGo(query: string, region?: string): Promise<SearchResult[]> {
  // `kl` is always set: omitting it lets DuckDuckGo localise by the caller's IP.
  const params = new URLSearchParams({ q: query, kl: region || ALL_REGIONS });
  const searchUrl = `https://html.duckduckgo.com/html/?${params.toString()}`;

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://duckduckgo.com/",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const results: SearchResult[] = [];

  // Try multiple selectors for DuckDuckGo HTML results
  const selectors = [".result", ".web-result", ".results_links", "[data-result]"];

  for (const selector of selectors) {
    if (results.length > 0) break;
    results.length = 0;

    $(selector).each((_, el) => {
      const titleEl = $(el).find(".result__title a, .result__a, h2 a, a.result-link").first();
      const snippetEl = $(el).find(".result__snippet, .result__snippet, .snippet, .result-snippet").first();
      const urlEl = $(el).find(".result__url, .result__url, .url").first();

      let url = titleEl.attr("href") || urlEl.text().trim() || "";

      // Decode DuckDuckGo redirect URLs
      if (url.includes("duckduckgo.com/l/?uddg=")) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) url = decodeURIComponent(match[1]);
      } else if (url.startsWith("//duckduckgo.com/l/?uddg=")) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) url = decodeURIComponent(match[1]);
      }

      // Handle relative URLs
      if (url && !url.startsWith("http")) {
        if (url.startsWith("//")) url = "https:" + url;
        else if (url.startsWith("/")) url = "https://duckduckgo.com" + url;
        else url = "https://" + url;
      }

      const title = titleEl.text().trim();
      const description = snippetEl.text().trim();

      if (url && title && !url.includes("duckduckgo.com")) {
        results.push({ url, title, description });
      }
    });
  }

  // Fallback: try to find any links that look like results
  if (results.length === 0) {
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (href.includes("uddg=")) {
        const match = href.match(/uddg=([^&]+)/);
        if (match) {
          const url = decodeURIComponent(match[1]);
          if (url && text && !url.includes("duckduckgo.com")) {
            results.push({ url, title: text, description: "" });
          }
        }
      }
    });
  }

  return results;
}

export function classifyCompetitor(
  url: string,
  title: string,
  description: string
): "direct" | "functional" | "platform" | "informational" | "ai_generated" {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerDesc = description.toLowerCase();
  const combined = `${lowerUrl} ${lowerTitle} ${lowerDesc}`;

  // Directories, review platforms, and social networks — they list businesses, they aren't one.
  const PLATFORM_DOMAINS = [
    "yelp", "tripadvisor", "angieslist", "bbb.org", "yellowpages", "facebook.com",
    "linkedin.com", "clutch.co", "g2.com", "capterra", "trustpilot", "productreview",
    "google.com/maps", "maps.google", "urbanspoon", "foursquare",
  ];
  if (PLATFORM_DOMAINS.some((d) => combined.includes(d))) {
    return "platform";
  }

  // Comparison and aggregator sites — they sell quotes/leads, not the service itself.
  const COMPARISON_DOMAINS = [
    "comparethemarket", "comparetheflock", "iselect", "canstar", "finder.com",
    "finder.com.au", "savvy.com.au", "mozo", "ratecity", "comparepolicy",
    "business-cover.au", "insurance-finder", "financialservicesonline",
  ];
  const COMPARISON_KEYWORDS = [
    "compare quotes", "compare business insurance", "get free quotes",
    "compare top providers", "compare options", "free quotes online",
    "compare a wide variety", "compare and quote",
  ];
  if (COMPARISON_DOMAINS.some((d) => lowerUrl.includes(d))) {
    return "platform";
  }
  if (COMPARISON_KEYWORDS.some((k) => combined.includes(k))) {
    return "platform";
  }

  // Informational content — dictionaries, guides, blogs, Q&A pages.
  if (combined.includes("wikipedia") || combined.includes("wiki") || combined.includes("blog") || combined.includes("guide") || combined.includes("what is") || combined.includes("how to") || combined.includes("q:") || combined.includes("a:")) {
    return "informational";
  }

  if (combined.includes("chatgpt") || combined.includes("perplexity") || combined.includes("ai answer")) {
    return "ai_generated";
  }

  if (combined.includes("amazon") || combined.includes("ebay") || combined.includes("etsy")) {
    return "functional";
  }

  return "direct";
}
