"use client";
import { Fragment } from "react";
import "./styles/Admin.css";
import EngramReport from "./EngramReport";

export default function Admin({ data = {}, form }: any) {
  const formatBytes = (value: unknown) => {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };
  return (
    <div data-view="Admin">
      <title>{"Admin | freebin.org"}</title>
      <meta name="robots" content="noindex, nofollow" />

      <main className="admin">
        <header>
          <div>
            <p className="eyebrow">{"ADMINISTRATION"}</p>
            <h1>{"Service overview."}</h1>
          </div>
          <span>
            {"Signed in as "}
            {data.admin.email}
          </span>
        </header>

        <section aria-label="Service totals" className="totals">
          <article>
            <span>{"Users"}</span>
            <strong>{Number(data.totals?.userCount) || 0}</strong>
          </article>
          <article>
            <span>{"Bins"}</span>
            <strong>{Number(data.totals?.binCount) || 0}</strong>
          </article>
          <article>
            <span>{"Requests"}</span>
            <strong>{Number(data.totals?.requestCount) || 0}</strong>
          </article>
          <article>
            <span>{"Retained"}</span>
            <strong>{formatBytes(data.totals?.retainedBytes)}</strong>
          </article>
        </section>


        <section aria-labelledby="users-title" className="users">
          <div className="section-head">
            <h2 id="users-title">{"Users"}</h2>
            <span>{"Latest 250 accounts"}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{"Email"}</th>
                  <th>{"Created"}</th>
                  <th>{"Bins"}</th>
                  <th>{"Requests"}</th>
                  <th>{"Retained"}</th>
                  <th>{"Limit"}</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user, _index0) => (
                  <Fragment key={_index0}>
                    <tr>
                      <td>{user.email}</td>
                      <td>
                        {new Date(String(user.createdAt)).toLocaleString()}
                      </td>
                      <td>{Number(user.binCount) || 0}</td>
                      <td>{Number(user.requestCount) || 0}</td>
                      <td>{formatBytes(user.retainedBytes)}</td>
                      <td>{formatBytes(user.storageLimitBytes)}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <EngramReport report={data.engram} />
      </main>
    </div>
  );
}
