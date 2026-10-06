"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { invalidateAll } from "@/components/AppShell";
import "./styles/SharedRequest.css";
import RequestBody from "@/components/RequestBody";
export default function SharedRequest({ data = {}, form }: any) {
  const item = data.item;
  return (
    <div data-view="SharedRequest">
      <title>
        {item.method} {item.path}
        {" (Shared) | freebin.org"}
      </title>
      <div className="shared">
        <main>
          <p className="eyebrow">
            {"SHARED REQUEST · "}
            {item.binName}
          </p>
          <div className="title">
            <b>{item.method}</b>
            <h1>{item.path}</h1>
          </div>
          <time>{new Date(item.timestamp).toLocaleString()}</time>
          <h2>{"Headers"}</h2>
          <pre>{JSON.stringify(item.headers, null, 2)}</pre>
          <h2>{"Query parameters"}</h2>
          <pre>{JSON.stringify(item.query, null, 2)}</pre>
          <RequestBody body={item.body} headers={item.headers}></RequestBody>
        </main>
      </div>
    </div>
  );
}
