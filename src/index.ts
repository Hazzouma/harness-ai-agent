import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadConfig } from "./config.js";
import { Agent } from "./agent.js";
import { Registry } from "./tools/registry.js";
import { fileTools } from "./tools/files.js";
import { gitTools } from "./tools/git.js";
import { shellTools } from "./tools/shell.js";
import { userTools } from "./tools/user.js";
async function main() {
  const c = await loadConfig(),
    r = new Registry();
  for (const t of [...fileTools(c), ...gitTools(c), ...shellTools(c), ...userTools]) r.add(t);
  const agent = new Agent(c, r);
  console.log(
    `Local Coding Agent Harness / ${c.ollama.model}\nWorkspace: ${c.defaultWorkspace}\nType /exit to quit.`
  );
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const q = (await rl.question("\nTask> ")).trim();
      if (q === "/exit") break;
      if (q) await agent.task(q);
    }
  } finally {
    rl.close();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
