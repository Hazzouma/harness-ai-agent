import { spawn } from "node:child_process";
import type { Config, Tool } from "../types.js";
export function shellTools(c: Config): Tool[] {
  return [
    {
      mutating: true,
      definition: {
        type: "function",
        function: {
          name: "run_shell",
          description: "Run a PowerShell command as the current Windows user. Requires approval.",
          parameters: {
            type: "object",
            properties: { command: { type: "string" } },
            required: ["command"],
            additionalProperties: false,
          },
        },
      },
      async execute(a, x) {
        if (!c.security.allowShell) throw Error("Shell disabled");
        const command = String(a.command ?? "").trim();
        if (!command) throw Error("Empty command");
        return await new Promise((resolve) => {
          const child = spawn(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "RemoteSigned",
              "-Command",
              command,
            ],
            { cwd: x.workspaceRoot, windowsHide: true, shell: false }
          );
          let out = "",
            err = "",
            done = false;
          const finish = (v: { ok: boolean; output: string }) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(v);
          };
          const timer = setTimeout(() => {
            child.kill();
            finish({ ok: false, output: `Timed out\n${out}\n${err}` });
          }, c.limits.shellTimeoutMs);
          child.stdout.setEncoding("utf8").on("data", (d: string) => (out += d));
          child.stderr.setEncoding("utf8").on("data", (d: string) => (err += d));
          child.on("error", (e) => finish({ ok: false, output: e.message }));
          child.on("close", (code) =>
            finish({ ok: code === 0, output: `exitCode=${code}\n${out}\n${err}` })
          );
        });
      },
    },
  ];
}
