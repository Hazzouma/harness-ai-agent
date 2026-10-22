export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface Result {
  ok: boolean;
  output: string;
}
export interface Config {
  ollama: { baseUrl: string; model: string; timeoutMs: number };
  workspaces: Record<string, string>;
  defaultWorkspace: string;
  limits: { maxFileBytes: number; shellTimeoutMs: number };
  security: { allowShell: boolean; allowNetworkGit: boolean; blockedBranchNames: string[] };
}
export interface Context {
  workspaceAlias: string;
  workspaceRoot: string;
  askUser: (q: string) => Promise<string>;
}
export interface Tool {
  definition: ToolDef;
  mutating: boolean;
  execute: (args: Record<string, unknown>, ctx: Context) => Promise<Result>;
}
