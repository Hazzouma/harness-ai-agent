import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { finished } from "node:stream/promises";
import type { Config, Tool } from "../types.js";

export function shellTools(c: Config): Tool[] {
  const savedOutputs = new Map<
    string,
    { directory: string; exitCode: number | null; timedOut: boolean }
  >();
  const runToFile = async (
    command: string,
    workspaceRoot: string
  ): Promise<{ directory: string; exitCode: number | null; timedOut: boolean }> => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "harness-shell-output-"));
    const output = createWriteStream(path.join(directory, "output.txt"));
    const outputDone = finished(output);
    outputDone.catch(() => {});
    try {
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-Command", command],
        { cwd: workspaceRoot, windowsHide: true, shell: false }
      );
      let timedOut = false,
        spawnError = "";
      child.stdout.pipe(output, { end: false });
      child.stderr.pipe(output, { end: false });
      child.on("error", (error) => (spawnError = error.message));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, c.limits.shellTimeoutMs);
      let exitCode: number | null;
      try {
        exitCode = await new Promise((resolve) => {
          child.on("close", (code) => resolve(spawnError ? null : code));
        });
      } finally {
        clearTimeout(timer);
      }
      if (spawnError) output.write(`[spawn error] ${spawnError}\n`);
      output.end();
      await outputDone;
      return { directory, exitCode, timedOut };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  };

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
    {
      mutating: true,
      definition: {
        type: "function",
        function: {
          name: "run_shell_to_file",
          description:
            "Run a PowerShell command and save its stdout and stderr in a temporary file for one-time reading. Requires approval.",
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

        const result = await runToFile(command, x.workspaceRoot);
        const id = randomUUID();
        savedOutputs.set(id, result);
        return {
          ok: result.exitCode === 0 && !result.timedOut,
          output: `Shell output saved temporarily. Read it once with read_shell_output using id ${id}.`,
        };
      },
    },
    {
      mutating: false,
      definition: {
        type: "function",
        function: {
          name: "read_shell_output",
          description:
            "Read and delete a temporary output file created by run_shell_to_file. Each output can only be read once.",
          parameters: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
            additionalProperties: false,
          },
        },
      },
      async execute(a) {
        const id = String(a.id ?? "");
        const saved = savedOutputs.get(id);
        if (!saved) throw Error("Unknown or already-read shell output id");
        savedOutputs.delete(id);
        try {
          const output = await readFile(path.join(saved.directory, "output.txt"), "utf8");
          return {
            ok: saved.exitCode === 0 && !saved.timedOut,
            output: `exitCode=${saved.exitCode} timedOut=${saved.timedOut}\n${output}`,
          };
        } finally {
          await rm(saved.directory, { recursive: true, force: true });
        }
      },
    },
  ];
}
