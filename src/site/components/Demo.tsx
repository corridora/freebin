"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetchJSON } from "./AppShell";
import Inspector from "./Inspector";
import "./styles/Demo.css";

const sampleMethods = ["POST", "GET", "DELETE", "PATCH", "OPTIONS"];

export default function Demo({ data = {} }: any) {
  const { data: snapshot, mutate: refreshSnapshot } = useSWR(
    "/api/ui/page?path=%2Fdemo",
    fetchJSON,
    {
      fallbackData: data,
      refreshInterval: 5000,
    },
  );
  const current = snapshot || data;
  const [sendingMethod, setSendingMethod] = useState<string | null>(null);
  const [sampleResult, setSampleResult] = useState<{
    message: string;
    error: boolean;
  } | null>(null);

  async function sendSample(method: string) {
    if (sendingMethod || !current.demoApiKey) return;
    setSendingMethod(method);
    const hasBody = method === "POST" || method === "PATCH";
    try {
      const response = await fetch(
        `/b/${encodeURIComponent(current.id)}/sample/${method.toLowerCase()}`,
        {
          method,
          headers: {
            authorization: `Bearer ${current.demoApiKey}`,
            ...(hasBody ? { "content-type": "application/json" } : {}),
          },
          body: hasBody
            ? JSON.stringify({
                method,
                message: `Hello from the ${method} demo`,
              })
            : undefined,
        },
      );
      const captured = response.headers.get("x-freebin-captured") === "true";
      setSampleResult({
        message: captured
          ? `${method} captured — ${response.status} ${response.statusText}`
          : `${method} failed — ${response.status} ${(await response.text()).slice(0, 500)}`,
        error: !captured,
      });
      if (captured) await refreshSnapshot().catch(() => undefined);
    } catch {
      setSampleResult({
        message: `${method} failed — could not reach the demo endpoint`,
        error: true,
      });
    } finally {
      setSendingMethod(null);
    }
  }

  return (
    <div data-view="Demo">
      <section
        aria-labelledby="sample-requests-title"
        className="sample-requests"
      >
        <div>
          <p className="eyebrow">TRY IT NOW</p>
          <h2 id="sample-requests-title">Send a sample request.</h2>
          <p>
            Choose a method to send example data to <code>{current.id}</code>.
            Captured requests appear in the public history below. The demo’s
            shared rate limit applies.
          </p>
        </div>
        <div
          className="sample-actions"
          aria-label="Sample request methods"
          aria-busy={sendingMethod !== null}
        >
          {sampleMethods.map((method) => (
            <button
              key={method}
              type="button"
              disabled={sendingMethod !== null || !current.demoApiKey}
              onClick={() => sendSample(method)}
              aria-label={`Send ${method} sample request`}
            >
              {method}
            </button>
          ))}
        </div>
        <p
          role="status"
          className={`sample-result${!sendingMethod && sampleResult?.error ? " error" : ""}`}
        >
          {sendingMethod
            ? `Sending ${sendingMethod} sample request…`
            : sampleResult?.message ||
              (!current.demoApiKey
                ? "The demo endpoint is currently unavailable."
                : "")}
        </p>
      </section>
      <Inspector data={current} readOnly />
    </div>
  );
}
