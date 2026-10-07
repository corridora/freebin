"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { invalidateAll } from "@/components/AppShell";
import "./styles/Home.css";

export default function Home({ data = {}, form }: any) {
  const [origin, setOrigin] = useState("https://freebin.org");
  useEffect(() => setOrigin(window.location.origin), []);
  const sampleRequest = `curl -X POST ${origin}/b/${data.demoBinId || "YOUR_BIN_ID"}/hello \\
  -H "authorization: Bearer ${data.demoBinId ? data.demoApiKey : "YOUR_API_KEY"}" \\
  -H "content-type: application/json" \\
  -d '{"message":"hello from freebin"}'`;
  const [copied, setCopied] = useState(false);
  async function copySample() {
    await navigator.clipboard.writeText(sampleRequest);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div data-view="Home">
      <title>{"HTTP Request Inspector | freebin.org"}</title>

      <div className="shell">
        <main>
          <section className="hero">
            <div>
              <p className="eyebrow">
                {"Private by default · Built for developers"}
              </p>
              <h1>
                {"Your endpoint is "}
                <em>{"waiting."}</em>
              </h1>
              <p className="lede">
                {
                  "Create an account, add an endpoint, and inspect exactly what arrived. User bins are private by default with higher limits."
                }
              </p>
              <Link href="/account" className="primary account-cta">
                {data.signupsEnabled ? "Create a free account →" : "Sign in →"}
              </Link>
              <p className="fine">
                {data.signupsEnabled
                  ? "Create an account to start using private request bins."
                  : "New registrations are temporarily paused."}
              </p>
            </div>
            <div aria-label="Example captured webhook" className="terminal">
              <div className="terminal-top">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
              <div className="code">
                <div>
                  <span className="green">{"POST"}</span>
                  {` /b/${data.demoBinId || "k7p2x9m4d1"}`}
                </div>
                <div className="dim">
                  {`authorization: Bearer ${data.demoBinId ? data.demoApiKey : "••••••••"}`}
                </div>
                <div className="dim">{"content-type: application/json"}</div>
                <div className="dim">{"user-agent: Stripe/1.0"}</div>
                <br />
                <div>{`{`}</div>
                <div>
                  <span className="orange">{'"type"'}</span>
                  {': "payment.succeeded",'}
                </div>
                <div>
                  <span className="orange">{'"amount"'}</span>
                  {": 4200,"}
                </div>
                <div>
                  <span className="orange">{'"currency"'}</span>
                  {': "usd"'}
                </div>
                <div>{`}`}</div>
                <br />
                <div className="green">{"✓ Captured just now"}</div>
              </div>
            </div>
          </section>
          <section aria-labelledby="quickstart-title" className="quickstart">
            <div>
              <p className="eyebrow">{"SEND YOUR FIRST REQUEST"}</p>
              <h2 id="quickstart-title">
                {data.demoBinId
                  ? "Post to the live demo."
                  : "Copy, replace, run."}
              </h2>
              {data.demoBinId ? (
                <>
                  <p>
                    <ol><li>{"Copy this command"}</li>
                      <li>{"Run from the terminal"}</li>
                      <li>{"View in the"} <Link href="/demo">{"shared public history"}</Link></li>
                    </ol>
                    <small>{"Demo shares a 1 request/second and 20 KB payload."}</small>
                  </p>
                </>
              ) : (
                <>
                  <p>
                    {"Replace "}
                    <code>{"YOUR_BIN_ID"}</code>
                    {" and "}
                    <code>{"YOUR_API_KEY"}</code>
                    {" with values from your account."}
                  </p>
                </>
              )}
            </div>
            <div className="sample">
              <button
                onClick={copySample}
                aria-label="Copy sample curl request"
              >
                {copied ? "Copied!" : "Copy curl"}
              </button>
              <pre>{sampleRequest}</pre>
            </div>
          </section>
          <section id="how" className="features">
            <article className="feature">
              <span className="feature-num">{"01 / CREATE"}</span>
              <h2>{"Start with an account"}</h2>
              <p>{"Create private-by-default endpoints from your account."}</p>
            </article>
            <article className="feature">
              <span className="feature-num">{"02 / SEND"}</span>
              <h2>{"Any HTTP request"}</h2>
              <p>{"POST, PUT, PATCH, custom headers, query strings, JSON or plain text"}</p>
              <h4>{"We catch it."}</h4>
            </article>
            <article className="feature">
              <span className="feature-num">{"03 / INSPECT"}</span>
              <h2>{"See every detail"}</h2>
              <p>
                {
                  "Method, path, headers, body, IP, and timestamp in a focused developer-friendly view."
                }
              </p>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
