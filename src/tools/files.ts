import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Config, Tool } from "../types.js";
import { inside } from "../security/paths.js";
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export function fileTools(c: Config): Tool[] {
  return [
    {
      mutating: false,
      definition: {
        type: "function",
        function: {
          name: "list_files",
          description: "List workspace-relative directory entries.",
          parameters: obj({ path: { type: "string" } }),
        },
      },
      async execute(a, x) {
        const es = await readdir(inside(x.workspaceRoot, a.path ?? "."), { withFileTypes: true });
        return {
          ok: true,
          output:
            es
              .slice(0, 300)
              .map((e) => (e.isDirectory() ? "[DIR] " : "") + e.name)
              .join("\n") || "(empty)",
        };
      },
    },
    {
      mutating: false,
      definition: {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a UTF-8 file in workspace.",
          parameters: obj({ path: { type: "string" } }, ["path"]),
        },
      },
      async execute(a, x) {
        const p = inside(x.workspaceRoot, a.path),
          s = await stat(p);
        if (!s.isFile()) throw Error("Not a file");
        if (s.size > c.limits.maxFileBytes) throw Error("File too large");
        return { ok: true, output: await readFile(p, "utf8") };
      },
    },
    {
      mutating: false,
      definition: {
        type: "function",
        function: {
          name: "search_code",
          description: "Search for a substring in workspace text files.",
          parameters: obj({ query: { type: "string" }, path: { type: "string" } }, ["query"]),
        },
      },
      async execute(a, x) {
        const q = String(a.query ?? "");
        if (!q) throw Error("Empty query");
        const hits: string[] = [];
        async function walk(dir: string): Promise<void> {
          if (hits.length >= 100) return;
          for (const e of await readdir(dir, { withFileTypes: true })) {
            if (["node_modules", ".git", "dist", ".venv"].includes(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) await walk(p);
            else if (e.isFile()) {
              try {
                const st = await stat(p);
                if (st.size > c.limits.maxFileBytes) continue;
                (await readFile(p, "utf8")).split(/\r?\n/).forEach((line, i) => {
                  if (line.includes(q) && hits.length < 100)
                    hits.push(
                      `${path.relative(x.workspaceRoot, p)}:${i + 1}: ${line.slice(0, 240)}`
                    );
                });
              } catch {}
            }
          }
        }
        await walk(inside(x.workspaceRoot, a.path ?? "."));
        return { ok: true, output: hits.join("\n") || "No matches" };
      },
    },
    {
      mutating: true,
      definition: {
        type: "function",
        function: {
          name: "write_file",
          description: "Create or replace a UTF-8 file. Requires approval.",
          parameters: obj({ path: { type: "string" }, content: { type: "string" } }, [
            "path",
            "content",
          ]),
        },
      },
      async execute(a, x) {
        const p = inside(x.workspaceRoot, a.path);
        if (typeof a.content !== "string") throw Error("content must be a string");
        if (Buffer.byteLength(a.content) > c.limits.maxFileBytes) throw Error("Content too large");
        await mkdir(path.dirname(p), { recursive: true });
        await writeFile(p, a.content, "utf8");
        return { ok: true, output: "Wrote " + path.relative(x.workspaceRoot, p) };
      },
    },
    {
      mutating: true,
      definition: {
        type: "function",
        function: {
          name: "edit_file",
          description:
            "Replace one exact, unique text occurrence in a UTF-8 workspace file. Requires approval.",
          parameters: obj(
            {
              path: { type: "string" },
              oldText: { type: "string" },
              newText: { type: "string" },
            },
            ["path", "oldText", "newText"]
          ),
        },
      },
      async execute(a, x) {
        const p = inside(x.workspaceRoot, a.path);
        if (typeof a.oldText !== "string" || !a.oldText)
          throw Error("oldText must be a non-empty string");
        if (typeof a.newText !== "string") throw Error("newText must be a string");
        const s = await stat(p);
        if (!s.isFile()) throw Error("Not a file");
        if (s.size > c.limits.maxFileBytes) throw Error("File too large");
        const content = await readFile(p, "utf8");
        const start = content.indexOf(a.oldText);
        if (start === -1) throw Error("oldText was not found");
        if (content.lastIndexOf(a.oldText) !== start)
          throw Error("oldText must match exactly once");
        const updated =
          content.slice(0, start) + a.newText + content.slice(start + a.oldText.length);
        if (Buffer.byteLength(updated) > c.limits.maxFileBytes) throw Error("Content too large");
        await writeFile(p, updated, "utf8");
        return { ok: true, output: "Edited " + path.relative(x.workspaceRoot, p) };
      },
    },
  ];
}
