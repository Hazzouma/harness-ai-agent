import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { ToolCall } from "../types.js";
export async function approveBatch(calls: ToolCall[]): Promise<boolean> {
  stdout.write("\n=== APPROVAL REQUIRED ===\nApproval applies only to these exact calls:\n");
  calls.forEach((c, i) =>
    stdout.write(`${i + 1}. ${c.name} ${JSON.stringify(c.arguments, null, 2)}\n`)
  );
  const r = createInterface({ input: stdin, output: stdout });
  try {
    return (await r.question("Type yes to approve: ")).trim() === "yes";
  } finally {
    r.close();
  }
}
export async function askUser(question: string): Promise<string> {
  const r = createInterface({ input: stdin, output: stdout });
  try {
    return await r.question(`\nAgent question: ${question}\nAnswer: `);
  } finally {
    r.close();
  }
}
