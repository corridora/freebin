"use client";
import useSWR from "swr";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchJSON } from "./AppShell";
import type { ComponentType } from "react";
import Link from "next/link";
export function PageLoader({
  component: Component,
  route,
  params,
}: {
  component: ComponentType<any>;
  route: string;
  params: Record<string, string>;
}) {
  const search = useSearchParams();
  const router = useRouter();
  const path = route.replace(/\[([^\]]+)\]/g, (_, key) =>
    encodeURIComponent(params[key] || ""),
  );
  const query = search.toString();
  // Inspector filters are local URL state, not a second page-data dependency.
  const target =
    path + (path === "/oauth/authorize" && query ? "?" + query : "");
  const { data, error, isLoading } = useSWR(
    "/api/ui/page?path=" + encodeURIComponent(target),
    fetchJSON,
  );
  useEffect(() => {
    if (data?.redirect) router.replace(data.redirect);
  }, [data?.redirect, router]);
  if (error)
    return (
      <main className="shell page-message" role="alert">
        <h1>Page unavailable</h1>
        <p>{error.message}</p>
        <Link href="/account">Go to account</Link>
      </main>
    );
  if (isLoading || !data || data.redirect)
    return (
      <div className="shell page-message" role="status">
        Loading…
      </div>
    );
  return <Component key={path} data={data} />;
}
