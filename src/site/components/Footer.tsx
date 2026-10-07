"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { invalidateAll } from "@/components/AppShell";

export default function Footer({
  data = {},
  user = null,
  bins = [],
  appVersion,
  body,
  headers = {},
  form,
}: any) {
  return (
    <div data-view="Footer">
      <footer className="footer shell">
        <span>{"© 2026 freebin.org"}</span>
        <span>
          <Link href="/demo">{"Public demo"}</Link>
          {" ·\n    "}
          <Link href="/terms">{"Terms"}</Link>
          {" ·\n    "}
          <a
            href="https://github.com/corridora/freebin"
            target="_blank"
            rel="noreferrer"
          >
            {"GitHub"}
          </a>
          {" ·\n    Version: "}
          {appVersion || "---"}
        </span>
      </footer>
    </div>
  );
}
