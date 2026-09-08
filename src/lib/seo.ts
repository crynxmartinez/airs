import type { Metadata } from "next";

// Vercel supplies the stable production hostname, including during preview builds.
const configuredUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
export const siteUrl = new URL(configuredUrl || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"));
export const siteDescription = "Compare your website with competitors found through AI search. Find content gaps and turn their weaknesses into a clear website improvement plan with AIRS.";
export const canIndex = process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production" && !!configuredUrl);
export function publicMetadata(title: string, description: string, path: string): Metadata {
  const url = new URL(path, siteUrl).toString();
  const images = [{ url: new URL("/airs-social.png", siteUrl).toString(), width: 1200, height: 630, alt: "AIRS CRM — Understand your competitors. Make your next move count." }];
  return { title, description, alternates: { canonical: url }, robots: { index: canIndex, follow: true },
    openGraph: { type: "website", siteName: "AIRS CRM", locale: "en_US", title, description, url, images },
    twitter: { card: "summary_large_image", title, description, images: images.map(i => i.url) } };
}
