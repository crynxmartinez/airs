import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/app-chrome";
import { siteUrl, siteDescription } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AIRS CRM",
  metadataBase: siteUrl,
  description: siteDescription,
  applicationName: "AIRS CRM",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
