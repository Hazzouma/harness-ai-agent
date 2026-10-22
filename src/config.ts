import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "./types.js";
export async function loadConfig(): Promise<Config> {
  let x: Partial<Config>;
  try {
    x = JSON.parse(await readFile("config.json", "utf8")) as Partial<Config>;
  } catch {
    throw Error("Copy config.example.json to config.json and configure workspace paths/model.");
  }
  const c: Config = {
    ollama: {
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3-coder:30b",
      timeoutMs: 120000,
      ...x.ollama,
    },
    workspaces: x.workspaces ?? {},
    defaultWorkspace: x.defaultWorkspace ?? "",
    limits: { maxFileBytes: 1000000, shellTimeoutMs: 120000, ...x.limits },
    security: {
      allowShell: true,
      allowNetworkGit: true,
      blockedBranchNames: ["main", "master"],
      ...x.security,
    },
  };
  if (!Object.keys(c.workspaces).length) throw Error("Configure at least one workspace");
  for (const [k, v] of Object.entries(c.workspaces))
    if (!path.isAbsolute(v)) throw Error(`Workspace ${k} must be an absolute path`);
  if (!c.workspaces[c.defaultWorkspace]) c.defaultWorkspace = Object.keys(c.workspaces)[0]!;
  return c;
}
