"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { invalidateAll } from "@/components/AppShell";
import "./styles/Demo.css";

export default function Demo({ data = {}, form }: any) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingMethod, setSendingMethod] = useState<string | null>(null);
  const [sampleResult, setSampleResult] = useState("");
  const sampleMethods = ["POST", "GET", "DELETE", "PATCH", "OPTIONS"];
  async function sendSample(method: string) {
    setSendingMethod(method);
    setSampleResult("");
    const hasBody = method === "POST" || method === "PATCH";
    try {
      const response = await fetch(
        `/b/${data.demoBinId}/sample/${method.toLowerCase()}`,
        {
          method,
          headers: {
            authorization: `Bearer ${data.demoApiKey}`,
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
      const result = await response.text();
      setSampleResult(
        response.ok
          ? `${method} captured — ${response.status} ${response.statusText}`
          : `${method} failed — ${response.status} ${result}`,
      );
      if (response.ok) await invalidateAll();
    } catch {
      setSampleResult(`${method} failed — could not reach the demo endpoint`);
    } finally {
      setSendingMethod(null);
    }
  }
  return (
    <div data-view="Demo">
      <title>{"Public Demo | freebin.org"}</title>
      <meta
        name="description"
        content="Public, redacted HTTP requests captured by freebin.org anonymous demo bins."
      />

      <main className="policy-page">
        <header>
          <p className="eyebrow">{"PUBLIC DEMO DATA"}</p>
          <h1>{"Shared request history."}</h1>
          <p>
            {
              "Requests sent to the public demo bin appear here for demonstration and learning. Common credential fields are redacted, but you must never send secrets or personal data."
            }
          </p>
        </header>
        <section
          aria-labelledby="sample-requests-title"
          className="sample-requests"
        >
          <div>
            <p className="eyebrow">{"TRY IT NOW"}</p>
            <h2 id="sample-requests-title">{"Send a sample request."}</h2>
            <p>
              {"Choose a method to send it to "}
              <code>{data.demoBinId}</code>
              {
                ". Successful requests appear in the shared history below. The demo shares a 1 request/second limit."
              }
            </p>
          </div>
          <div className="sample-actions">
            {sampleMethods.map((method, _index0) => (
              <Fragment key={_index0}>
                <button
                  disabled={sendingMethod !== null}
                  onClick={() => sendSample(method)}
                  className={[sendingMethod === method ? "active" : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {sendingMethod === method ? "Sending…" : method}
                </button>
              </Fragment>
            ))}
          </div>
          {sampleResult ? (
            <>
              <p role="status" className="sample-result">
                {sampleResult}
              </p>
            </>
          ) : null}
        </section>
        <section aria-label="Recent public requests" className="demo-list">
          {data.interactions.length ? (
            <>
              {data.interactions.map((item, _index0) => (
                <Fragment key={item.id}>
                  <article>
                    <button
                      aria-expanded={expandedId === item.id}
                      onClick={() =>
                        setExpandedId(expandedId === item.id ? null : item.id)
                      }
                    >
                      <span className="method">{item.method}</span>
                      <strong>{item.path}</strong>
                      <span>
                        {item.binName}
                        {" · "}
                        {item.binId}
                      </span>
                      <time>{new Date(item.timestamp).toLocaleString()}</time>
                    </button>
                    {expandedId === item.id ? (
                      <>
                        <div className="demo-details">
                          <h2>{"Headers"}</h2>
                          <pre>{JSON.stringify(item.headers, null, 2)}</pre>
                          <h2>{"Query"}</h2>
                          <pre>{JSON.stringify(item.query, null, 2)}</pre>
                          <h2>{"Body"}</h2>
                          <pre>{item.body || "(empty)"}</pre>
                        </div>
                      </>
                    ) : null}
                  </article>
                </Fragment>
              ))}
            </>
          ) : (
            <>
              <p className="empty">
                {"No public demo requests have been retained yet."}
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
