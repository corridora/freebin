"use client";
import { useEffect, type ReactNode } from "react";
import useSWR, { mutate } from "swr";
import Header from "./Header";
import Footer from "./Footer";
import Rum from "./Rum";

export async function fetchJSON(url: string) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await response.json()) as Record<string, any>;
  if (!response.ok) throw new Error(data.error || "Unable to load this page");
  return data;
}
export async function invalidateAll() {
  await mutate(
    (key) => typeof key === "string" && key.startsWith("/api/ui/"),
    undefined,
    { revalidate: true },
  );
}
export default function AppShell({ children }: { children: ReactNode }) {
  const { data } = useSWR("/api/ui/layout", fetchJSON);
  useEffect(() => {
    const refresh = () => {
      void invalidateAll();
    };
    window.addEventListener("freebin:session", refresh);
    return () => window.removeEventListener("freebin:session", refresh);
  }, []);
  return (
    <>
      <Header user={data?.headerUser} bins={data?.headerBins || []} />
      <div id="page-content">{children}</div>
      <Footer
        appVersion={data?.appVersion}
        appVersionUrl={data?.appVersionUrl}
      />
      <Rum />
    </>
  );
}
