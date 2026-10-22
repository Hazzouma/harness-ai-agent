import type { ToolCall } from "../types.js";
const allowed = new Set(["list_files", "read_file", "search_code", "git_status", "git_diff"]);
export function parseLegacyReads(s: string): ToolCall[] {
  const out: ToolCall[] = [];
  const re = /<function=([a-zA-Z0-9_]+)>\s*([\s\S]*?)\s*<\/function>/g;
  for (const m of s.matchAll(re)) {
    const name = m[1] ?? "";
    if (!allowed.has(name)) continue;
    const args: Record<string, unknown> = {};
    for (const a of (m[2] ?? "").matchAll(
      /<parameter=([a-zA-Z0-9_]+)>\s*([\s\S]*?)\s*<\/parameter>/g
    )) {
      const raw = (a[2] ?? "").trim();
      try {
        args[a[1]!] = JSON.parse(raw) as unknown;
      } catch {
        args[a[1]!] = raw;
      }
    }
    out.push({ id: `legacy-${out.length}`, name, arguments: args });
  }
  return out;
}
