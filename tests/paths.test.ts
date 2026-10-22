import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveInsideWorkspace, assertSafeBranch } from "../src/security/paths.js";

test("allows a relative path inside workspace", () => {
  assert.equal(resolveInsideWorkspace(path.resolve("repo"), "src/index.ts"), path.resolve("repo/src/index.ts"));
});

test("blocks workspace traversal", () => {
  assert.throws(() => resolveInsideWorkspace(path.resolve("repo"), "../secret.txt"), /escapes/);
});

test("blocks absolute paths", () => {
  assert.throws(() => resolveInsideWorkspace(path.resolve("repo"), path.resolve("secret.txt")), /Absolute/);
});

test("validates branches and blocks protected names", () => {
  assert.equal(assertSafeBranch("feature/fix-login", ["main", "master"]), "feature/fix-login");
  assert.throws(() => assertSafeBranch("main", ["main", "master"]), /blocked/);
  assert.throws(() => assertSafeBranch("../main", ["main", "master"]), /Invalid|blocked/);
});
