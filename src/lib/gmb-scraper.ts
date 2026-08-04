import { ApifyClient } from "apify-client";

const APIFY_ACTOR_ID = "nwua9Gu5YrADL7ZDj";

export interface GmbBusinessData {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  reviewsCount: number;
  categoryName: string;
  categories: string[];
  isOpen: boolean;
  openingHours: string[];
  latitude: number;
  longitude: number;
  url: string;
  photoCount: number;
  reviewCount: number;
  questionCount: number;
  description: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  priceLevel: string;
  temporarilyClosed: boolean;
  permanentlyClosed: boolean;
  rank: number;
}

export interface GmbScrapeResult {
  businesses: GmbBusinessData[];
  totalFound: number;
  searchQuery: string;
  location: string;
}

function getClient(): ApifyClient {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error("APIFY_TOKEN is not set in environment variables");
  }
  return new ApifyClient({ token });
}

export async function scrapeGoogleMaps(
  searchQuery: string,
  location: string,
  maxResults: number = 20
): Promise<GmbScrapeResult> {
  const client = getClient();

  const input = {
    searchStringsArray: [searchQuery],
    locationQuery: location,
    maxCrawledPlacesPerSearch: maxResults,
    language: "en",
    website: "allPlaces",
    skipClosedPlaces: false,
    scrapePlaceDetailPage: true,
    maxReviews: 5,
    reviewsSort: "newest",
    maxImages: 0,
    maxQuestions: 0,
    scrapeContacts: false,
    enableCompetitorAnalysis: false,
  };

  const run = await client.actor(APIFY_ACTOR_ID).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const businesses: GmbBusinessData[] = items.map((item: Record<string, unknown>, index: number) => ({
    placeId: (item.placeId as string) || (item.id as string) || "",
    name: (item.title as string) || "",
    address: (item.address as string) || "",
    phone: (item.phone as string) || "",
    website: (item.website as string) || "",
    rating: (item.totalScore as number) || 0,
    reviewsCount: (item.reviewsCount as number) || 0,
    categoryName: (item.categoryName as string) || "",
    categories: (item.categories as string[]) || [],
    isOpen: (item.openState as string) === "open",
    openingHours: (item.openingHours as string[]) || [],
    latitude: (item.location as { lat: number })?.lat || 0,
    longitude: (item.location as { lng: number })?.lng || 0,
    url: (item.url as string) || "",
    photoCount: (item.imageCount as number) || 0,
    reviewCount: (item.reviewsCount as number) || 0,
    questionCount: (item.questionsCount as number) || 0,
    description: (item.description as string) || "",
    neighborhood: (item.neighborhood as string) || "",
    city: (item.city as string) || "",
    state: (item.state as string) || "",
    postalCode: (item.postalCode as string) || "",
    countryCode: (item.countryCode as string) || "",
    priceLevel: (item.priceLevel as string) || "",
    temporarilyClosed: (item.temporaryClosed as boolean) || false,
    permanentlyClosed: (item.permanentlyClosed as boolean) || false,
    rank: index + 1,
  }));

  return {
    businesses,
    totalFound: businesses.length,
    searchQuery,
    location,
  };
}

export interface GmbCompetitorAnalysis {
  yourBusiness: GmbBusinessData | null;
  competitors: GmbBusinessData[];
  rankInResults: number | null;
  avgRating: number;
  avgReviewCount: number;
  topRated: GmbBusinessData | null;
  mostReviewed: GmbBusinessData | null;
}

export function analyzeGmbCompetitors(
  businesses: GmbBusinessData[],
  yourWebsiteUrl?: string
): GmbCompetitorAnalysis {
  let yourBusiness: GmbBusinessData | null = null;

  if (yourWebsiteUrl) {
    const normalized = yourWebsiteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    yourBusiness = businesses.find((b) => {
      if (!b.website) return false;
      const bNorm = b.website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
      return bNorm.includes(normalized) || normalized.includes(bNorm);
    }) || null;
  }

  const competitors = businesses.filter((b) => b.placeId !== yourBusiness?.placeId);

  const rated = businesses.filter((b) => b.rating > 0);
  const avgRating = rated.length > 0
    ? Math.round((rated.reduce((s, b) => s + b.rating, 0) / rated.length) * 10) / 10
    : 0;
  const avgReviewCount = businesses.length > 0
    ? Math.round(businesses.reduce((s, b) => s + b.reviewsCount, 0) / businesses.length)
    : 0;

  const topRated = rated.length > 0
    ? rated.reduce((best, b) => (b.rating > best.rating ? b : best))
    : null;
  const mostReviewed = businesses.length > 0
    ? businesses.reduce((most, b) => (b.reviewsCount > most.reviewsCount ? b : most))
    : null;

  return {
    yourBusiness,
    competitors,
    rankInResults: yourBusiness?.rank || null,
    avgRating,
    avgReviewCount,
    topRated,
    mostReviewed,
  };
}
