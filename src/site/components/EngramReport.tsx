"use client";
import { useMemo, useState } from "react";

type GraphNode = {
  id: string;
  label: string;
  file: string;
  location: string | null;
  kind: string;
  cluster: number | null;
};
type Snapshot = {
  available: boolean;
  scope: string;
  generatedAt: string;
  graphUpdatedAt: string | null;
  stale: boolean;
  runtime: string;
  toolVersion: string | null;
  sourceDigest: string | null;
  totals: {
    nodes: number;
    relationships: number;
    files: number;
    clusters: number;
  };
  clusters: { id: number; nodes: number }[];
  nodes: GraphNode[];
  relationships: { source: string; target: string; relation: string }[];
};
const pageSize = 30;

export default function EngramReport({ report }: { report?: Snapshot }) {
  const [query, setQuery] = useState("");
  const [cluster, setCluster] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (report?.nodes || []).filter(
      (node) =>
        (!cluster || node.cluster === Number(cluster)) &&
        (!search ||
          `${node.label} ${node.file} ${node.kind}`
            .toLowerCase()
            .includes(search)),
    );
  }, [report, query, cluster]);
  const byId = useMemo(
    () => new Map((report?.nodes || []).map((node) => [node.id, node])),
    [report],
  );
  const node = selected ? byId.get(selected) : undefined;
  const connections = useMemo(
    () =>
      (report?.relationships || [])
        .filter((edge) => edge.source === selected || edge.target === selected)
        .map((edge) => ({
          ...edge,
          direction: edge.source === selected ? "Outgoing" : "Incoming",
          other: byId.get(edge.source === selected ? edge.target : edge.source),
        })),
    [report, selected, byId],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, totalPages - 1);

  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "freebin-engram-report.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="engram-report" aria-labelledby="engram-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">APPLICATION KNOWLEDGE GRAPH</p>
          <h2 id="engram-title">Engram report</h2>
        </div>
        {report?.available && (
          <button type="button" className="report-button" onClick={download}>
            Download JSON
          </button>
        )}
      </div>
      {!report?.available ? (
        <p className="report-note" role="status">
          No Engram graph was available for this build.
        </p>
      ) : (
        <>
          <p className="report-note">
            A deployment snapshot of the Next.js application. Generated runtime
            types and report artifacts are excluded. Updates appear with the
            next build.
          </p>
          {report.stale && (
            <p className="report-warning" role="status">
              The source graph was marked stale when this snapshot was created.
            </p>
          )}
          <dl className="graph-totals">
            {Object.entries(report.totals).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <details className="report-metadata">
            <summary>Snapshot details</summary>
            <dl>
              <div>
                <dt>Scope</dt>
                <dd>
                  <code>{report.scope}</code>
                </dd>
              </div>
              <div>
                <dt>Graph updated</dt>
                <dd>
                  {report.graphUpdatedAt
                    ? new Date(report.graphUpdatedAt).toLocaleString()
                    : "Unknown"}
                </dd>
              </div>
              <div>
                <dt>Snapshot built</dt>
                <dd>{new Date(report.generatedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Extractor</dt>
                <dd>
                  {report.runtime}
                  {report.toolVersion ? ` · ${report.toolVersion}` : ""}
                </dd>
              </div>
              <div>
                <dt>Source SHA-256</dt>
                <dd>
                  <code>{report.sourceDigest}</code>
                </dd>
              </div>
            </dl>
          </details>
          <div className="graph-filters">
            <label>
              Search nodes
              <input
                type="search"
                value={query}
                placeholder="Name, file, or kind"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label>
              Cluster
              <select
                value={cluster}
                onChange={(event) => {
                  setCluster(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All clusters</option>
                {report.clusters.map((item) => (
                  <option key={item.id} value={item.id}>
                    Cluster {item.id} ({item.nodes})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="graph-browser">
            <div>
              <div className="table-wrap">
                <table aria-label="Engram nodes">
                  <thead>
                    <tr>
                      <th>Node</th>
                      <th>File</th>
                      <th>Cluster</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .slice(
                        visiblePage * pageSize,
                        (visiblePage + 1) * pageSize,
                      )
                      .map((item) => (
                        <tr key={item.id}>
                          <td>
                            <button
                              type="button"
                              className="node-button"
                              aria-pressed={item.id === selected}
                              onClick={() => setSelected(item.id)}
                            >
                              {item.label}
                            </button>
                            <span className="node-kind">{item.kind}</span>
                          </td>
                          <td>
                            <code>
                              {item.file}
                              {item.location ? `:${item.location}` : ""}
                            </code>
                          </td>
                          <td>{item.cluster ?? "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!filtered.length && (
                <p className="report-note" role="status">
                  No nodes match these filters.
                </p>
              )}
              <nav className="graph-pagination" aria-label="Engram node pages">
                <span aria-live="polite">
                  {filtered.length} nodes · Page {visiblePage + 1} of{" "}
                  {totalPages}
                </span>
                <div>
                  <button
                    type="button"
                    className="report-button"
                    disabled={visiblePage === 0}
                    onClick={() => setPage(visiblePage - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="report-button"
                    disabled={visiblePage + 1 >= totalPages}
                    onClick={() => setPage(visiblePage + 1)}
                  >
                    Next
                  </button>
                </div>
              </nav>
            </div>
            <aside
              className="node-details"
              aria-label="Selected node relationships"
              aria-live="polite"
            >
              {!node ? (
                <p>Select a node to inspect its relationships.</p>
              ) : (
                <>
                  <h3>{node.label}</h3>
                  <code>
                    {node.file}
                    {node.location ? `:${node.location}` : ""}
                  </code>
                  <p>{connections.length} relationships</p>
                  {!connections.length && (
                    <p>No relationships were recorded within this scope.</p>
                  )}
                  <ul>
                    {connections.map(
                      (edge, index) =>
                        edge.other && (
                          <li key={index}>
                            <span>
                              {edge.direction} · {edge.relation}
                            </span>
                            <button
                              type="button"
                              className="node-button"
                              onClick={() => setSelected(edge.other!.id)}
                            >
                              {edge.other.label}
                            </button>
                            <code>{edge.other.file}</code>
                          </li>
                        ),
                    )}
                  </ul>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
