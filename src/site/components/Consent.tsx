"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { invalidateAll } from "@/components/AppShell";
import "./styles/Consent.css";

export default function Consent({ data = {}, form }: any) {
  const descriptions: Record<string, string> = {
    "bins:read": "View your bins and request counts",
    "requests:read": "Inspect captured requests, headers, and bodies",
    "replay:write": "Replay captured requests to allowed HTTPS destinations",
  };
  return (
    <div data-view="Consent">
      <title>{"Authorize MCP client | freebin.org"}</title>

      <main>
        <p className="eyebrow">{"MCP AUTHORIZATION"}</p>
        <h1>{"Connect to Freebin"}</h1>
        {data.error ? (
          <>
            <div role="alert" className="error">
              {data.error}
            </div>
          </>
        ) : (
          <>
            {" "}
            {!data.user ? (
              <>
                <p>
                  {"Sign in to review access requested by "}
                  <strong>{data.client?.name}</strong>
                  {"."}
                </p>
                <Link
                  href={`/account?returnTo=${encodeURIComponent(data.returnTo || "/oauth/authorize")}`}
                  className="primary"
                >
                  {"Sign in to continue"}
                </Link>
              </>
            ) : (
              <>
                <p>
                  <strong>{data.client?.name}</strong>
                  {" is requesting access to "}
                  <strong>{data.user.email}</strong>
                  {"."}
                </p>
                <ul>
                  {(data.scopes || []).map((scope, _index0) => (
                    <Fragment key={_index0}>
                      <li>{descriptions[scope] || scope}</li>
                    </Fragment>
                  ))}
                </ul>
                <p className="note">
                  {
                    "Freebin issues a revocable, short-lived access token. Your account API keys are never shared with the client."
                  }
                </p>
                {form?.error ? (
                  <>
                    <div role="alert" className="error">
                      {form.error}
                    </div>
                  </>
                ) : null}
                <form method="POST">
                  <button name="decision" value="allow">
                    {"Allow access"}
                  </button>
                  <button name="decision" value="deny" className="secondary">
                    {"Deny"}
                  </button>
                </form>
              </>
            )}{" "}
          </>
        )}
      </main>
    </div>
  );
}
