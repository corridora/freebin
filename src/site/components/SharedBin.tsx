"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { invalidateAll } from "@/components/AppShell";
import "./styles/SharedBin.css";

export default function SharedBin({ data = {}, form }: any) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div data-view="SharedBin">
      <title>
        {data.bin.name}
        {" (Shared) | freebin.org"}
      </title>
      <div className="shared">
        <header>
          <p>{"SHARED BIN"}</p>
          <h1>{data.bin.name}</h1>
          <span>
            {data.interactions.length}
            {" captured requests"}
          </span>
        </header>
        <main>
          {data.interactions.map((item, _index0) => (
            <Fragment key={item.id}>
              <article>
                <button
                  aria-expanded={expanded === item.id}
                  onClick={() =>
                    setExpanded(expanded === item.id ? null : item.id)
                  }
                >
                  <b>{item.method}</b>
                  <code>{item.path}</code>
                  <time>{new Date(item.timestamp).toLocaleString()}</time>
                </button>
                {expanded === item.id ? (
                  <>
                    <div className="details">
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
        </main>
      </div>
    </div>
  );
}
