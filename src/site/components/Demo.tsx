"use client";
import useSWR from "swr";
import { fetchJSON } from "./AppShell";
import Inspector from "./Inspector";

export default function Demo({ data = {} }: any) {
  const { data: snapshot } = useSWR("/api/ui/page?path=%2Fdemo", fetchJSON, {
    fallbackData: data,
    refreshInterval: 5000,
  });
  return <Inspector data={snapshot || data} readOnly />;
}
