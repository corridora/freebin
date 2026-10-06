import { createHash } from "node:crypto";
import { posix } from "node:path";

const scope = "src/site/";

function applicationFile(value) {
  if (typeof value !== "string" || !value.startsWith(scope)) return null;
  if (posix.normalize(value) !== value || /[\\\x00-\x1f]/.test(value))
    return null;
  if (
    value === `${scope}worker-configuration.d.ts` ||
    value.startsWith(`${scope}server/generated/`) ||
    value.startsWith(`${scope}artifacts/`) ||
    value.startsWith(`${scope}playwright-report/`) ||
    value.startsWith(`${scope}test-results/`) ||
    value.startsWith(`${scope}coverage/`) ||
    value.startsWith(`${scope}node_modules/`) ||
    value.startsWith(`${scope}dist/`) ||
    /(^|\/)\.[^/]+/.test(value)
  )
    return null;
  return value;
}

function label(value, fallback) {
  return typeof value === "string" &&
    /^[\w .:$<>()\[\],?&|=-]{1,160}$/.test(value)
    ? value
    : fallback;
}

export function buildEngramReport(
  graph,
  {
    generatedAt = new Date().toISOString(),
    graphUpdatedAt = null,
    runtime = {},
    stale = false,
  } = {},
) {
  const nodes = [];
  const identifiers = new Map();
  for (const node of graph?.nodes || []) {
    const file = applicationFile(node.source_file);
    if (!file || typeof node.id !== "string" || identifiers.has(node.id))
      continue;
    const id = `node-${nodes.length}`;
    identifiers.set(node.id, id);
    nodes.push({
      id,
      label: label(node.label, posix.basename(file)),
      file,
      location: /^L\d+(?:-L?\d+)?$/.test(node.source_location || "")
        ? node.source_location
        : null,
      kind: ["code", "rationale", "doc_ref"].includes(node.file_type)
        ? node.file_type
        : "other",
      cluster: Number.isSafeInteger(node.community) ? node.community : null,
    });
  }
  const relationships = [];
  const seen = new Set();
  for (const edge of graph?.links || graph?.edges || []) {
    const source = identifiers.get(edge.source);
    const target = identifiers.get(edge.target);
    if (
      !source ||
      !target ||
      (edge.source_file && !applicationFile(edge.source_file))
    )
      continue;
    const relation = label(edge.relation, "related");
    const key = `${source}:${target}:${relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({ source, target, relation });
  }
  const clusters = [
    ...new Set(
      nodes.map((node) => node.cluster).filter((value) => value !== null),
    ),
  ]
    .sort((a, b) => a - b)
    .map((id) => ({
      id,
      nodes: nodes.filter((node) => node.cluster === id).length,
    }));
  return {
    schemaVersion: 1,
    available: Boolean(graph),
    scope: "src/site",
    generatedAt,
    graphUpdatedAt,
    stale,
    runtime: ["typescript", "python", "javascript"].includes(runtime.runtime)
      ? runtime.runtime
      : "unknown",
    toolVersion: /^[\d]+\.[\d]+\.[\d]+(?:[\w.+-]*)$/.test(runtime.version || "")
      ? runtime.version
      : null,
    sourceDigest: graph
      ? createHash("sha256").update(JSON.stringify(graph)).digest("hex")
      : null,
    totals: {
      nodes: nodes.length,
      relationships: relationships.length,
      files: new Set(nodes.map((node) => node.file)).size,
      clusters: clusters.length,
    },
    clusters,
    nodes,
    relationships,
  };
}
