import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "HTTP Request Inspector | freebin.org",
  description:
    "Private request bins, webhook capture, inspection, replay, and developer tooling.",
  icons: { icon: "/freebin.svg" },
  openGraph: {
    title: "freebin.org — Your endpoint is waiting",
    description: "Inspect authenticated development webhooks at the edge.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Suspense fallback={<div className="shell page-message">Loading…</div>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
