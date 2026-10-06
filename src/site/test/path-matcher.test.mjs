import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPath } from "../server/path-matcher.ts";
test("route matching distinguishes exact, dynamic and capture suffix paths", () => {
  assert.deepEqual(matchPath("/", "/"), {});
  assert.deepEqual(
    matchPath("/shared/request/[token]", "/shared/request/capability"),
    { token: "capability" },
  );
  assert.equal(
    matchPath("/api/v1/bins/[id]", "/api/v1/bins/bin/interactions"),
    null,
  );
  assert.deepEqual(matchPath("/b/[id]/[...path]", "/b/bin/hello/a%20b"), {
    id: "bin",
    path: "hello/a b",
  });
  assert.deepEqual(matchPath("/b/[id]/[...path]", "/b/bin"), {
    id: "bin",
    path: "",
  });
  assert.equal(matchPath("/b/[id]/[...path]", "/not-capture/bin"), null);
  assert.throws(() => matchPath("/bin/[id]", "/bin/%invalid"), URIError);
});
