"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { MarketingChrome } from "@/components/marketing-chrome";

/**
 * Chooses between three shells.
 *
 * **document** — report routes. No sidebar, no top bar, no scroll container. A structural
 * exclusion rather than `@media print { display: none }`: the previous approach left the shell
 * in the document, and printing produced a first page that was nothing but the left-hand menu.
 * Removing it from the tree means it cannot reach the PDF whatever the print stylesheet does,
 * and the report reads as a document on screen too — which is what it is.
 *
 * **marketing** — the public pages and the login screen. A stranger has no use for a sidebar of
 * internal tools, and showing them one would also advertise what is behind the door.
 *
 * **app** — everything else. The sidebar and top bar.
 *
 * Chosen by pathname rather than by Next route groups. Route groups are the more idiomatic way
 * and would be the choice for a new app; here it would mean moving eight existing route folders,
 * and every move is a chance to break an import or a link. This file already worked this way for
 * the report exclusion, so a third branch matches the codebase and costs one `if`.
 *
 * ⚠️ **This decides layout, never access.** `src/proxy.ts` decides who may load a page. If the
 * two lists ever disagree, the proxy wins — a page missing from `MARKETING_PATHS` renders with
 * the wrong chrome, which is cosmetic; a page missing from the proxy allowlist is unreachable,
 * which is safe. Wrong in the harmless direction, by construction.
 */
/** Public pages plus login. Mirrors the allowlist in `src/proxy.ts`. */
const MARKETING_PATHS = new Set(["/", "/about", "/contact", "/login"]);

/**
 * Pages that render with no navigation at all.
 *
 * `/register` is deliberately not in `MARKETING_PATHS`: the marketing header carries About,
 * Contact and Sign in links, and putting them on this page would make it a route into the rest
 * of the site. It is meant to be reachable only by typing the address and to lead nowhere.
 */
const BARE_PATHS = new Set(["/register"]);

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isDocument = pathname.endsWith("/report") || pathname.includes("/report/");
  const isMarketing = MARKETING_PATHS.has(pathname);
  const isBare = BARE_PATHS.has(pathname);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  if (isDocument) {
    return <div className="report-canvas min-h-full bg-white">{children}</div>;
  }

  if (isBare) {
    return <div className="min-h-full">{children}</div>;
  }

  if (isMarketing) {
    return <MarketingChrome>{children}</MarketingChrome>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main ref={mainRef} className="flex-1 overflow-y-auto bg-[var(--background)] p-6">{children}</main>
      </div>
    </div>
  );
}
