import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Config } from "../src/types.js";
import { fileTools } from "../src/tools/files.js";
import { shellTools } from "../src/tools/shell.js";

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

test("run_shell_to_file saves output for one-time reading and deletes it", async () => {
  const shellConfig = {
    ...config,
    security: { ...config.security, allowShell: true },
    limits: { ...config.limits, shellTimeoutMs: 10000 },
  };
  const tools = shellTools(shellConfig);
  const run = tools.find((item) => item.definition.function.name === "run_shell_to_file");
  const read = tools.find((item) => item.definition.function.name === "read_shell_output");
  assert.ok(run);
  assert.ok(read);

  const context = {
    workspaceAlias: "test",
    workspaceRoot: process.cwd(),
    askUser: async () => "",
  };
  const saved = await run.execute({ command: "Write-Output ('x' * 12000)" }, context);
  assert.equal(saved.ok, true);
  const id = saved.output.match(/id ([0-9a-f-]+)/)?.[1];
  assert.ok(id);

  const output = await read.execute({ id }, context);
  assert.equal(output.ok, true);
  assert.ok(output.output.length > config.limits.maxFileBytes);
  assert.match(output.output, /x{100}/);
  await assert.rejects(read.execute({ id }, context), /Unknown or already-read/);
});
