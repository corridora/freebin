"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { invalidateAll } from "@/components/AppShell";
import "./styles/Header.css";

export default function Header({
  data = {},
  user = null,
  bins = [],
  appVersion,
  body,
  headers = {},
  form,
}: any) {
  const router = useRouter();
  const [binName, setBinName] = useState("");
  const [creatingBin, setCreatingBin] = useState(false);
  const [binError, setBinError] = useState("");
  const binMenu = useRef<HTMLDetailsElement | null>(null);
  function closeBinMenu(event: MouseEvent) {
    if (
      binMenu.current?.open &&
      event.target instanceof Node &&
      !binMenu.current.contains(event.target)
    ) {
      binMenu.current.open = false;
    }
  }
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    await invalidateAll();
    router.replace("/account");
  }
  async function createBin(event: any) {
    event.preventDefault();
    setCreatingBin(true);
    setBinError("");
    const response = await fetch("/api/v1/bins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: binName.trim() || "Untitled bin",
        termsAccepted: true,
      }),
    });
    const result = (await response.json()) as {
      inspectUrl?: string;
      error?: string;
    };
    if (response.ok && result.inspectUrl) {
      setBinName("");
      setCreatingBin(false);
      if (binMenu.current) binMenu.current.open = false;
      await invalidateAll();
      const target = new URL(result.inspectUrl, location.origin);
      router.push(target.pathname + target.search);
      return;
    }
    setBinError(result.error || "Could not create bin");
    setCreatingBin(false);
  }
  useEffect(() => {
    window.addEventListener("click", closeBinMenu);
    return () => window.removeEventListener("click", closeBinMenu);
  }, []);
  return (
    <div data-view="Header">
      <header className="site-header">
        <nav aria-label="Main navigation">
          <Link href="/" aria-label="freebin.org home" className="brand">
            <span aria-hidden="true" className="brand-mark">
              <img src="/freebin.svg" alt="" />
            </span>
            {"freebin.org"}
          </Link>
          <div className="site-links">
            <Link href="/" className="how">
              {"Home"}
            </Link>
            <Link href="/demo">{"Public demo"}</Link>
            <Link href="/docs">{"API docs"}</Link>
            <Link href="/terms" className="terms-link">
              {"Terms"}
            </Link>
            {user ? (
              <>
                {user.isAdmin ? (
                  <>
                    <Link href="/admin">{"Admin"}</Link>
                  </>
                ) : null}
                <details ref={binMenu} className="bin-menu">
                  <summary>{bins.length ? "Bins" : "Create bin"}</summary>
                  <div className="bin-options">
                    {bins.length ? (
                      <>
                        {bins.map((bin, _index0) => (
                          <Fragment key={bin.id}>
                            <Link href={`/bin/${bin.id}`}>{bin.name}</Link>
                          </Fragment>
                        ))}
                      </>
                    ) : null}
                    {bins.length < 5 ? (
                      <>
                        <form onSubmit={createBin} className="create-bin-form">
                          <label htmlFor="header-bin-name">
                            {"Create bin"}
                          </label>
                          <input
                            id="header-bin-name"
                            maxLength={60}
                            placeholder="Bin name"
                            value={binName ?? ""}
                            onChange={(event) => {
                              setBinName(event.currentTarget.value);
                            }}
                          />
                          <button disabled={creatingBin}>
                            {creatingBin ? "Creating…" : "Create bin"}
                          </button>
                          {binError ? (
                            <>
                              <span role="alert" className="bin-error">
                                {binError}
                              </span>
                            </>
                          ) : null}
                        </form>
                      </>
                    ) : null}
                  </div>
                </details>
              </>
            ) : null}
            <Link href="/account" className="account-link">
              {"Account"}
            </Link>
            {user ? (
              <>
                <button onClick={signOut} className="sign-out">
                  {"Sign out"}
                </button>
              </>
            ) : null}
          </div>
        </nav>
      </header>
    </div>
  );
}
