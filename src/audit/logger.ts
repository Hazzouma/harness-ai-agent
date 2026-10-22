import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
export async function audit(event: Record<string, unknown>): Promise<void> {
  const file = path.resolve("logs/audit.jsonl");
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(
    file,
    JSON.stringify({ time: new Date().toISOString(), ...event }) + "\n",
    "utf8"
  );
}
