import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Config, Tool } from "../types.js";
import { safeBranch } from "../security/paths.js";
const ex = promisify(execFile);
const p = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
async function git(cwd: string, args: string[], timeout = 30000) {
  const r = await ex("git", args, { cwd, timeout, windowsHide: true, maxBuffer: 2_000_000 });
  return (r.stdout + "\n" + r.stderr).trim();
}
export function gitTools(c: Config): Tool[] {
  return [
    {
      mutating: false,
      definition: {
        type: "function",
        function: { name: "git_status", description: "Show git status.", parameters: p({}) },
      },
      async execute(_a, x) {
        return { ok: true, output: await git(x.workspaceRoot, ["status", "--short", "--branch"]) };
      },
    },
    {
      mutating: false,
      definition: {
        type: "function",
        function: {
          name: "git_diff",
          description: "Show unstaged diff (bounded preview).",
          parameters: p({}),
        },
      },
      async execute(_a, x) {
        return {
          ok: true,
          output:
            (
              (await git(x.workspaceRoot, ["diff", "--stat"])) +
              "\n" +
              (await git(x.workspaceRoot, ["diff"])).slice(0, 16000)
            ).trim() || "No diff",
        };
      },
    },
    {
      mutating: true,
      definition: {
        type: "function",
        function: {
          name: "git_create_branch",
          description: "Create and switch to a feature branch. Requires approval.",
          parameters: p({ branch: { type: "string" } }, ["branch"]),
        },
      },
      async execute(a, x) {
        const b = safeBranch(a.branch, c.security.blockedBranchNames);
        return { ok: true, output: await git(x.workspaceRoot, ["switch", "-c", b]) };
      },
    },
    {
      mutating: true,
      definition: {
        type: "function",
        function: {
          name: "git_commit",
          description: "Stage all changes and commit. Requires approval; inspect git status first.",
          parameters: p({ message: { type: "string" } }, ["message"]),
        },
      },
      async execute(a, x) {
        const m = String(a.message ?? "").trim();
        if (!m || m.startsWith("-")) throw Error("Invalid commit message");
        await git(x.workspaceRoot, ["add", "-A"]);
        return { ok: true, output: await git(x.workspaceRoot, ["commit", "-m", m]) };
      },
    },
    {
      mutating: true,
      definition: {
        type: "function",
        function: {
          name: "git_push",
          description: "Push current branch to origin. Requires approval.",
          parameters: p({}),
        },
      },
      async execute(_a, x) {
        if (!c.security.allowNetworkGit) throw Error("Network Git disabled");
        const b = (await git(x.workspaceRoot, ["branch", "--show-current"])).trim();
        if (c.security.blockedBranchNames.some((n) => n.toLowerCase() === b.toLowerCase()))
          throw Error("Refusing protected branch push");
        return {
          ok: true,
          output: await git(x.workspaceRoot, ["push", "-u", "origin", b], c.limits.shellTimeoutMs),
        };
      },
    },
    {
      mutating: true,
      definition: {
        type: "function",
        function: {
          name: "create_pr",
          description:
            "Create a GitHub pull request with gh CLI. Requires approval; does not merge.",
          parameters: p(
            {
              title: { type: "string" },
              body: { type: "string" },
              base: { type: "string" },
              draft: { type: "boolean" },
            },
            ["title", "body"]
          ),
        },
      },
      async execute(a, x) {
        if (!c.security.allowNetworkGit) throw Error("Network Git disabled");
        const b = (await git(x.workspaceRoot, ["branch", "--show-current"])).trim();
        if (c.security.blockedBranchNames.some((n) => n.toLowerCase() === b.toLowerCase()))
          throw Error("Refusing PR from protected branch");
        const args = ["pr", "create", "--title", String(a.title), "--body", String(a.body)];
        if (a.base) args.push("--base", String(a.base));
        if (a.draft === true) args.push("--draft");
        const r = await ex("gh", args, {
          cwd: x.workspaceRoot,
          timeout: c.limits.shellTimeoutMs,
          windowsHide: true,
        });
        return { ok: true, output: r.stdout + r.stderr };
      },
    },
  ];
}
