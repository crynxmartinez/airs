import type { MetadataRoute } from "next";
import { canIndex, siteUrl } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  return { rules: canIndex ? { userAgent: "*", allow: ["/$", "/about$", "/contact$", "/airs-social.png", "/airs-logo.svg", "/icon.svg", "/_next/"], disallow: "/" } : { userAgent: "*", disallow: "/" }, sitemap: new URL("/sitemap.xml", siteUrl).toString() };
}
