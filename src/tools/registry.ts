import type { Tool, ToolDef, ToolCall, Result, Context } from "../types.js";
export class Registry {
  private map = new Map<string, Tool>();
  add(t: Tool) {
    const n = t.definition.function.name;
    if (this.map.has(n)) throw Error("Duplicate tool " + n);
    this.map.set(n, t);
  }
  definitions(): ToolDef[] {
    return [...this.map.values()].map((t) => t.definition);
  }
  get(n: string) {
    return this.map.get(n);
  }
  mutating(c: ToolCall) {
    const t = this.get(c.name);
    if (!t) throw Error("Unknown tool " + c.name);
    return t.mutating;
  }
  async run(c: ToolCall, x: Context): Promise<Result> {
    const t = this.get(c.name);
    if (!t) return { ok: false, output: "Unknown tool " + c.name };
    try {
      return await t.execute(c.arguments, x);
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) };
    }
  }
}
