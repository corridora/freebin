export type GraphNode = {
  id: string;
  label: string;
  file: string;
  location: string | null;
  kind: string;
  cluster: number | null;
};
export type GraphEdge = { source: string; target: string; relation: string };

// Bound the SVG, while retaining every node in the searchable table.
export function graphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  selected: string | null,
  limit = 60,
) {
  const allowed = new Set(nodes.map((node) => node.id));
  const scopedEdges = edges.filter(
    (edge) => allowed.has(edge.source) && allowed.has(edge.target),
  );
  const degree = new Map<string, number>();
  for (const edge of scopedEdges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  const neighbors = new Set<string>();
  for (const edge of scopedEdges) {
    if (edge.source === selected) neighbors.add(edge.target);
    if (edge.target === selected) neighbors.add(edge.source);
  }
  const ranked = [...nodes]
    .sort((a, b) => {
      const priority = (node: GraphNode) =>
        node.id === selected ? 2 : neighbors.has(node.id) ? 1 : 0;
      return (
        priority(b) - priority(a) ||
        (degree.get(b.id) || 0) - (degree.get(a.id) || 0) ||
        a.id.localeCompare(b.id)
      );
    })
    .slice(0, Math.max(1, limit));
  // Keep clusters adjacent; selecting a node puts its neighbors in this bounded view.
  ranked.sort(
    (a, b) => (a.cluster ?? -1) - (b.cluster ?? -1) || a.id.localeCompare(b.id),
  );
  const positioned = ranked.map((node, index) => {
    const angle = (2 * Math.PI * index) / ranked.length - Math.PI / 2;
    return {
      ...node,
      x: ranked.length === 1 ? 400 : 400 + 300 * Math.cos(angle),
      y: ranked.length === 1 ? 240 : 240 + 175 * Math.sin(angle),
      degree: degree.get(node.id) || 0,
    };
  });
  const visible = new Set(positioned.map((node) => node.id));
  return {
    nodes: positioned,
    edges: scopedEdges.filter(
      (edge) => visible.has(edge.source) && visible.has(edge.target),
    ),
  };
}

export function clusterGraph(nodes: GraphNode[], edges: GraphEdge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node.cluster]));
  const groups = new Map<number, number>();
  for (const node of nodes)
    if (node.cluster !== null)
      groups.set(node.cluster, (groups.get(node.cluster) || 0) + 1);
  const links = new Map<
    string,
    { source: number; target: number; count: number }
  >();
  for (const edge of edges) {
    const a = byId.get(edge.source),
      b = byId.get(edge.target);
    if (a == null || b == null || a === b) continue;
    const [source, target] = a < b ? [a, b] : [b, a];
    const key = `${source}:${target}`;
    const link = links.get(key) || { source, target, count: 0 };
    link.count++;
    links.set(key, link);
  }
  const ranked = [...groups]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 36);
  const positions = ranked.map(([id, count], index) => {
    const angle = (2 * Math.PI * index) / ranked.length - Math.PI / 2;
    return {
      id,
      count,
      x: ranked.length === 1 ? 400 : 400 + 285 * Math.cos(angle),
      y: ranked.length === 1 ? 240 : 240 + 170 * Math.sin(angle),
    };
  });
  const shown = new Set(positions.map((group) => group.id));
  return {
    groups: positions,
    edges: [...links.values()].filter(
      (edge) => shown.has(edge.source) && shown.has(edge.target),
    ),
    total: groups.size,
  };
}
