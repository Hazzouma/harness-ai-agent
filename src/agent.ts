import type { Config, Message, ToolCall, Result } from "./types.js";
import { Ollama } from "./ollama/client.js";
import { parseLegacyToolCalls } from "./ollama/legacy-parser.js";
import { approveBatch, askUser } from "./approval/terminal.js";
import { audit } from "./audit/logger.js";
import { Registry } from "./tools/registry.js";

const system = `You are a local coding assistant. Use tools to inspect repository facts and verify changes. Never claim success unless tool results confirm it. Paths are relative to the configured workspace. Read-only tools need no approval; mutating tools require explicit user approval. Use ask_user for important missing decisions and wait for the answer. Do not print fake tool-call markup; use structured tool calls.`;

export class Agent {
  private client: Ollama;
  private messages: Message[] = [{ role: "system", content: system }];
  constructor(
    private c: Config,
    private r: Registry
  ) {
    this.client = new Ollama(c.ollama.baseUrl, c.ollama.model, c.ollama.timeoutMs);
  }
  async task(task: string) {
    const alias = this.c.defaultWorkspace,
      root = this.c.workspaces[alias]!;
    this.messages.push({ role: "user", content: `Workspace: ${alias}\nTask: ${task}` });
    await audit({ event: "task_started", workspace: alias, task });
    for (let turn = 0; turn < 40; turn++) {
      const m = await this.client.chat(this.messages, this.r.definitions());
      let calls = m.tool_calls ?? [];
      if (!calls.length) calls = parseLegacyToolCalls(m.content);
      this.messages.push({
        role: "assistant",
        content: m.content,
        ...(calls.length ? { tool_calls: calls } : {}),
      });
      if (!calls.length) {
        console.log("\nAgent:\n" + (m.content || "(empty response)"));
        await audit({ event: "task_finished", turns: turn + 1 });
        return;
      }
      const known = calls.filter((x) => this.r.get(x.name)),
        mut = known.filter((x) => this.r.mutating(x)),
        reads = known.filter((x) => !this.r.mutating(x));
      const approved = mut.length ? await approveBatch(mut) : true;
      await audit({
        event: "approval",
        approved,
        calls: mut.map((x) => ({ name: x.name, args: x.arguments })),
      });
      const ctx = { workspaceAlias: alias, workspaceRoot: root, askUser };
      const results: Array<{ call: ToolCall; result: Result }> = [];
      for (const call of [...reads, ...mut]) {
        const result =
          this.r.mutating(call) && !approved
            ? { ok: false, output: "Not executed: batch was not approved." }
            : await this.r.run(call, ctx);
        results.push({ call, result });
        await audit({
          event: "tool",
          name: call.name,
          ok: result.ok,
          args: call.arguments,
          output: result.output.slice(0, 2000),
        });
      }
      for (const call of calls.filter((x) => !this.r.get(x.name)))
        results.push({ call, result: { ok: false, output: `Unknown tool ${call.name}` } });
      for (const { call, result } of results)
        this.messages.push({ role: "tool", tool_name: call.name, content: JSON.stringify(result) });
    }
    console.log("Stopped after 40 model turns.");
    await audit({ event: "task_stopped", reason: "max_turns" });
  }
}
