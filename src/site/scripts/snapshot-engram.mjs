import {
  existsSync,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { projectRoot } from "./cloudflare-config.mjs";
import { buildEngramReport } from "./engram-report.mjs";

const directory = process.env.ENGRAM_DIRECTORY
  ? resolve(process.env.ENGRAM_DIRECTORY)
  : resolve(projectRoot, "../../.engram");
const graphFile = resolve(directory, "graph.json");
function read(name) {
  const file = resolve(directory, name);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}
const report = buildEngramReport(read("graph.json"), {
  graphUpdatedAt: existsSync(graphFile)
    ? statSync(graphFile).mtime.toISOString()
    : null,
  runtime: read(".graphify_runtime.json") || {},
  stale:
    existsSync(resolve(directory, "needs_update")) ||
    read("branch.json")?.stale === true,
});
if (
  process.env.ENGRAM_REQUIRED === "true" &&
  (!report.available || !report.nodes.length)
) {
  throw new Error("Engram generation did not produce an application graph.");
}
const output = resolve(projectRoot, "server/generated/engram-report.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  report.available
    ? `Engram admin snapshot: ${report.totals.nodes} nodes, ${report.totals.relationships} relationships, ${report.totals.files} application files.`
    : "Engram graph unavailable; the admin page will show an empty report state.",
);
