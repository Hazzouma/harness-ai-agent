import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Config } from "../src/types.js";
import { fileTools } from "../src/tools/files.js";

const config: Config = {
  ollama: { baseUrl: "", model: "", timeoutMs: 0 },
  workspaces: {},
  defaultWorkspace: "",
  limits: { maxFileBytes: 1000, shellTimeoutMs: 0 },
  security: { allowShell: false, allowNetworkGit: false, blockedBranchNames: [] },
};

test("edit_file replaces one exact occurrence in a workspace file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "file-tools-"));
  try {
    await writeFile(path.join(root, "example.ts"), "const value = 1;\n", "utf8");
    const tool = fileTools(config).find((item) => item.definition.function.name === "edit_file");
    assert.ok(tool);
    assert.equal(tool.mutating, true);

    const result = await tool.execute(
      { path: "example.ts", oldText: "value = 1", newText: "value = 2" },
      { workspaceAlias: "test", workspaceRoot: root, askUser: async () => "" }
    );

    assert.deepEqual(result, { ok: true, output: "Edited example.ts" });
    assert.equal(await readFile(path.join(root, "example.ts"), "utf8"), "const value = 2;\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("edit_file rejects ambiguous replacement text", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "file-tools-"));
  try {
    await writeFile(path.join(root, "example.ts"), "value value", "utf8");
    const tool = fileTools(config).find((item) => item.definition.function.name === "edit_file");
    assert.ok(tool);

    await assert.rejects(
      tool.execute(
        { path: "example.ts", oldText: "value", newText: "updated" },
        { workspaceAlias: "test", workspaceRoot: root, askUser: async () => "" }
      ),
      /oldText must match exactly once/
    );
    assert.equal(await readFile(path.join(root, "example.ts"), "utf8"), "value value");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
