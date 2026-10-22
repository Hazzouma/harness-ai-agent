import type { Message, ToolDef, ToolCall } from "../types.js";
export class Ollama {
  constructor(
    private base: string,
    private model: string,
    private timeout: number
  ) {}
  async chat(messages: Message[], tools: ToolDef[]): Promise<Message> {
    const c = new AbortController(),
      timer = setTimeout(() => c.abort(), this.timeout);
    try {
      const r = await fetch(this.base.replace(/\/+$/, "") + "/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.tool_name ? { tool_name: m.tool_name } : {}),
            ...(m.tool_calls
              ? {
                  tool_calls: m.tool_calls.map((t) => ({
                    id: t.id,
                    type: "function",
                    function: { name: t.name, arguments: t.arguments },
                  })),
                }
              : {}),
          })),
          tools,
          stream: false,
        }),
        signal: c.signal,
      });
      if (!r.ok) throw Error(`Ollama HTTP ${r.status}: ${await r.text()}`);
      const b = (await r.json()) as {
        message?: {
          content?: string;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
        };
      };
      if (!b.message) throw Error("Ollama response missing message");
      const calls: ToolCall[] = (b.message.tool_calls ?? [])
        .map((t, i) => ({
          id: t.id ?? `call-${Date.now()}-${i}`,
          name: t.function?.name ?? "",
          arguments:
            typeof t.function?.arguments === "object" &&
            t.function.arguments &&
            !Array.isArray(t.function.arguments)
              ? (t.function.arguments as Record<string, unknown>)
              : typeof t.function?.arguments === "string"
                ? safeJson(t.function.arguments)
                : {},
        }))
        .filter((t) => t.name);
      return {
        role: "assistant",
        content: b.message.content ?? "",
        ...(calls.length ? { tool_calls: calls } : {}),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
function safeJson(s: string): Record<string, unknown> {
  try {
    const x = JSON.parse(s) as unknown;
    return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
