"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { invalidateAll } from "@/components/AppShell";
import "./styles/RequestBody.css";

export default function RequestBody({
  data = {},
  user = null,
  bins = [],
  appVersion,
  body,
  headers = {},
  form,
  readOnly = false,
}: any) {
  const compressedBodyPrefix = "freebin:base64:";
  const [decompressed, setDecompressed] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showingDecompressed, setShowingDecompressed] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentEncoding = String(
    headers["content-encoding"] || headers["Content-Encoding"] || "",
  ).toLowerCase();
  const isGzip = contentEncoding
    .split(",")
    .map((value) => value.trim())
    .includes("gzip");
  const displayedBody =
    showingDecompressed && decompressed !== null ? decompressed : body || "";
  function formatBody(value: string) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  async function showDecompressed() {
    if (readOnly) return;
    if (decompressed !== null) {
      setShowingDecompressed(true);
      return;
    }
    setError("");
    if (!body?.startsWith(compressedBodyPrefix)) {
      setError(
        "This compressed request was captured before lossless compressed-body storage was enabled.",
      );
      return;
    }
    setLoading(true);
    try {
      const encoded = body.slice(compressedBodyPrefix.length);
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      setDecompressed(formatBody(await new Response(stream).text()));
      setShowingDecompressed(true);
    } catch {
      setError("Unable to decompress this gzip request body.");
    } finally {
      setLoading(false);
    }
  }
  async function copyBody() {
    if (readOnly) return;
    if (!displayedBody) return;
    await navigator.clipboard.writeText(displayedBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div data-view="RequestBody">
      <div className="body-heading">
        <h2>{"Body"}</h2>
        <div className="body-actions">
          {isGzip ? (
            <>
              {showingDecompressed ? (
                <>
                  <button
                    disabled={readOnly}
                    type="button"
                    onClick={() => setShowingDecompressed(false)}
                  >
                    {"Show compressed"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={showDecompressed}
                    disabled={readOnly || loading}
                  >
                    {loading ? "Decompressing…" : "Show decompressed"}
                  </button>
                </>
              )}
            </>
          ) : null}
          <button
            type="button"
            onClick={copyBody}
            disabled={readOnly || !displayedBody}
            aria-label="Copy request body"
          >
            {copied ? "Copied!" : "Copy body"}
          </button>
        </div>
      </div>
      {error ? (
        <>
          <p role="alert" className="body-error">
            {error}
          </p>
        </>
      ) : null}
      <pre>{displayedBody || "(empty)"}</pre>
    </div>
  );
}
