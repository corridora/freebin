"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { invalidateAll } from "@/components/AppShell";
import "./styles/Account.css";

export default function Account({ data = {}, form }: any) {
  const router = useRouter();
  const [user, setUser] = useState<any>(data.user);
  const [bins, setBins] = useState<any[]>(data.bins);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  let effectiveMode = data.signupsEnabled ? mode : "login";
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [binName, setBinName] = useState("");
  const [apiKeys, setApiKeys] = useState<any[]>(data.apiKeys);
  const [keyName, setKeyName] = useState("");
  const [newKeyToken, setNewKeyToken] = useState("");
  const [copiedBinId, setCopiedBinId] = useState("");
  const [shareBinId, setShareBinId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [invitePermissions, setInvitePermissions] = useState<
    Record<string, boolean>
  >({ "requests.view": true });
  let siteOrigin = data.siteOrigin;
  let returnTo =
    typeof location === "undefined"
      ? ""
      : new URLSearchParams(location.search).get("returnTo") || "";
  let ownBins = bins.filter((bin) => Boolean(Number(bin.isOwner)));
  let sharedBins = bins.filter((bin) => !Boolean(Number(bin.isOwner)));
  let selectedPermissionCount =
    Object.values(invitePermissions).filter(Boolean).length;
  const permissionFeatures: Array<[string, string, string[]]> = [
    ["bin", "Bin settings", ["view", "edit"]],
    ["requests", "Requests", ["view", "delete"]],
    ["exports", "Exports", ["view", "edit"]],
    ["replay", "Replay", ["view", "edit", "delete"]],
    ["forwarding", "Forwarding", ["view", "edit", "delete"]],
    ["rules", "Rules", ["view", "edit", "delete"]],
    ["config", "Portable config", ["view", "edit"]],
    ["sharing", "Public sharing", ["view", "edit", "delete"]],
    ["collaborators", "Collaborators", ["view"]],
    ["audit", "Audit history", ["view"]],
  ];
  function selectPermissionPreset(
    preset: "viewer" | "editor" | "all" | "clear",
  ) {
    setInvitePermissions(
      Object.fromEntries(
        permissionFeatures.flatMap(([feature, , actions]) =>
          (actions as string[])
            .filter(
              (action) =>
                preset === "all" ||
                (preset === "viewer" && action === "view") ||
                (preset === "editor" &&
                  (action === "view" || action === "edit")),
            )
            .map((action) => [`${feature}.${action}`, true]),
        ),
      ),
    );
  }
  function sharedOwners() {
    return [
      ...new Set<string>(sharedBins.map((bin) => String(bin.ownerEmail))),
    ];
  }
  async function load() {
    const r = await fetch("/api/me");
    const d = (await r.json()) as {
      user: any;
      bins: any[];
    };
    setUser(d.user);
    setBins(d.bins);
    if (d.user) {
      const kr = await fetch("/api/account/token");
      if (kr.ok) {
        const kd = (await kr.json()) as {
          keys: any[];
        };
        setApiKeys(kd.keys);
      }
    } else setApiKeys([]);
  }
  async function submit() {
    setBusy(true);
    setError("");
    const r = await fetch(`/api/auth/${effectiveMode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, termsAccepted }),
    });
    const d = (await r.json()) as {
      error?: string;
    };
    if (!r.ok) setError(d.error || "Unable to continue");
    else if (returnTo.startsWith("/oauth/authorize?")) {
      await invalidateAll();
      router.push(returnTo);
    } else {
      setPassword("");
      await load();
      await invalidateAll();
    }
    setBusy(false);
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setBins([]);
    await invalidateAll();
  }
  async function deleteAccount() {
    if (
      !confirm(
        "Delete your account? Your bins will remain accessible only through their private inspector links.",
      )
    )
      return;
    const r = await fetch("/api/me", { method: "DELETE" });
    if (r.ok) {
      setUser(null);
      setBins([]);
      await invalidateAll();
    } else setError("Could not delete account");
  }
  async function createBin() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/v1/bins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: binName.trim() || "Untitled bin",
        termsAccepted: true,
      }),
    });
    const d = (await r.json()) as {
      error?: string;
      inspectUrl?: string;
    };
    if (r.ok && d.inspectUrl) {
      await invalidateAll();
      const target = new URL(d.inspectUrl, location.origin);
      router.push(target.pathname + target.search);
    } else setError(d.error || "Could not create a bin");
    setBusy(false);
  }
  async function createApiKey() {
    setBusy(true);
    setError("");
    setNewKeyToken("");
    const r = await fetch("/api/account/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: keyName.trim() || "API key" }),
    });
    const d = (await r.json()) as {
      error?: string;
      token?: string;
    };
    if (r.ok && d.token) {
      setNewKeyToken(d.token);
      setKeyName("");
      await load();
    } else setError(d.error || "Could not create API key");
    setBusy(false);
  }
  async function deleteApiKey(id: string) {
    const r = await fetch("/api/account/token", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (r.ok) await load();
    else {
      const d = (await r.json()) as {
        error?: string;
      };
      setError(d.error || "Could not revoke API key");
    }
  }
  async function copyBinLink(id: string) {
    await navigator.clipboard.writeText(`${location.origin}/b/${id}`);
    setCopiedBinId(id);
    setTimeout(
      () => setCopiedBinId((previous) => (previous === id ? "" : previous)),
      1400,
    );
  }
  async function loadCollaborators(id: string) {
    const r = await fetch(`/api/v1/bins/${id}/collaborators`);
    const d = (await r.json()) as {
      collaborators?: any[];
    };
    setCollaborators(r.ok ? d.collaborators || [] : []);
  }
  async function openSharing(id: string) {
    const nextShareBinId = shareBinId === id ? "" : id;
    setShareBinId(nextShareBinId);
    setInviteEmail("");
    if (nextShareBinId) await loadCollaborators(nextShareBinId);
  }
  async function saveInvite() {
    const permissions = Object.fromEntries(
      Object.entries(invitePermissions).filter(([, enabled]) => enabled),
    );
    const r = await fetch(`/api/v1/bins/${shareBinId}/collaborators`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, permissions }),
    });
    const d = (await r.json()) as {
      error?: string;
    };
    if (!r.ok) {
      setError(d.error || "Could not share bin");
      return;
    }
    setInviteEmail("");
    await loadCollaborators(shareBinId);
  }
  async function removeCollaborator(id: string) {
    const r = await fetch(`/api/v1/bins/${shareBinId}/collaborators`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collaboratorId: id }),
    });
    if (r.ok) await loadCollaborators(shareBinId);
    else setError("Could not remove collaborator");
  }
  useEffect(() => {
    setUser(data.user);
    setBins(data.bins || []);
    setApiKeys(data.apiKeys || []);
  }, [data]);
  return (
    <div data-view="Account">
      <title>{"Account | freebin.org"}</title>
      <div aria-label="Account" className="account">
        {user ? (
          <>
            <main>
              <div className="account-head">
                <div>
                  <p>{"ACCOUNT"}</p>
                  <h1>{user.email}</h1>
                  <span className="storage">
                    {(user.storageUsedBytes / 1048576).toFixed(2)}
                    {" MB of "}
                    {(user.storageLimitBytes / 1048576).toFixed(0)}
                    {" MB retained"}
                  </span>
                </div>
                <div>
                  <button onClick={logout}>{"Sign out"}</button>
                  <button onClick={deleteAccount} className="delete">
                    {"Delete account"}
                  </button>
                </div>
              </div>
              {error ? (
                <>
                  <p className="error">{error}</p>
                </>
              ) : null}
              <div className="account-grid">
                <section className="add-panel">
                  <h2>{"Add bin"}</h2>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      createBin();
                    }}
                    className="new-bin"
                  >
                    <label htmlFor="new-bin-name">
                      {bins.length
                        ? "Create another endpoint"
                        : "Create your first endpoint"}
                    </label>
                    <div>
                      <input
                        id="new-bin-name"
                        maxLength={60}
                        placeholder="Name your bin"
                        disabled={ownBins.length >= 5}
                        value={binName ?? ""}
                        onChange={(event) => {
                          setBinName(event.currentTarget.value);
                        }}
                      />
                      <button disabled={busy || ownBins.length >= 5}>
                        {ownBins.length >= 5
                          ? "Bin limit reached"
                          : busy
                            ? "Creating…"
                            : "Create bin"}
                      </button>
                    </div>
                  </form>
                </section>
                <section className="list-panel">
                  <h2>
                    {"Your bins "}
                    <span className="bin-count">
                      {ownBins.length}
                      {"/5"}
                    </span>
                  </h2>
                  {ownBins.length ? (
                    <>
                      <div className="bins">
                        {ownBins.map((bin, _index0) => (
                          <Fragment key={bin.binId}>
                            <div className="bin-entry">
                              <div className="bin-row">
                                <Link href={`/bin/${bin.binId}`}>
                                  <strong>{bin.name}</strong>
                                  <span>
                                    {bin.interactionCount}
                                    {" requests"}
                                  </span>
                                  <code>
                                    {siteOrigin}
                                    {"/b/"}
                                    {bin.binId}
                                  </code>
                                </Link>
                                <div className="bin-buttons">
                                  <button
                                    onClick={() => copyBinLink(bin.binId)}
                                  >
                                    {copiedBinId === bin.binId
                                      ? "Copied!"
                                      : "Copy link"}
                                  </button>
                                  <button
                                    onClick={() => openSharing(bin.binId)}
                                  >
                                    {shareBinId === bin.binId
                                      ? "Close"
                                      : "Share"}
                                  </button>
                                </div>
                              </div>
                              {shareBinId === bin.binId ? (
                                <>
                                  <div className="share-panel">
                                    <h3>{"Share with a registered user"}</h3>
                                    <label>
                                      {"Email"}
                                      <input
                                        type="email"
                                        placeholder="person@example.com"
                                        value={inviteEmail ?? ""}
                                        onChange={(event) => {
                                          setInviteEmail(
                                            event.currentTarget.value,
                                          );
                                        }}
                                      />
                                    </label>
                                    <div
                                      aria-label="Permission helpers"
                                      className="permission-presets"
                                    >
                                      <span>{"Quick select"}</span>
                                      <button
                                        onClick={() =>
                                          selectPermissionPreset("viewer")
                                        }
                                        title="Select every view permission"
                                      >
                                        {"Viewer"}
                                      </button>
                                      <button
                                        onClick={() =>
                                          selectPermissionPreset("editor")
                                        }
                                        title="Select view and edit/create permissions"
                                      >
                                        {"Editor"}
                                      </button>
                                      <button
                                        onClick={() =>
                                          selectPermissionPreset("all")
                                        }
                                        title="Select every available permission"
                                      >
                                        {"All"}
                                      </button>
                                      <button
                                        onClick={() =>
                                          selectPermissionPreset("clear")
                                        }
                                        title="Clear every permission"
                                      >
                                        {"Clear selection"}
                                      </button>
                                    </div>
                                    <div className="permission-grid">
                                      {permissionFeatures.map(
                                        (feature, _index1) => (
                                          <Fragment key={_index1}>
                                            <fieldset>
                                              <legend>{feature[1]}</legend>
                                              {feature[2].map(
                                                (action, _index2) => (
                                                  <Fragment key={_index2}>
                                                    <label>
                                                      <input
                                                        type="checkbox"
                                                        checked={Boolean(
                                                          invitePermissions[
                                                            `${feature[0]}.${action}`
                                                          ],
                                                        )}
                                                        onChange={(event) => {
                                                          const checked =
                                                            event.currentTarget
                                                              .checked;
                                                          setInvitePermissions(
                                                            (previous) => ({
                                                              ...previous,
                                                              [`${feature[0]}.${action}`]:
                                                                checked,
                                                            }),
                                                          );
                                                        }}
                                                      />{" "}
                                                      {action === "edit"
                                                        ? "edit / create"
                                                        : action}
                                                    </label>
                                                  </Fragment>
                                                ),
                                              )}
                                            </fieldset>
                                          </Fragment>
                                        ),
                                      )}
                                    </div>
                                    <button
                                      onClick={saveInvite}
                                      disabled={
                                        !inviteEmail ||
                                        selectedPermissionCount === 0
                                      }
                                    >
                                      {"Invite or update"}
                                    </button>
                                    {collaborators.length ? (
                                      <>
                                        <ul>
                                          {collaborators.map(
                                            (collaborator, _index0) => (
                                              <Fragment key={collaborator.id}>
                                                <li>
                                                  <span>
                                                    <strong>
                                                      {collaborator.email}
                                                    </strong>
                                                    <small>
                                                      {Object.keys(
                                                        collaborator.permissions,
                                                      ).join(", ")}
                                                    </small>
                                                  </span>
                                                  <button
                                                    onClick={() =>
                                                      removeCollaborator(
                                                        collaborator.id,
                                                      )
                                                    }
                                                    className="delete"
                                                  >
                                                    {"Remove"}
                                                  </button>
                                                </li>
                                              </Fragment>
                                            ),
                                          )}
                                        </ul>
                                      </>
                                    ) : null}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="muted">
                        {
                          "Create up to five bins. Captured requests and replay history share your account storage allowance."
                        }
                      </p>
                    </>
                  )}
                </section>
                <section className="add-panel">
                  <h2>{"Add API key"}</h2>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      createApiKey();
                    }}
                    className="new-bin"
                  >
                    <label htmlFor="key-name">{"API key name"}</label>
                    <div>
                      <input
                        id="key-name"
                        maxLength={60}
                        placeholder="Local development"
                        disabled={apiKeys.length >= 5}
                        value={keyName ?? ""}
                        onChange={(event) => {
                          setKeyName(event.currentTarget.value);
                        }}
                      />
                      <button disabled={busy || apiKeys.length >= 5}>
                        {apiKeys.length >= 5
                          ? "Key limit reached"
                          : "Create key"}
                      </button>
                    </div>
                  </form>
                </section>
                <section className="list-panel">
                  <h2>
                    {"API keys "}
                    <span className="bin-count">
                      {apiKeys.length}
                      {"/5"}
                    </span>
                  </h2>
                  <p className="muted">
                    {
                      "Every capture requires a bearer key belonging to this account. Keys are shown in full only once."
                    }
                  </p>
                  {newKeyToken ? (
                    <>
                      <div role="status" className="new-token">
                        <strong>{"Copy this key now"}</strong>
                        <code>{newKeyToken}</code>
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(newKeyToken)
                          }
                        >
                          {"Copy"}
                        </button>
                      </div>
                    </>
                  ) : null}
                  {apiKeys.length ? (
                    <>
                      <div className="key-list">
                        {apiKeys.map((key, _index0) => (
                          <Fragment key={_index0}>
                            <div>
                              <span>
                                <strong>{key.name}</strong>
                                <small>
                                  {key.prefix}
                                  {"… · Created "}
                                  {new Date(key.createdAt).toLocaleDateString()}
                                </small>
                              </span>
                              <button
                                onClick={() => deleteApiKey(key.id)}
                                className="delete"
                              >
                                {"Revoke"}
                              </button>
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    </>
                  ) : null}
                </section>
                {sharedBins.length ? (
                  <>
                    <section className="shared-panel">
                      <h2>{"Bins shared with you"}</h2>
                      {sharedOwners().map((ownerEmail, _index0) => (
                        <Fragment key={_index0}>
                          <div className="shared-owner">
                            <h3>{ownerEmail}</h3>
                            <div className="bins">
                              {sharedBins
                                .filter((bin) => bin.ownerEmail === ownerEmail)
                                .map((bin, _index0) => (
                                  <Fragment key={bin.binId}>
                                    <div className="bin-row">
                                      <Link href={`/bin/${bin.binId}`}>
                                        <strong>
                                          {bin.ownerEmail}
                                          {"-"}
                                          {bin.name}
                                        </strong>
                                        <span>
                                          {bin.interactionCount}
                                          {" requests"}
                                        </span>
                                        <code>
                                          {siteOrigin}
                                          {"/b/"}
                                          {bin.binId}
                                        </code>
                                      </Link>
                                    </div>
                                  </Fragment>
                                ))}
                            </div>
                          </div>
                        </Fragment>
                      ))}
                    </section>
                  </>
                ) : null}
              </div>
            </main>
          </>
        ) : (
          <>
            {" "}
            <main className="auth">
              <p className="eyebrow">{"SIMPLE, PRIVATE OWNERSHIP"}</p>
              <h1>
                {effectiveMode === "login"
                  ? "Welcome back."
                  : "Create your account."}
              </h1>
              <p>
                {effectiveMode === "register"
                  ? "Create an account to manage private request bins."
                  : "Manage your bins from any device. No teams, groups, or roles."}
              </p>
              {!data.signupsEnabled ? (
                <>
                  <p role="status" className="signup-closed">
                    {
                      "New account registration is temporarily unavailable. Existing users can still sign in."
                    }
                  </p>
                </>
              ) : null}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <label>
                  {"Email"}
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email ?? ""}
                    onChange={(event) => {
                      setEmail(event.currentTarget.value);
                    }}
                  />
                </label>
                <label>
                  {"Password"}
                  <input
                    type="password"
                    required
                    minLength={10}
                    autoComplete={
                      effectiveMode === "login"
                        ? "current-password"
                        : "new-password"
                    }
                    value={password ?? ""}
                    onChange={(event) => {
                      setPassword(event.currentTarget.value);
                    }}
                  />
                </label>
                {effectiveMode === "register" ? (
                  <>
                    <label className="terms-check">
                      <input
                        type="checkbox"
                        required
                        checked={termsAccepted}
                        onChange={(event) => {
                          setTermsAccepted(event.currentTarget.checked);
                        }}
                      />
                      {" I agree to the "}
                      <Link href="/terms">{"Terms and Conditions"}</Link>
                      {"."}
                    </label>
                  </>
                ) : null}
                {error ? (
                  <>
                    <p className="error">{error}</p>
                  </>
                ) : null}
                <button disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : effectiveMode === "login"
                      ? "Sign in"
                      : "Create account"}
                </button>
              </form>
              {data.signupsEnabled ? (
                <>
                  <button
                    onClick={() => {
                      setMode(mode === "login" ? "register" : "login");
                      setError("");
                      setTermsAccepted(false);
                    }}
                    className="switch"
                  >
                    {mode === "login"
                      ? "Need an account? Sign up"
                      : "Already have an account? Sign in"}
                  </button>
                </>
              ) : null}
            </main>{" "}
          </>
        )}
      </div>
    </div>
  );
}
