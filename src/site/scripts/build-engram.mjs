import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  cpSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const packageFile = resolve(
  dirname(require.resolve("@sentropic/engram")),
  "../package.json",
);
const cli = resolve(dirname(packageFile), "dist/cli.js");
const temporary = mkdtempSync(resolve(tmpdir(), "freebin-engram-"));
const output = resolve(root, "src/site/artifacts/engram");

try {
  // CI intentionally supplies no semantic results: documentation and images
  // require the interactive skill, while this graph describes code structure.
  const semantic = resolve(temporary, "semantic.json");
  writeFileSync(
    semantic,
    JSON.stringify({
      nodes: [],
      edges: [],
      hyperedges: [],
      input_tokens: 0,
      output_tokens: 0,
    }),
  );
  // Fresh output avoids mixing this checkout with a developer's curated graph.
  execFileSync(
    process.execPath,
    [
      cli,
      "extract",
      root,
      "--out",
      temporary,
      "--scope",
      "auto",
      "--no-description",
      "--no-label",
      "--semantic",
      semantic,
      ...[
        "**/worker-configuration.d.ts",
        "**/server/generated/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/coverage/**",
        "**/artifacts/**",
        "**/dist/**",
        "**/node_modules/**",
      ].flatMap((pattern) => ["--exclude", pattern]),
    ],
    { cwd: root, stdio: "inherit" },
  );
  const state = resolve(temporary, ".engram");
  writeFileSync(
    resolve(state, ".graphify_runtime.json"),
    JSON.stringify(
      {
        runtime: "typescript",
        package: "@sentropic/engram",
        version: JSON.parse(readFileSync(packageFile, "utf8")).version,
      },
      null,
      2,
    ) + "\n",
  );
  // Validate and snapshot before replacing the last successful build artifacts.
  execFileSync(
    process.execPath,
    [resolve(root, "src/site/scripts/snapshot-engram.mjs")],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ENGRAM_DIRECTORY: state, ENGRAM_REQUIRED: "true" },
    },
  );
  mkdirSync(output, { recursive: true });
  for (const name of [
    "graph.json",
    "GRAPH_REPORT.md",
    ".graphify_runtime.json",
  ]) {
    cpSync(resolve(state, name), resolve(output, name));
  }
  console.log(`Engram build artifacts: ${output}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
