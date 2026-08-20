"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";

/**
 * Chooses between the application shell and a bare document canvas.
 *
 * Report routes render with no sidebar, no top bar and no scroll container. This is a
 * structural exclusion rather than `@media print { display: none }`: the previous
 * approach left the shell in the document, and printing produced a first page that was
 * nothing but the left-hand menu. Removing it from the tree means it cannot reach the
 * PDF whatever the print stylesheet does, and the report reads as a document on screen
 * too — which is what it is.
 */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isDocument = pathname.endsWith("/report") || pathname.includes("/report/");
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  if (isDocument) {
    return <div className="report-canvas min-h-full bg-white">{children}</div>;
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
