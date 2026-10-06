import assert from "node:assert/strict";
import { test } from "node:test";
import { graphLayout, clusterGraph } from "../components/engram-layout.ts";

const node = (id, cluster = 0) => ({
  id,
  label: id,
  file: `src/site/${id}.ts`,
  location: null,
  kind: "code",
  cluster,
});

test("bounded graph retains selected nodes and neighbors without dangling edges", () => {
  const nodes = Array.from({ length: 100 }, (_, i) => node(`n${i}`, i % 3));
  const edges = nodes
    .slice(1)
    .map((n) => ({ source: "n0", target: n.id, relation: "calls" }));
  const view = graphLayout(nodes, edges, "n99", 12);
  const ids = new Set(view.nodes.map((n) => n.id));
  assert.equal(view.nodes.length, 12);
  assert.ok(ids.has("n99") && ids.has("n0"));
  assert.ok(view.edges.every((e) => ids.has(e.source) && ids.has(e.target)));
  assert.ok(
    view.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
  );
  assert.deepEqual(view, graphLayout(nodes, edges, "n99", 12));
});

test("filters and empty or isolated graphs retain only applicable relationships", () => {
  assert.deepEqual(graphLayout([], [], null), { nodes: [], edges: [] });
  const view = graphLayout(
    [node("a")],
    [{ source: "a", target: "outside", relation: "calls" }],
    "outside",
  );
  assert.equal(view.edges.length, 0);
  assert.equal(view.nodes[0].x, 400);
  assert.equal(view.nodes[0].degree, 0);
});

test("cluster graph aggregates cross-cluster relationships and excludes missing endpoints", () => {
  const nodes = [
    node("a", 0),
    node("b", 1),
    node("c", 1),
    node("unclustered", null),
  ];
  const edges = [
    { source: "a", target: "b", relation: "calls" },
    { source: "c", target: "a", relation: "imports" },
    { source: "b", target: "c", relation: "calls" },
    { source: "missing", target: "a", relation: "calls" },
    { source: "unclustered", target: "a", relation: "calls" },
  ];
  const view = clusterGraph(nodes, edges);
  assert.equal(view.total, 2);
  assert.deepEqual(view.edges, [{ source: 0, target: 1, count: 2 }]);
  assert.deepEqual(
    view.groups.map((g) => [g.id, g.count]),
    [
      [1, 2],
      [0, 1],
    ],
  );
});
