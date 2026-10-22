import type { Tool } from "../types.js";
export const userTools: Tool[] = [
  {
    mutating: false,
    definition: {
      type: "function",
      function: {
        name: "ask_user",
        description: "Ask the user a clarifying question and wait for the answer.",
        parameters: {
          type: "object",
          properties: { question: { type: "string" } },
          required: ["question"],
          additionalProperties: false,
        },
      },
    },
    async execute(a, x) {
      const q = String(a.question ?? "").trim();
      if (!q) return { ok: false, output: "Question is empty" };
      return { ok: true, output: await x.askUser(q) };
    },
  },
];
