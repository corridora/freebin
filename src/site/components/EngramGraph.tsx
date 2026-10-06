"use client";
import { useId, useMemo } from "react";
import {
  graphLayout,
  clusterGraph,
  type GraphNode,
  type GraphEdge,
} from "./engram-layout";

const colors = [
  "#c3482c",
  "#286d56",
  "#435a9d",
  "#8c4a81",
  "#936815",
  "#267583",
];
function color(cluster: number | null) {
  return colors[Math.abs(cluster ?? 0) % colors.length];
}

export default function EngramGraph({
  nodes,
  allNodes,
  relationships,
  selected,
  cluster,
  onSelect,
  onCluster,
}: {
  nodes: GraphNode[];
  allNodes: GraphNode[];
  relationships: GraphEdge[];
  selected: string | null;
  cluster: string;
  onSelect: (id: string) => void;
  onCluster: (id: string) => void;
}) {
  const markerId = useId();
  const graph = useMemo(
    () => graphLayout(nodes, relationships, selected),
    [nodes, relationships, selected],
  );
  const overview = useMemo(
    () => clusterGraph(allNodes, relationships),
    [allNodes, relationships],
  );
  const positions = new Map(graph.nodes.map((node) => [node.id, node]));
  const clusters = new Map(overview.groups.map((group) => [group.id, group]));
  return (
    <div className="engram-visualizations">
      <figure>
        <figcaption>
          <h3>Cluster connections</h3>
          <p>
            {overview.groups.length} of {overview.total} clusters · Select a
            cluster to filter nodes. Lines show relationships between clusters.
          </p>
        </figcaption>
        <svg
          viewBox="0 0 800 480"
          role="group"
          aria-label="Engram cluster graph"
        >
          {overview.edges.map((edge) => (
            <line
              key={`${edge.source}:${edge.target}`}
              x1={clusters.get(edge.source)!.x}
              y1={clusters.get(edge.source)!.y}
              x2={clusters.get(edge.target)!.x}
              y2={clusters.get(edge.target)!.y}
              stroke="#c9cec6"
              strokeWidth={Math.min(8, 1 + Math.log2(edge.count))}
            >
              <title>
                {edge.count} relationships between clusters {edge.source} and{" "}
                {edge.target}
              </title>
            </line>
          ))}
          {overview.groups.map((group) => (
            <g
              key={group.id}
              role="button"
              tabIndex={0}
              aria-label={`Filter cluster ${group.id}, ${group.count} nodes`}
              aria-pressed={cluster === String(group.id)}
              onClick={() =>
                onCluster(cluster === String(group.id) ? "" : String(group.id))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onCluster(
                    cluster === String(group.id) ? "" : String(group.id),
                  );
                }
              }}
            >
              <circle
                cx={group.x}
                cy={group.y}
                r={Math.min(24, 10 + Math.sqrt(group.count))}
                fill={color(group.id)}
                stroke={cluster === String(group.id) ? "#17231d" : "#fffdf8"}
                strokeWidth={3}
              />
              <text
                x={group.x}
                y={group.y + 4}
                textAnchor="middle"
                fill="white"
                fontSize={12}
              >
                {group.id}
              </text>
              <title>
                Cluster {group.id}: {group.count} nodes
              </title>
            </g>
          ))}
        </svg>
      </figure>
      <figure>
        <figcaption>
          <h3>Node relationships</h3>
          <p aria-live="polite">
            Showing {graph.nodes.length} of {nodes.length} matching nodes and{" "}
            {graph.edges.length} relationships. Select a node to inspect it; its
            neighbors take priority. Arrows follow relationship direction.
          </p>
        </figcaption>
        {!nodes.length ? (
          <p className="report-note">
            No graph nodes match the current filters.
          </p>
        ) : (
          <svg
            viewBox="0 0 800 480"
            role="group"
            aria-label="Engram relationship graph"
          >
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX={14}
                refY={5}
                markerWidth={5}
                markerHeight={5}
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#929e96" />
              </marker>
            </defs>
            {graph.edges.map((edge, index) => (
              <line
                key={index}
                x1={positions.get(edge.source)!.x}
                y1={positions.get(edge.source)!.y}
                x2={positions.get(edge.target)!.x}
                y2={positions.get(edge.target)!.y}
                stroke={
                  edge.source === selected || edge.target === selected
                    ? "#c3482c"
                    : "#c9cec6"
                }
                strokeOpacity={
                  selected &&
                  edge.source !== selected &&
                  edge.target !== selected
                    ? 0.25
                    : 0.7
                }
                markerEnd={`url(#${markerId})`}
              >
                <title>
                  {positions.get(edge.source)!.label} → {edge.relation} →{" "}
                  {positions.get(edge.target)!.label}
                </title>
              </line>
            ))}
            {graph.nodes.map((node) => (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${node.label} in ${node.file}${node.location ? `:${node.location}` : ""}`}
                aria-pressed={selected === node.id}
                onClick={() => onSelect(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(node.id);
                  }
                }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={selected === node.id ? 12 : 7}
                  fill={color(node.cluster)}
                  stroke={selected === node.id ? "#17231d" : "#fffdf8"}
                  strokeWidth={2}
                />
                {(selected === node.id || graph.nodes.length <= 12) && (
                  <text
                    x={node.x}
                    y={node.y - 18}
                    textAnchor="middle"
                    fill="#17231d"
                    fontSize={12}
                  >
                    {node.label.length > 25
                      ? node.label.slice(0, 24) + "…"
                      : node.label}
                  </text>
                )}
                <title>
                  {node.label} · {node.file} · {node.degree} relationships
                </title>
              </g>
            ))}
          </svg>
        )}
      </figure>
    </div>
  );
}
