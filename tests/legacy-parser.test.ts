import test from "node:test";
import assert from "node:assert/strict";
import { parseLegacyToolCalls } from "../src/ollama/legacy-parser.js";

test("parses legacy shell tool markup for normal approval handling", () => {
  const calls = parseLegacyToolCalls(
    `<function=run_shell>
<parameter=command>
ls -la
</parameter>
</function>
</tool_call>`
  );
  assert.deepEqual(calls, [
    { id: "legacy-0", name: "run_shell", arguments: { command: "ls -la" } },
  ]);
});

test("does not parse unapproved legacy mutating tools", () => {
  const calls = parseLegacyToolCalls(
    "<function=write_file><parameter=path>file.txt</parameter></function>"
  );
  assert.deepEqual(calls, []);
});
